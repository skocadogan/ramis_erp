"""Depo modülüne ait Celery görevleri."""

import logging

from celery import shared_task

from core.celery_task_options import MAINTENANCE_TASK_OPTIONS

logger = logging.getLogger(__name__)


@shared_task(name="apps.warehouse.tasks.scan_kitchen_low_stock_deficiencies", **MAINTENANCE_TASK_OPTIONS)
def scan_kitchen_low_stock_deficiencies():
    """
    Tüm aktif KITCHEN depolarını tarar; minimum seviyenin altındaki
    kalemler için henüz açık rapor yoksa otomatik PENDING DeficiencyReport oluşturur.

    Gece periyodik tarama (Faz 3) — Celery beat ile planlanır (`BEAT_SCAN_KITCHEN_LOW_STOCK_*`, vars. 04:00).
    Sipariş akışından bağımsız olarak çalışır: sayım, fire, transfer gibi
    senkron tetikleyicilerin dışında kalan stok düşümlerini de yakalar.
    """
    from apps.inventory.services.order_deduction_service import _batch_check_low_stock_alerts
    from apps.warehouse.models import Warehouse, WarehouseStockLevel, WarehouseType
    from apps.inventory.stock_minimum import q_low_stock_warehouse_level

    kitchen_warehouses = Warehouse.objects.filter(
        is_active=True,
        warehouse_type=WarehouseType.KITCHEN,
    ).prefetch_related("kitchen_stations")

    total_checked = 0
    pairs: list[tuple[int, int]] = []

    for wh in kitchen_warehouses:
        if not wh.kitchen_stations.filter(is_active=True).exists():
            continue

        low_levels = WarehouseStockLevel.objects.filter(
            warehouse=wh,
            is_active=True,
        ).filter(q_low_stock_warehouse_level()).values_list("warehouse_id", "stock_item_id")

        pairs.extend(low_levels)
        total_checked += 1

    if pairs:
        _batch_check_low_stock_alerts(pairs)
        logger.info(
            "scan_kitchen_low_stock_deficiencies: %d KITCHEN depo tarandı, %d kritik kalem işlendi.",
            total_checked,
            len(pairs),
        )
    else:
        logger.info(
            "scan_kitchen_low_stock_deficiencies: %d KITCHEN depo tarandı, kritik kalem yok.",
            total_checked,
        )

    return {"checked_warehouses": total_checked, "low_stock_pairs": len(pairs)}


@shared_task(
    name="apps.warehouse.tasks.repair_orphan_deficiency_reports",
    **MAINTENANCE_TASK_OPTIONS,
)
def repair_orphan_deficiency_reports(enabled: bool | None = None):
    """
    Sorunlu / yetim eksik listesi kayıtlarını onarır veya temizler.

    ``DEFICIENCY_REPAIR_ENABLED=false`` ise işlem atlanır.
    Celery Beat: ``repair-orphan-deficiency-reports-nightly`` (``BEAT_DEFICIENCY_REPAIR_*``).
    """
    from django.conf import settings

    from apps.warehouse.services.deficiency_repair_service import (
        repair_orphan_deficiency_reports as _repair,
    )

    if enabled is None:
        enabled = getattr(settings, "DEFICIENCY_REPAIR_ENABLED", False)

    return _repair(enabled=enabled)


@shared_task(
    name="apps.warehouse.tasks.execute_deficiency_item_actions_task",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def execute_deficiency_item_actions_task(self, report_id: str, payload: dict, user_id: str | None):
    """Eksik listesi satır işlemlerini arka planda yürütür."""
    from django.contrib.auth import get_user_model

    from apps.warehouse.services.deficiency_action_service import DeficiencyActionService

    User = get_user_model()
    user = User.objects.filter(id=user_id).first() if user_id else None
    try:
        result = DeficiencyActionService.run_item_actions(report_id, payload, user=user)
        logger.info(
            "execute_deficiency_item_actions_task: report=%s result=%s",
            report_id,
            result,
        )
        return result
    except Exception:
        logger.exception(
            "execute_deficiency_item_actions_task failed: report=%s",
            report_id,
        )
        raise


@shared_task(name="apps.warehouse.tasks.scan_overdue_purchase_orders_daily", **MAINTENANCE_TASK_OPTIONS)
def scan_overdue_purchase_orders_daily():
    """
    Beklenen tarihi geçmiş açık satın alma siparişlerini tarar ve
    şube bazlı depo WebSocket uyarısı gönderir.

    Gece periyodik tarama — Celery beat ile planlanır (`BEAT_SCAN_OVERDUE_PO_*`, vars. 05:00).
    """
    from collections import defaultdict

    from apps.warehouse.models import Warehouse
    from apps.warehouse.procurement_alert_selectors import get_overdue_purchase_orders
    from apps.warehouse.ws_broadcast import broadcast_procurement_overdue_alert

    overdue_rows = get_overdue_purchase_orders()
    if not overdue_rows:
        logger.info("scan_overdue_purchase_orders_daily: geciken sipariş yok.")
        return {"overdue_count": 0, "branches_notified": 0}

    warehouse_ids = {row['warehouse_id'] for row in overdue_rows}
    warehouses = Warehouse.objects.filter(
        id__in=warehouse_ids,
        is_active=True,
    ).prefetch_related('branches')

    wh_to_branches: dict[str, list[str]] = {}
    for wh in warehouses:
        wh_to_branches[str(wh.id)] = [
            str(b.id) for b in wh.branches.all() if b.is_active
        ]

    by_branch: dict[str, int] = defaultdict(int)
    for row in overdue_rows:
        for branch_id in wh_to_branches.get(row['warehouse_id'], []):
            by_branch[branch_id] += 1

    for branch_id, count in by_branch.items():
        broadcast_procurement_overdue_alert(branch_id=branch_id, overdue_count=count)

    logger.info(
        "scan_overdue_purchase_orders_daily: %d geciken sipariş, %d şube bilgilendirildi.",
        len(overdue_rows),
        len(by_branch),
    )
    return {
        'overdue_count': len(overdue_rows),
        'branches_notified': len(by_branch),
    }
