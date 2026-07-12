import logging
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.orders.models import Order, OrderItem
from core.ws_deferred import schedule_kds_refresh, schedule_table_broadcast

logger = logging.getLogger(__name__)


def _schedule_table_snapshot_for_order(order: Order) -> None:
    table_id = getattr(order, "table_id", None)
    if table_id:
        schedule_table_broadcast(table_id, "upsert")


@receiver(post_save, sender=Order)
def order_saved_broadcast_pos_table(sender, instance, created, **kwargs):
    """Sipariş kaydedildiğinde masa ve KDS durumunu yayınlar."""
    _schedule_table_snapshot_for_order(instance)

    from apps.orders.models import OrderStatus

    if not created and instance.status == OrderStatus.CANCELLED:
        from apps.orders.ws_broadcast import broadcast_kds_stats

        broadcast_kds_stats(instance.branch_id)


@receiver(post_save, sender=OrderItem)
def order_item_saved_broadcast_pos_table(sender, instance, created, **kwargs):
    _schedule_table_snapshot_for_order(instance.order)
    from apps.orders.ws_broadcast import broadcast_kds_stats
    broadcast_kds_stats(instance.order.branch_id)
    # Gereksiz debug log kaldırıldı (RAPOR-3 D-4)


@receiver(post_delete, sender=OrderItem)
def order_item_deleted_broadcast_pos_table(sender, instance, **kwargs):
    _schedule_table_snapshot_for_order(instance.order)
    from apps.orders.ws_broadcast import broadcast_kds_stats

    broadcast_kds_stats(instance.order.branch_id)
