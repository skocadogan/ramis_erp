import logging
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

def broadcast_production_status_update(branch_id: str, message: dict) -> None:
    """
    production_status_{branch_id} grubuna bildirim gönderir.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    
    group_name = f"production_status_{branch_id}"
    async def _send_broadcasts() -> None:
        await channel_layer.group_send(
            group_name,
            {
                "type": "production_status_update",
                "message": message
            },
        )
        try:
            await channel_layer.group_send(
                f"pos_sync_{branch_id}",
                {
                    "type": "production_status_update",
                    "message": message
                },
            )
        except Exception:
            logger.exception("pos_sync group_send production_status_update failed (branch_id=%s)", branch_id)

    try:
        async_to_sync(_send_broadcasts)()
    except Exception:
        logger.exception("Üretim Planlama WebSocket yayını başarısız (branch_id=%s)", branch_id)
