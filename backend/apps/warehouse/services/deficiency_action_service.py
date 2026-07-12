"""Eksik listesi kalemleri için satır bazlı işlem planlama ve yürütme."""

from __future__ import annotations
from core.decimal_constants import ZERO_QTY

from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.inventory.stock_minimum import ZERO_QTY
from apps.warehouse.models import (
    DeficiencyReport,
    DeficiencyReportStatus,
    PurchaseOrderStatus,
)

from .deficiency_report_service import DeficiencyReportService
from .fulfillment_service import DeficiencyFulfillmentService
from .purchase_order_service import PurchaseOrderService

ACTION_PURCHASE_ALL = 'PURCHASE_ALL'
ACTION_PURCHASE_PARTIAL = 'PURCHASE_PARTIAL'
ACTION_FULFILL_STOCK = 'FULFILL_STOCK'
ACTION_REJECT = 'REJECT'

VALID_ACTIONS = frozenset(
    {
        ACTION_PURCHASE_ALL,
        ACTION_PURCHASE_PARTIAL,
        ACTION_FULFILL_STOCK,
        ACTION_REJECT,
    },
)


class DeficiencyActionService:
    """Eksik listesi satır işlemleri — önizleme ve arka plan yürütme."""

    @staticmethod
    def suggest_default_action(avail: dict | None) -> str:
        if avail and avail.get('can_fully_fulfill'):
            return ACTION_FULFILL_STOCK
        if avail and avail.get('can_partially_fulfill'):
            return ACTION_PURCHASE_PARTIAL
        return ACTION_PURCHASE_ALL

    @staticmethod
    def _load_report(report_id) -> DeficiencyReport:
        report = (
            DeficiencyReport.objects.select_related(
                'kitchen_station__branch',
                'target_warehouse',
            )
            .prefetch_related('items__stock_item')
            .get(id=report_id)
        )
        if report.status not in (
            DeficiencyReportStatus.PENDING,
            DeficiencyReportStatus.APPROVED,
        ):
            raise ValueError(_('Bu rapor için satır işlemi yapılamaz.'))
        return report

    @staticmethod
    def _availability_map(report_id) -> dict[str, dict]:
        rows = DeficiencyFulfillmentService.get_availability(report_id)
        return {row['item_id']: row for row in rows}

    @staticmethod
    def _parse_actions(raw_items: list[dict]) -> dict[str, str]:
        if not raw_items:
            raise ValueError(_('En az bir kalem seçilmelidir.'))
        parsed: dict[str, str] = {}
        for row in raw_items:
            item_id = str(row.get('item_id') or '').strip()
            action = str(row.get('action') or '').strip().upper()
            if not item_id:
                raise ValueError(_('Geçersiz kalem kimliği.'))
            if action not in VALID_ACTIONS:
                raise ValueError(_('Geçersiz işlem tipi: %(a)s') % {'a': action})
            parsed[item_id] = action
        return parsed

    @staticmethod
    def _plan_line(item, avail: dict | None, action: str) -> dict:
        req_qty = item.quantity
        available = Decimal(avail['total_available']) if avail else ZERO_QTY

        if action == ACTION_REJECT:
            return {
                'action': action,
                'transfer_qty': ZERO_QTY,
                'purchase_qty': ZERO_QTY,
                'reject': True,
            }

        if action == ACTION_FULFILL_STOCK:
            if not avail or not avail.get('can_fully_fulfill'):
                raise ValueError(
                    _('"%(name)s" tamamen stoktan karşılanamaz.')
                    % {'name': item.stock_item.name},
                )
            return {
                'action': action,
                'transfer_qty': req_qty,
                'purchase_qty': ZERO_QTY,
                'reject': False,
            }

        if action == ACTION_PURCHASE_ALL:
            return {
                'action': action,
                'transfer_qty': ZERO_QTY,
                'purchase_qty': req_qty,
                'reject': False,
            }

        if action == ACTION_PURCHASE_PARTIAL:
            if not avail or available <= 0:
                raise ValueError(
                    _('"%(name)s" için kısmi stok karşılama mümkün değil.')
                    % {'name': item.stock_item.name},
                )
            transfer_qty = min(req_qty, available)
            purchase_qty = req_qty - transfer_qty
            return {
                'action': action,
                'transfer_qty': transfer_qty,
                'purchase_qty': purchase_qty,
                'reject': False,
            }

        raise ValueError(_('Geçersiz işlem tipi.'))

    @staticmethod
    def _build_execution_plan(report: DeficiencyReport, actions: dict[str, str]) -> dict:
        availability = DeficiencyActionService._availability_map(report.id)
        items_by_id = {str(item.id): item for item in report.items.all()}

        missing = set(actions.keys()) - set(items_by_id.keys())
        if missing:
            raise ValueError(_('Raporda bulunmayan kalem(ler) seçildi.'))

        lines: list[dict] = []
        transfer_targets: dict[str, Decimal] = {}
        purchase_lines: list[dict] = []
        rejected: list[dict] = []

        for item_id, action in actions.items():
            item = items_by_id[item_id]
            avail = availability.get(item_id)
            plan = DeficiencyActionService._plan_line(item, avail, action)
            line_summary = {
                'item_id': item_id,
                'stock_item_id': str(item.stock_item_id),
                'stock_item_name': item.stock_item.name,
                'unit': item.unit,
                'requested_quantity': str(item.quantity),
                'action': action,
                'transfer_quantity': str(plan['transfer_qty']),
                'purchase_quantity': str(plan['purchase_qty']),
            }
            lines.append(line_summary)

            if plan['reject']:
                rejected.append(
                    {
                        'item_id': item_id,
                        'stock_item_name': item.stock_item.name,
                    },
                )
                continue

            if plan['transfer_qty'] > 0:
                transfer_targets[item_id] = plan['transfer_qty']

            if plan['purchase_qty'] > 0:
                purchase_lines.append(
                    {
                        'item_id': item_id,
                        'stock_item_id': item.stock_item_id,
                        'stock_item_name': item.stock_item.name,
                        'quantity': plan['purchase_qty'],
                        'unit': item.unit,
                        'unit_price': item.stock_item.last_purchase_price or ZERO_QTY,
                        'notes': item.notes or '',
                    },
                )

        transfer_groups: list[dict] = []
        if transfer_targets:
            allocations = DeficiencyFulfillmentService.calculate_allocations_for_targets(
                report,
                list(availability.values()),
                transfer_targets,
            )
            wh_names = DeficiencyFulfillmentService.warehouse_names_for_ids(
                allocations.keys(),
            )
            for wh_id, alloc_items in allocations.items():
                transfer_groups.append(
                    {
                        'source_warehouse_id': wh_id,
                        'source_warehouse_name': wh_names.get(wh_id, wh_id),
                        'items': [
                            {
                                'stock_item_name': items_by_id[str(a['report_item'].id)].stock_item.name,
                                'quantity': str(a['quantity']),
                                'unit': a['unit'],
                            }
                            for a in alloc_items
                        ],
                    },
                )

        return {
            'lines': lines,
            'transfers': transfer_groups,
            'purchases': [
                {
                    'stock_item_name': p['stock_item_name'],
                    'quantity': str(p['quantity']),
                    'unit': p['unit'],
                }
                for p in purchase_lines
            ],
            'rejected': rejected,
            'requires_purchase_config': len(purchase_lines) > 0,
            'purchase_item_count': len(purchase_lines),
            'transfer_group_count': len(transfer_groups),
            'rejected_count': len(rejected),
        }

    @staticmethod
    def preview_item_actions(report_id, raw_items: list[dict]) -> dict:
        report = DeficiencyActionService._load_report(report_id)
        actions = DeficiencyActionService._parse_actions(raw_items)
        plan = DeficiencyActionService._build_execution_plan(report, actions)
        plan['report_id'] = str(report.id)
        plan['report_number'] = report.report_number
        return plan

    @staticmethod
    def queue_item_actions(
        report_id,
        raw_items: list[dict],
        *,
        supplier_id=None,
        warehouse_id=None,
        user=None,
    ) -> dict:
        report = DeficiencyActionService._load_report(report_id)
        actions = DeficiencyActionService._parse_actions(raw_items)
        plan = DeficiencyActionService._build_execution_plan(report, actions)

        if plan['requires_purchase_config']:
            if not supplier_id or not warehouse_id:
                raise ValueError(
                    _('Satın alma kalemi var; tedarikçi ve hedef depo zorunludur.'),
                )
            DeficiencyReportService._assert_target_warehouse_access(user, warehouse_id)

        from apps.warehouse.tasks import execute_deficiency_item_actions_task

        payload = {
            'items': [{'item_id': iid, 'action': act} for iid, act in actions.items()],
            'supplier_id': str(supplier_id) if supplier_id else None,
            'warehouse_id': str(warehouse_id) if warehouse_id else None,
        }
        user_id = str(user.id) if user and getattr(user, 'is_authenticated', False) else None

        if user_id:
            execute_deficiency_item_actions_task.delay(str(report_id), payload, user_id)
        else:
            execute_deficiency_item_actions_task(str(report_id), payload, user_id)

        return {
            'queued': True,
            'report_id': str(report.id),
            'report_number': report.report_number,
            'summary': plan,
        }

    @staticmethod
    @transaction.atomic
    def run_item_actions(report_id, payload: dict, user=None) -> dict:
        """Celery görevi tarafından çağrılır."""
        report = (
            DeficiencyReport.objects.select_for_update()
            .select_related('kitchen_station__branch', 'target_warehouse')
            .prefetch_related('items__stock_item')
            .get(id=report_id)
        )
        if report.status not in (
            DeficiencyReportStatus.PENDING,
            DeficiencyReportStatus.APPROVED,
        ):
            raise ValueError(_('Bu rapor için satır işlemi yapılamaz.'))

        actions = DeficiencyActionService._parse_actions(payload.get('items') or [])
        plan = DeficiencyActionService._build_execution_plan(report, actions)
        availability = list(DeficiencyActionService._availability_map(report.id).values())
        items_by_id = {str(item.id): item for item in report.items.all()}

        transfer_targets: dict[str, Decimal] = {}
        # Plan anındaki transfer miktarı (allocation sonrası kısmi karşılamayı
        # tespit edebilmek için ayrı tutuyoruz).
        plan_transfer_qty: dict[str, Decimal] = {}
        purchase_lines: list[dict] = []
        processed_item_ids: set[str] = set()

        for item_id, action in actions.items():
            item = items_by_id[item_id]
            avail = next((a for a in availability if a['item_id'] == item_id), None)
            line_plan = DeficiencyActionService._plan_line(item, avail, action)
            processed_item_ids.add(item_id)

            if line_plan['transfer_qty'] > 0:
                transfer_targets[item_id] = line_plan['transfer_qty']
                plan_transfer_qty[item_id] = line_plan['transfer_qty']
            if line_plan['purchase_qty'] > 0:
                purchase_lines.append(
                    {
                        'stock_item_id': item.stock_item_id,
                        'quantity': line_plan['purchase_qty'],
                        'unit': item.unit,
                        'unit_price': item.stock_item.last_purchase_price or ZERO_QTY,
                        'notes': item.notes or '',
                    },
                )

        created_transfers = []
        # Allocation sonrası her kalem için gerçekten transfer edilen miktar.
        actual_transferred: dict[str, Decimal] = {}
        if transfer_targets:
            allocations = DeficiencyFulfillmentService.calculate_allocations_for_targets(
                report,
                availability,
                transfer_targets,
            )
            if allocations:
                # Kalem bazında gerçek allocate edilen miktarı topla.
                # Aynı kalem birden fazla depodan sağlanıyorsa bunlar toplanır.
                for _wh_id, alloc_items in allocations.items():
                    for a in alloc_items:
                        rid = str(a['report_item'].id)
                        actual_transferred[rid] = actual_transferred.get(rid, ZERO_QTY) + a['quantity']
                created_transfers = DeficiencyFulfillmentService.create_transfers_for_allocations(
                    report,
                    allocations,
                    user,
                )

            # Kısmi karşılama koruması: plan'da transfer öngörülen miktar
            # allocation sonunda gerçekte sağlanamadıysa, eksik kalan kısım
            # PO'ya eklenir. Aksi halde sessiz veri kaybı olur.
            for item_id, planned in plan_transfer_qty.items():
                actual = actual_transferred.get(item_id, ZERO_QTY)
                shortfall = planned - actual
                if shortfall > 0:
                    item = items_by_id[item_id]
                    existing = next(
                        (p for p in purchase_lines if p['stock_item_id'] == item.stock_item_id),
                        None,
                    )
                    if existing:
                        existing['quantity'] = existing['quantity'] + shortfall
                    else:
                        purchase_lines.append(
                            {
                                'stock_item_id': item.stock_item_id,
                                'quantity': shortfall,
                                'unit': item.unit,
                                'unit_price': item.stock_item.last_purchase_price or ZERO_QTY,
                                'notes': item.notes or '',
                            },
                        )

        created_po = None
        if purchase_lines:
            supplier_id = payload.get('supplier_id')
            warehouse_id = payload.get('warehouse_id')
            if not supplier_id or not warehouse_id:
                raise ValueError(_('Satın alma için tedarikçi ve depo gerekli.'))
            created_po = PurchaseOrderService.create_order(
                {
                    'supplier_id': supplier_id,
                    'warehouse_id': warehouse_id,
                    'status': PurchaseOrderStatus.DRAFT,
                    'order_date': timezone.now().date(),
                    'deficiency_report': report,
                    'notes': _('Eksik Listesi #%(number)s — seçili kalemler')
                    % {'number': report.report_number},
                },
                purchase_lines,
                user=user,
            )

        for item_id in processed_item_ids:
            items_by_id[item_id].delete()

        remaining = report.items.count()
        if remaining == 0:
            if created_po and not created_transfers:
                report.status = DeficiencyReportStatus.ORDERED
            else:
                report.status = DeficiencyReportStatus.COMMITTED
        elif created_po or created_transfers:
            report.status = DeficiencyReportStatus.PARTIALLY_COMMITTED
        elif report.status == DeficiencyReportStatus.PENDING:
            report.status = DeficiencyReportStatus.APPROVED

        update_fields = ['status', 'updated_at']
        if report.status != DeficiencyReportStatus.PENDING and not report.approved_at:
            report.approved_by = user
            report.approved_at = timezone.now()
            update_fields.extend(['approved_by', 'approved_at'])

        report.save(update_fields=update_fields)

        from apps.audit.services import record_audit
        from apps.warehouse.ws_broadcast import schedule_deficiency_status_changed

        branch = report.target_warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.deficiency_report.item_actions_executed',
            target_instance=report,
            after_json={
                'report_number': report.report_number,
                'processed_items': len(processed_item_ids),
                'transfer_count': len(created_transfers),
                'purchase_order_id': str(created_po.id) if created_po else None,
            },
            actor=user,
            branch=branch,
        )
        schedule_deficiency_status_changed(report)

        return {
            'report_id': str(report.id),
            'status': report.status,
            'transfers_created': len(created_transfers),
            'purchase_order_id': str(created_po.id) if created_po else None,
        }
