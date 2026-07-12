"""Transaction kapsamında WebSocket yayınlarını birleştirip commit sonrasına erteler."""


import logging
import threading
from typing import Any

from django.db import transaction

logger = logging.getLogger(__name__)

_state = threading.local()


def _ensure_state() -> None:
    if not hasattr(_state, "table_broadcasts"):
        _state.table_broadcasts: dict[str, str] = {}
    if not hasattr(_state, "kds_refresh"):
        _state.kds_refresh: dict[str, dict[str, Any]] = {}


def _register_commit_hook() -> None:
    """Her schedule çağrısında on_commit kaydı; rollback'te Django callback'i siler."""
    transaction.on_commit(_flush_all)


def schedule_table_broadcast(table_id, action: str = "upsert") -> None:
    """Aynı masa için transaction içindeki tekrarları tek WS olayına indirger."""
    if not table_id:
        return
    _ensure_state()
    _state.table_broadcasts[str(table_id)] = action
    _register_commit_hook()


def schedule_kds_refresh(branch_id, reason: str = "unknown", **extra: Any) -> None:
    """Şube başına KDS/POS sync yenileme sinyalini commit sonrasına erteler."""
    if not branch_id:
        return
    _ensure_state()
    bid = str(branch_id)
    payload = _state.kds_refresh.get(bid) or {}
    payload["reason"] = reason
    payload.update(extra)
    _state.kds_refresh[bid] = payload
    _register_commit_hook()


def _flush_all() -> None:
    tables = dict(getattr(_state, "table_broadcasts", {}))
    kds = dict(getattr(_state, "kds_refresh", {}))
    _state.table_broadcasts = {}
    _state.kds_refresh = {}

    if tables:
        from apps.branches.selectors import get_table_with_active_orders
        from apps.branches.signals import broadcast_table_change

        for table_id, action in tables.items():
            try:
                table = get_table_with_active_orders(table_id)
                if table:
                    broadcast_table_change(table, action)
            except Exception:
                logger.exception(
                    "Ertelenmiş masa WS yayını başarısız (table_id=%s)", table_id
                )

    if kds:
        from apps.orders.ws_broadcast import broadcast_kds_refresh

        for branch_id, payload in kds.items():
            reason = str(payload.pop("reason", "unknown"))
            try:
                broadcast_kds_refresh(branch_id, reason, **payload)
            except Exception:
                logger.exception(
                    "Ertelenmiş KDS WS yayını başarısız (branch_id=%s)", branch_id
                )


def reset_deferred_state_for_tests() -> None:
    """Test izolasyonu."""
    _state.table_broadcasts = {}
    _state.kds_refresh = {}
