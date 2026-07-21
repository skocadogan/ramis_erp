"""KDS ve mutfak istemcileri için Channels ile anlık yenileme sinyali."""
import asyncio
import logging
import os
import time

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.branches.signals import POS_SYNC_GLOBAL
from core.ws_deferred import schedule_kds_refresh
from core.ws_metrics import increment_ws_broadcast, record_ws_broadcast_latency
from core.ws_throttle import throttle_coalesced

logger = logging.getLogger(__name__)

# Varsayılan true: broadcast kuyruğu birikince KDS→POS dakikalarca gecikebiliyordu.
_WS_BYPASS_CELERY = os.environ.get("WS_BYPASS_CELERY", "true").lower() in ("true", "1", "yes")

__all__ = [
    "broadcast_kds_refresh",
    "broadcast_kds_stats",
    "broadcast_kitchen_order_status_changed",
    "broadcast_kitchen_order_cancelled",
    "broadcast_kitchen_stock_low_alert",
    "schedule_kds_refresh",
]

# Süper kullanıcı (sorguda branch_id yok) `kitchen_notifications` grubuna abone olur.
KITCHEN_NOTIFICATIONS_GLOBAL = "kitchen_notifications"


def _order_status_pending_msg_key(branch_id: str) -> str:
    return f"ws:pending_msg:order_status_changed:{branch_id}"


def _stash_order_status_message(branch_id: str, message: dict) -> None:
    """Throttle penceresinde en son payload flush'ta kullanılsın."""
    from django.core.cache import cache

    cache.set(_order_status_pending_msg_key(branch_id), message, timeout=15)


def _take_order_status_message(branch_id: str, fallback: dict) -> dict:
    from django.core.cache import cache

    key = _order_status_pending_msg_key(branch_id)
    latest = cache.get(key)
    if latest is not None:
        cache.delete(key)
        return latest
    return fallback


async def _async_send_to_groups(
    channel_layer,
    branch_id: str,
    event: dict,
    *,
    include_kitchen: bool = True,
    include_pos_sync: bool = True,
) -> None:
    """
    Tek bir async fonksiyonda mutfak ve/veya POS sync gruplarına yayın yapar.

    iki ayrı async_to_sync çağrısını tek bir async fonksiyonda birleştirerek
    thread pool yükünü yarıya indirir.
    """
    tasks = []
    if include_kitchen:
        tasks.append(
            channel_layer.group_send(f"kitchen_notifications_{branch_id}", event)
        )
        tasks.append(
            channel_layer.group_send(KITCHEN_NOTIFICATIONS_GLOBAL, event)
        )
    if include_pos_sync:
        tasks.append(
            channel_layer.group_send(f"pos_sync_{branch_id}", event)
        )
        tasks.append(
            channel_layer.group_send(POS_SYNC_GLOBAL, event)
        )

    results = await asyncio.gather(*tasks, return_exceptions=True)
    et = str(event.get("type") or "unknown")
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            if include_kitchen and i < 2:
                logger.exception("KDS WebSocket yayını başarısız (event=%s)", et)
            elif include_pos_sync:
                logger.exception("POS sync WebSocket yayını başarısız (event=%s)", et)

    increment_ws_broadcast(f"batch_{et}", str(branch_id))


def broadcast_to_kitchen_ws_groups(
    channel_layer, branch_id, event: dict[str, object]
) -> None:
    """Şube mutfak grubu + (süper kullanıcı) global `kitchen_notifications`."""
    if channel_layer is None or not branch_id:
        return

    async def _send_both() -> None:
        await channel_layer.group_send(f"kitchen_notifications_{branch_id}", event)
        try:
            await channel_layer.group_send(KITCHEN_NOTIFICATIONS_GLOBAL, event)
        except Exception:
            logger.exception("KDS global WebSocket yayını başarısız (branch_id=%s)", branch_id)

    async_to_sync(_send_both)()
    et = str((event or {}).get("type") or "unknown")
    increment_ws_broadcast(f"kitchen_{et}", str(branch_id))


def broadcast_to_pos_sync_ws_groups(
    channel_layer, branch_id, event: dict[str, object]
) -> None:
    """
    Garson / POS ``/ws/pos/sync/`` abonelerine sipariş–KDS sinyali.

    Mutfağın yüksek frekanslı olayları (kds.stats_update, prep_updated, stok vb.)
    buraya gönderilmez; böylece mobil garson ve POS masa kanalı kilitlenmez.
    """
    if channel_layer is None or not branch_id:
        return

    async def _send_both() -> None:
        await channel_layer.group_send(f"pos_sync_{branch_id}", event)
        try:
            await channel_layer.group_send(POS_SYNC_GLOBAL, event)
        except Exception:
            logger.exception("pos_sync_global WebSocket yayını başarısız (branch_id=%s)", branch_id)

    async_to_sync(_send_both)()
    et = str((event or {}).get("type") or "unknown")
    increment_ws_broadcast(f"pos_sync_{et}", str(branch_id))


def _broadcast_orders_updated_event(
    channel_layer, branch_id, message: dict[str, object]
) -> None:
    """
    Tek olay tipi: ``orders_updated`` (istemci geri uyum için ``kds_refresh`` alias'ı consumer'da).
    Mutfak + POS sync kanallarına tek bir async fonksiyonda yayın yapar.
    """
    event = {"type": "orders_updated", "message": message}

    async def _send_all():
        await _async_send_to_groups(
            channel_layer, str(branch_id), event,
            include_kitchen=True,
            include_pos_sync=True,
        )

    async_to_sync(_send_all)()


def broadcast_kds_refresh(branch_id, reason: str = "unknown", **extra: object) -> None:
    """Mutfağa ve garson/POS kanalına sipariş yenileme sinyalini asenkron (Celery) veya fallback olarak senkron gönderir."""
    if not branch_id:
        return
    if _WS_BYPASS_CELERY:
        _broadcast_kds_refresh_now(branch_id, reason, **extra)
        return
    try:
        from .tasks import broadcast_kds_refresh_task
        broadcast_kds_refresh_task.delay(str(branch_id), reason, **extra)
    except Exception:
        logger.warning("Celery WebSocket refresh task dispatch failed, falling back to sync broadcast", exc_info=True)
        _broadcast_kds_refresh_now(branch_id, reason, **extra)


def _broadcast_kds_refresh_now(branch_id, reason: str = "unknown", **extra: object) -> None:
    """Senkron olarak KDS yenileme yayını yapar (Celery task'ından çağrılır)."""
    channel_layer = get_channel_layer()
    if channel_layer is None or not branch_id:
        return
    message: dict[str, object] = {"reason": reason, **extra}
    # NOT: table_id caller tarafından gönderilmezse frontend bunu opsiyonel kabul eder.
    # Eski davranış (order_id'den table_id çözümleme) kaldırıldı çünkü:
    # 1. Her broadcast'te ekstra DB sorgusu gerektiriyordu
    # 2. table_id sadece frontend UI için, olmazsa sorun olmaz
    # 3. Caller'larda (order_core_service, signals) table_id biliniyorsa eklenir

    started = time.monotonic()
    try:
        _broadcast_orders_updated_event(channel_layer, branch_id, message)
        _invalidate_kds_active_cache(branch_id)
    except Exception:
        logger.exception("KDS WebSocket yayını başarısız (reason=%s)", reason)
    finally:
        record_ws_broadcast_latency(
            "orders_updated",
            (time.monotonic() - started) * 1000,
        )


def _invalidate_kds_active_cache(branch_id) -> None:
    """KDS aktif sipariş cache versiyonunu artırarak cache'i anında geçersiz kılar (O(1))."""
    try:
        from django.core.cache import cache

        bid = str(branch_id) if branch_id else "all"
        key = f"kds_version:{bid}"
        try:
            cache.incr(key)
        except (ValueError, Exception):
            cache.set(key, 1, timeout=86400)
            
        if bid != "all":
            try:
                cache.incr("kds_version:all")
            except (ValueError, Exception):
                cache.set("kds_version:all", 1, timeout=86400)
    except Exception:
        logger.debug("kds_active cache invalidation failed", exc_info=True)


def _broadcast_kds_stats_now(branch_id) -> None:
    from .selectors import get_kitchen_stats

    channel_layer = get_channel_layer()
    if channel_layer is None or not branch_id:
        return
    stats = get_kitchen_stats(branch_id)
    event = {
        "type": "kds.stats_update",
        "message": {
            "branch_id": str(branch_id),
            "stats": stats,
        },
    }

    async def _send_all():
        await _async_send_to_groups(
            channel_layer, str(branch_id), event,
            include_kitchen=True,
            include_pos_sync=False,
        )

    async_to_sync(_send_all)()


def broadcast_kds_stats(branch_id=None) -> None:
    """İstasyon bazlı bekleyen sipariş sayılarını broadcast eder (şube başına throttle)."""
    if not branch_id:
        return
    throttle_coalesced(
        "kds_stats",
        str(branch_id),
        run=lambda: _broadcast_kds_stats_now(branch_id),
    )


def broadcast_kitchen_order_status_changed(branch_id, message: dict) -> None:
    """``order_status_changed`` olayını doğrudan Redis'e yollar (Celery yok).

    KDS→POS gecikmesi kritik; broadcast kuyruğu birikince dakikalarca gecikme
    oluştuğu için bu olay tipi her zaman senkron yayınlanır. Yoğunluk koruması
    ``throttle_coalesced`` ile devam eder.
    """
    if not branch_id:
        return
    bid = str(branch_id)
    _stash_order_status_message(bid, message)

    def _run_latest() -> None:
        latest = _take_order_status_message(bid, message)
        _broadcast_kitchen_order_status_changed_now(bid, latest)

    throttle_coalesced(
        "order_status_changed",
        bid,
        run=_run_latest,
    )


def broadcast_kitchen_order_cancelled(branch_id, order) -> None:
    """
    Sipariş tam iptalinde KDS'ye anlık sinyal (POS cancel / cancel_table).
    Yalnızca ``schedule_kds_refresh`` ile ertelenen HTTP yenilemesine güvenmek,
    WS kopukluğunda veya cache gecikmesinde kartların asılı kalmasına yol açabiliyordu.
    """
    if not branch_id or order is None:
        return
    from apps.orders.models import OrderStatus

    order_id = str(order.id)
    table_id = str(order.table_id) if order.table_id else None
    base: dict[str, object] = {
        "event": "order_cancelled",
        "order_id": order_id,
        "item_status": OrderStatus.CANCELLED,
    }
    if table_id:
        base["table_id"] = table_id

    item_ids = list(
        order.items.filter(parent_item__isnull=True).values_list("id", flat=True)
    )
    if not item_ids:
        broadcast_kitchen_order_status_changed(str(branch_id), base)
        return
    # Toplu iptal: tüm item_id'leri tek event'te gönder (RAPOR-3 Y-4)
    broadcast_kitchen_order_status_changed(
        str(branch_id),
        {**base, "item_ids": [str(i) for i in item_ids]},
    )


def _broadcast_kitchen_order_status_changed_now(branch_id, message: dict) -> None:
    """Senkron olarak ``order_status_changed`` yayını yapar."""
    channel_layer = get_channel_layer()
    if channel_layer is None or not branch_id:
        return
    event = {"type": "order_status_changed", "message": message}
    started = time.monotonic()
    try:
        async def _send_all():
            await _async_send_to_groups(
                channel_layer, str(branch_id), event,
                include_kitchen=True,
                include_pos_sync=True,
            )

        async_to_sync(_send_all)()
    except Exception:
        logger.exception("KDS order_status_changed WebSocket yayını başarısız")
    finally:
        record_ws_broadcast_latency(
            "order_status_changed",
            (time.monotonic() - started) * 1000,
        )

    # `schedule_kds_refresh` → `broadcast_kds_refresh` hattı on_commit’e bağımlı;
    # burada ek güvence: cache’i anında geçersiz kıl (Celery düşse veya on_commit gecikse bile).
    try:
        _invalidate_kds_active_cache(branch_id)
    except Exception:
        logger.debug("order_status_changed cache invalidation failed", exc_info=True)


def broadcast_kitchen_stock_low_alert(branch_id: str, message: dict) -> None:
    """Düşük stok uyarısını mutfak/KDS gruplarına ilet."""
    channel_layer = get_channel_layer()
    if channel_layer is None or not branch_id:
        return
    event = {
        "type": "stock_low_alert",
        "message": message,
    }
    try:
        async def _send_all():
            await _async_send_to_groups(
                channel_layer, str(branch_id), event,
                include_kitchen=True,
                include_pos_sync=False,
            )

        async_to_sync(_send_all)()
    except Exception:
        logger.exception("KDS stok uyarisi WebSocket yayini basarisiz")
