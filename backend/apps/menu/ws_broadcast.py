"""POS / menü istemcileri: kategori ve ürün listesini anlık tazelemek için Channels."""
import asyncio
import logging
import os

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from core.ws_throttle import throttle_coalesced

logger = logging.getLogger(__name__)

# Broadcast throttle: aynı branch için 5 saniyede en fazla 1 broadcast
_MENU_CATALOG_THROTTLE_SECONDS = float(
    os.environ.get("WS_MENU_CATALOG_THROTTLE_SECONDS", "5")
)


def _do_broadcast(branch_id: str | None, reason: str, message: dict) -> None:
    """Gerçek WebSocket yayınını gerçekleştirir."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    branch_ids = []
    if branch_id:
        branch_ids = [branch_id]
    else:
        try:
            from apps.branches.models import Branch
            branch_ids = [str(bid) for bid in Branch.objects.values_list("id", flat=True)]
        except Exception:
            pass

    async def _send_broadcasts() -> None:
        tasks = [
            channel_layer.group_send(
                "menu_catalog",
                {"type": "menu.catalog_refresh", "message": message},
            ),
            channel_layer.group_send(
                "pos_sync_global",
                {
                    "type": "menu_catalog_refresh",
                    "message": message,
                },
            ),
        ]

        for bid in branch_ids:
            tasks.append(
                channel_layer.group_send(
                    f"pos_sync_{bid}",
                    {
                        "type": "menu_catalog_refresh",
                        "message": message,
                    },
                )
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                if i == 0:
                    logger.exception("menu_catalog group_send başarısız")
                elif i == 1:
                    logger.exception("pos_sync_global group_send başarısız")
                else:
                    bid_idx = i - 2
                    if bid_idx < len(branch_ids):
                        logger.exception(
                            "pos_sync group_send menu_catalog_refresh failed (branch_id=%s)",
                            branch_ids[bid_idx],
                        )

    try:
        async_to_sync(_send_broadcasts)()
    except Exception:
        logger.exception("Menü WebSocket yayını başarısız (reason=%s)", reason)


def broadcast_menu_catalog_refresh(reason: str = "unknown", **extra: object) -> None:
    """
    menu_catalog grubuna bildirim gönderir; istemci menü HTTP endpoint'lerini yeniler.

    PERF: throttle_coalesced ile aynı branch için _MENU_CATALOG_THROTTLE_SECONDS
    içinde gelen ek çağrılar birleştirilir. Pencere dolunca pending varsa bir kez
    daha broadcast yapılır. 50+ şubede her menü değişikliğinde fan-out patlamasını önler.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    message: dict[str, object] = {"reason": reason, **extra}
    branch_id = extra.get("branch_id")
    throttle_key = str(branch_id) if branch_id else "global"

    throttle_coalesced(
        "menu_catalog",
        throttle_key,
        throttle_seconds=_MENU_CATALOG_THROTTLE_SECONDS,
        run=lambda: _do_broadcast(
            branch_id=str(branch_id) if branch_id else None,
            reason=reason,
            message=message,
        ),
    )
