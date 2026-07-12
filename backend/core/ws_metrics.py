"""
WebSocket (Channels) ve mutfak yayınları için hafif sayaçlar.

Prometheus bağımlılığı yok; sayaçlar in-memory tutulur (diagnostic / basit SRE).
Process yeniden başlatıldığında sıfırlanır.
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from typing import Any

_lock = threading.Lock()
_broadcast_counts: dict[str, int] = defaultdict(int)
_event_by_type: dict[str, int] = defaultdict(int)
_active_connections: dict[str, int] = defaultdict(int)
_total_connections_opened: dict[str, int] = defaultdict(int)

logger = logging.getLogger(__name__)


def increment_ws_broadcast(event_type: str, branch_id: str | None = None) -> None:
    key = f"{event_type}"
    with _lock:
        _broadcast_counts[key] += 1
        _event_by_type[f"{event_type}"] += 1
    if branch_id:
        logger.debug("ws_metrics event=%s branch_id=%s", event_type, branch_id)


def track_ws_connection_opened(consumer_name: str) -> None:
    with _lock:
        _active_connections[consumer_name] += 1
        _total_connections_opened[consumer_name] += 1


def track_ws_connection_closed(consumer_name: str) -> None:
    with _lock:
        current = _active_connections.get(consumer_name, 0)
        if current > 0:
            _active_connections[consumer_name] = current - 1


def get_ws_metrics_snapshot() -> dict[str, Any]:
    with _lock:
        return {
            "broadcast_by_event": dict(_broadcast_counts),
            "event_totals": dict(_event_by_type),
            "active_connections_by_consumer": dict(_active_connections),
            "total_connections_opened_by_consumer": dict(_total_connections_opened),
        }
