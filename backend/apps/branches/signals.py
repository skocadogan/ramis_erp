import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from core.ws_deferred import schedule_table_broadcast
from .models import Table
from .serializers import TableListSerializer

logger = logging.getLogger(__name__)

# PosSyncConsumer: süper kullanıcıda sorguda branch_id yoksa `pos_sync_global` grubuna abone olur.
# Yayın yalnızca `pos_sync_{branch_id}` ise bu istemcilere hiç düşmez → POS 60 sn HTTP yedeğine kalır.
POS_SYNC_GLOBAL = "pos_sync_global"

# StaffNotificationConsumer: misafir geldi vb. (KDS / mutfak / akıllı buton kanalından ayrı).
STAFF_NOTIFICATIONS_GLOBAL = "staff_notifications_global"

# WaiterCallConsumer: akıllı buton garson çağrısı (``/ws/waiter/calls/``).
WAITER_CALLS_GLOBAL = "waiter_calls_global"


def broadcast_table_change(instance, action):
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    branch_id = instance.zone.branch_id if instance.zone else None
    primary_group = f"pos_sync_{branch_id}" if branch_id else POS_SYNC_GLOBAL
    from core.json_utils import to_json_safe

    clean_data = to_json_safe(TableListSerializer(instance).data)

    event = {
        "type": "table_update",
        "data": clean_data,
        "action": action,
    }
    try:

        async def _send() -> None:
            await channel_layer.group_send(primary_group, event)
            if branch_id:
                try:
                    await channel_layer.group_send(POS_SYNC_GLOBAL, event)
                except Exception:
                    logger.exception(
                        "pos_sync_global table_update başarısız (table_id=%s)", instance.pk
                    )

        async_to_sync(_send)()
    except Exception as e:
        logger.error("WS Broadcast Error for Table %s: %s", instance.id, e)

@receiver(post_save, sender=Table)
def table_saved(sender, instance, created, **kwargs):
    schedule_table_broadcast(instance.pk, "upsert")

@receiver(post_delete, sender=Table)
def table_deleted(sender, instance, **kwargs):
    # Silinen kayıt commit sonrası DB'de olmayacağından senkron yayın.
    broadcast_table_change(instance, "delete")
