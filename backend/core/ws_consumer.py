"""Channels consumer yardımcıları: ping/pong, bağlantı metrikleri."""

from __future__ import annotations

import json
import logging
from typing import Any

from core.ws_metrics import track_ws_connection_closed, track_ws_connection_opened

logger = logging.getLogger(__name__)

try:
    from autobahn.exception import Disconnected as WsDisconnected
except ImportError:  # pragma: no cover
    WsDisconnected = None


def _is_ws_client_gone(exc: BaseException) -> bool:
    if WsDisconnected is not None and isinstance(exc, WsDisconnected):
        return True
    return type(exc).__name__ == "Disconnected"


async def ws_safe_send(
    consumer: Any,
    *,
    text_data: str | None = None,
    bytes_data: bytes | None = None,
) -> bool:
    """
    Grup olayı kapalı bağlantıya ulaştığında autobahn Disconnected fırlatır.
    Bu yarış yük altında normaldir; ERROR loglamadan yutulur.
    """
    try:
        await consumer.send(text_data=text_data, bytes_data=bytes_data)
        return True
    except Exception as exc:
        if _is_ws_client_gone(exc):
            logger.debug("WS send atlandı (istemci bağlantısı kapalı): %s", exc)
            return False
        raise


async def ws_handle_client_ping(text_data: str | None) -> bool:
    """
    İstemci ``{"type":"ping"}`` gönderdiyse ``pong`` yanıtla ve True döndür.
    """
    if not text_data:
        return False
    try:
        payload = json.loads(text_data)
    except json.JSONDecodeError:
        return False
    if payload.get("type") != "ping":
        return False
    return True


async def ws_send_pong(consumer: Any) -> None:
    await ws_safe_send(consumer, text_data=json.dumps({"type": "pong"}))


def ws_on_connect(consumer_name: str) -> None:
    track_ws_connection_opened(consumer_name)


def ws_on_disconnect(consumer_name: str) -> None:
    track_ws_connection_closed(consumer_name)
