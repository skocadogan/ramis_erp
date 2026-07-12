
import logging
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from django.db import transaction
from django.db.models import Sum

from apps.inventory.models import StockReservation, StockReservationStatus
from core.celery_task_options import MAINTENANCE_TASK_OPTIONS
logger = logging.getLogger(__name__)

@shared_task(name="apps.inventory.tasks.cleanup_expired_reservations", **MAINTENANCE_TASK_OPTIONS)
def cleanup_expired_reservations(expiry_hours=None):
    """
    Süresi dolmuş (varsayılan 24 saat) rezerve stokları serbest bırakır.
    Genellikle ödenmemiş ve unutulmuş siparişler için kullanılır.
    """
    if expiry_hours is None:
        expiry_hours = getattr(settings, "STOCK_RESERVATION_EXPIRY_HOURS", 24)

    cutoff_time = timezone.now() - timedelta(hours=expiry_hours)
    
    with transaction.atomic():
        count = StockReservation.objects.filter(
            status=StockReservationStatus.RESERVED,
            created_at__lt=cutoff_time
        ).update(
            status=StockReservationStatus.RELEASED,
            updated_at=timezone.now()
        )
        if count > 0:
            logger.info(f"Cleanup: {count} adet süresi dolmuş stok rezervasyonu serbest bırakıldı.")
            return count

    return 0


@shared_task(name="apps.inventory.tasks.scan_expiring_lots_daily", **MAINTENANCE_TASK_OPTIONS)
def scan_expiring_lots_daily(days_ahead=None):
    """
    Tüm aktif depolarda SKT risk lotlarını tarar ve özet loglar.
    Gece periyodik tarama — Celery beat ile planlanır (`BEAT_SCAN_EXPIRING_LOTS_*`).
    """
    from apps.inventory.services.expiry_service import ExpiryTrackingService
    from apps.warehouse.models import Warehouse

    if days_ahead is None:
        days_ahead = max(getattr(settings, 'EXPIRY_WARNING_DAYS_OPTIONS', [3, 7]))

    warehouses = Warehouse.objects.filter(is_active=True).only('id', 'code')
    total_lots = 0
    warehouses_with_risk = 0

    for wh in warehouses:
        lots = ExpiryTrackingService.get_expiring_lots(
            warehouse_id=wh.id,
            days_ahead=days_ahead,
        )
        count = lots.count()
        if count:
            warehouses_with_risk += 1
            total_lots += count

    logger.info(
        'scan_expiring_lots_daily: %d depo tarandı, %d depoda toplam %d risk lotu (≤%d gün).',
        warehouses.count(),
        warehouses_with_risk,
        total_lots,
        days_ahead,
    )
    return {
        'checked_warehouses': warehouses.count(),
        'warehouses_with_risk': warehouses_with_risk,
        'total_lots': total_lots,
        'days_ahead': days_ahead,
    }


@shared_task(name="apps.inventory.tasks.cleanup_negative_lots", **MAINTENANCE_TASK_OPTIONS)
def cleanup_negative_lots():
    from apps.inventory.models import StockLot

    negative_lots = StockLot.objects.filter(
        quantity__lt=0,
        is_active=True,
    ).select_related('stock_item', 'warehouse')

    if not negative_lots.exists():
        return 0

    cleaned = 0
    for neg_lot in negative_lots:
        positive_lots = StockLot.objects.filter(
            stock_item_id=neg_lot.stock_item_id,
            warehouse_id=neg_lot.warehouse_id,
            quantity__gt=0,
            is_active=True,
        ).order_by('created_at')

        remaining_neg = abs(neg_lot.quantity)
        for pos_lot in positive_lots:
            if remaining_neg <= 0:
                break
            deduct = min(pos_lot.quantity, remaining_neg)
            pos_lot.quantity -= deduct
            pos_lot.save(update_fields=['quantity', 'updated_at'])
            remaining_neg -= deduct

        if remaining_neg <= 0:
            neg_lot.quantity = 0
        else:
            neg_lot.quantity = -remaining_neg
        neg_lot.save(update_fields=['quantity', 'updated_at'])
        cleaned += 1

    logger.info('Cleaned %d negative stock lots', cleaned)
    return cleaned
