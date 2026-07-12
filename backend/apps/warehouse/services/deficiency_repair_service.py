"""
Sorunlu / yanlış, eksik veya hatalı eksik listesi kayıtlarını tespit eder ve yapılandırılmış şekilde onarır.

Örnek senaryolar:
- ORDERED durumunda bağlı aktif satın alma siparişi yok (PO silinmiş)
- ORDERED iken bağlı PO RECEIVED / PARTIALLY_RECEIVED (durum uyumsuzluğu)
- PENDING/APPROVED açık rapor; tüm kalemler artık minimum üstünde (bayat)
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Literal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

OrderedAction = Literal['revert_to_approved', 'cancel', 'soft_delete']
StaleAction = Literal['cancel', 'soft_delete']

ORDERED_ACTIONS: frozenset[str] = frozenset({'revert_to_approved', 'cancel', 'soft_delete'})
STALE_ACTIONS: frozenset[str] = frozenset({'cancel', 'soft_delete'})


def _normalize_ordered_action(value: str | None) -> OrderedAction:
    action = (value or 'revert_to_approved').strip().lower()
    if action not in ORDERED_ACTIONS:
        return 'revert_to_approved'
    return action  # type: ignore[return-value]


def _normalize_stale_action(value: str | None) -> StaleAction:
    action = (value or 'cancel').strip().lower()
    if action not in STALE_ACTIONS:
        return 'cancel'
    return action  # type: ignore[return-value]


def _record_repair_audit(
    *,
    record_audit,
    action: str,
    report,
    issue: str,
    repair_action: str,
    before_status: str,
    after_status: str | None,
    deleted: bool = False,
) -> None:
    branch = report.target_warehouse.branches.filter(is_active=True).order_by('name').first()
    try:
        record_audit(
            action=action,
            target_instance=report,
            before_json={'status': before_status, 'report_number': report.report_number},
            after_json={
                'status': after_status,
                'report_number': report.report_number,
                'issue': issue,
                'repair_action': repair_action,
                'deleted': deleted,
            },
            actor=None,
            branch=branch,
        )
    except Exception:
        logger.exception('Eksik listesi onarım denetim kaydı oluşturulamadı (%s)', action)


def _all_items_above_minimum(report) -> bool:
    from apps.warehouse.models import WarehouseStockLevel

    items = list(report.items.filter(is_active=True))
    if not items:
        return True

    stock_ids = [item.stock_item_id for item in items]
    levels = WarehouseStockLevel.objects.filter(
        warehouse_id=report.target_warehouse_id,
        stock_item_id__in=stock_ids,
        is_active=True,
    )
    level_map = {level.stock_item_id: level for level in levels}

    for item in items:
        level = level_map.get(item.stock_item_id)
        if level is None:
            return False
        if level.is_low_stock:
            return False
    return True


def _active_purchase_orders(report):
    return list(report.purchase_orders.filter(is_active=True).order_by('-updated_at'))


def _classify_report(report) -> str | None:
    from apps.warehouse.models import (
        DeficiencyReportStatus,
        PurchaseOrderStatus,
    )

    active_pos = _active_purchase_orders(report)
    status = report.status

    if status == DeficiencyReportStatus.ORDERED and active_pos:
        po_statuses = {po.status for po in active_pos}
        if PurchaseOrderStatus.RECEIVED in po_statuses:
            return 'status_mismatch_po_received'
        if PurchaseOrderStatus.PARTIALLY_RECEIVED in po_statuses:
            return 'status_mismatch_po_partial'

    if status == DeficiencyReportStatus.ORDERED and not active_pos:
        return 'orphan_ordered'

    if status in (DeficiencyReportStatus.PENDING, DeficiencyReportStatus.APPROVED):
        if _all_items_above_minimum(report):
            return 'stale_open'

    return None


def _apply_ordered_action(report, action: OrderedAction) -> tuple[str | None, bool]:
    from apps.warehouse.models import DeficiencyReportStatus

    if action == 'revert_to_approved':
        report.status = DeficiencyReportStatus.APPROVED
        report.save(update_fields=['status', 'updated_at'])
        return report.status, False

    if action == 'cancel':
        report.status = DeficiencyReportStatus.CANCELLED
        report.save(update_fields=['status', 'updated_at'])
        return report.status, False

    report.delete()
    return None, True


def _apply_stale_action(report, action: StaleAction) -> tuple[str | None, bool]:
    from apps.warehouse.models import DeficiencyReportStatus

    if action == 'cancel':
        report.status = DeficiencyReportStatus.CANCELLED
        report.save(update_fields=['status', 'updated_at'])
        return report.status, False

    report.delete()
    return None, True


def _apply_status_mismatch(report, issue: str) -> tuple[str, bool]:
    from apps.warehouse.models import DeficiencyReportStatus

    if issue == 'status_mismatch_po_received':
        report.status = DeficiencyReportStatus.COMMITTED
    else:
        report.status = DeficiencyReportStatus.PARTIALLY_COMMITTED
    report.save(update_fields=['status', 'updated_at'])
    return report.status, False


def repair_orphan_deficiency_reports(
    *,
    enabled: bool | None = None,
    min_age_hours: int | None = None,
    ordered_action: str | None = None,
    stale_enabled: bool | None = None,
    stale_action: str | None = None,
) -> dict[str, Any]:
    """
  Sorunlu eksik listelerini onarır.

  ``enabled`` None ise ``settings.DEFICIENCY_REPAIR_ENABLED`` okunur.
  """
    from apps.audit.services import record_audit
    from apps.warehouse.models import DeficiencyReport, DeficiencyReportStatus
    from apps.warehouse.ws_broadcast import schedule_deficiency_status_changed

    if enabled is None:
        enabled = getattr(settings, 'DEFICIENCY_REPAIR_ENABLED', False)

    if min_age_hours is None:
        min_age_hours = getattr(settings, 'DEFICIENCY_REPAIR_MIN_AGE_HOURS', 24)

    ordered_action_value = _normalize_ordered_action(
        ordered_action if ordered_action is not None else getattr(
            settings, 'DEFICIENCY_REPAIR_ORDERED_ACTION', 'revert_to_approved',
        ),
    )
    if stale_enabled is None:
        stale_enabled = getattr(settings, 'DEFICIENCY_REPAIR_STALE_ENABLED', False)
    stale_action_value = _normalize_stale_action(
        stale_action if stale_action is not None else getattr(
            settings, 'DEFICIENCY_REPAIR_STALE_ACTION', 'cancel',
        ),
    )

    repair_ts = timezone.now()
    cutoff = repair_ts - timedelta(hours=max(min_age_hours, 0))

    if not enabled:
        logger.info('repair_orphan_deficiency_reports: atlandı (DEFICIENCY_REPAIR_ENABLED=false)')
        try:
            record_audit(
                action='warehouse.deficiency_report.repair_skipped',
                target_type='warehouse.deficiencyreport',
                target_id='batch',
                after_json={'skipped': True, 'reason': 'DEFICIENCY_REPAIR_ENABLED=false'},
                actor=None,
            )
        except Exception:
            logger.exception('Eksik listesi onarım atlandı denetim kaydı oluşturulamadı')
        return {
            'skipped': True,
            'reason': 'DEFICIENCY_REPAIR_ENABLED=false',
            'repaired_count': 0,
            'details': [],
        }

    candidate_statuses = [
        DeficiencyReportStatus.PENDING,
        DeficiencyReportStatus.APPROVED,
        DeficiencyReportStatus.ORDERED,
    ]
    reports = (
        DeficiencyReport.objects.filter(is_active=True, status__in=candidate_statuses)
        .select_related('target_warehouse')
        .prefetch_related('items', 'purchase_orders', 'transfers')
        .order_by('updated_at')
    )

    details: list[dict[str, Any]] = []
    repaired_count = 0

    for report in reports:
        if report.updated_at > cutoff:
            continue

        issue = _classify_report(report)
        if issue is None:
            continue
        if issue == 'stale_open' and not stale_enabled:
            continue

        before_status = report.status
        deleted = False
        repair_action = 'status_sync'
        after_status: str | None = None
        repaired_report = None

        with transaction.atomic():
            locked = (
                DeficiencyReport.objects.select_for_update()
                .select_related('target_warehouse')
                .prefetch_related('items', 'purchase_orders', 'transfers')
                .get(pk=report.pk)
            )
            issue = _classify_report(locked)
            if issue is None:
                continue
            if issue == 'stale_open' and not stale_enabled:
                continue

            if issue in ('status_mismatch_po_received', 'status_mismatch_po_partial'):
                after_status, deleted = _apply_status_mismatch(locked, issue)
                repair_action = 'status_sync'
            elif issue == 'orphan_ordered':
                after_status, deleted = _apply_ordered_action(locked, ordered_action_value)
                repair_action = ordered_action_value
            else:
                after_status, deleted = _apply_stale_action(locked, stale_action_value)
                repair_action = stale_action_value

            _record_repair_audit(
                record_audit=record_audit,
                action='warehouse.deficiency_report.repaired',
                report=locked,
                issue=issue,
                repair_action=repair_action,
                before_status=before_status,
                after_status=after_status,
                deleted=deleted,
            )
            if not deleted:
                repaired_report = locked

        if repaired_report is not None:
            schedule_deficiency_status_changed(repaired_report)

        repaired_count += 1
        details.append({
            'report_id': str(report.id),
            'report_number': report.report_number,
            'issue': issue,
            'repair_action': repair_action,
            'before_status': before_status,
            'after_status': after_status,
            'deleted': deleted,
        })
        logger.info(
            'repair_orphan_deficiency_reports: %s issue=%s action=%s %s -> %s deleted=%s',
            report.report_number,
            issue,
            repair_action,
            before_status,
            after_status,
            deleted,
        )

    logger.info(
        'repair_orphan_deficiency_reports: %d kayıt onarıldı (cutoff=%s)',
        repaired_count,
        cutoff.isoformat(),
    )
    return {
        'skipped': False,
        'repaired_count': repaired_count,
        'cutoff': cutoff.isoformat(),
        'details': details,
    }
