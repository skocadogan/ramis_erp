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
    """Şube başına KDS/POS invalidasyon kapsamlarını kayıpsız birleştirir."""
    if not branch_id:
        return
    _ensure_state()
    bid = str(branch_id)
    payload = _state.kds_refresh.get(bid) or {
        "reasons": set(),
        "order_ids": set(),
        "table_ids": set(),
        "item_ids": set(),
        "extra": {},
    }
    payload["reasons"].add(str(reason))
    payload["reason"] = reason

    for singular in ("order_id", "table_id", "item_id"):
        plural = f"{singular}s"
        value = extra.pop(singular, None)
        if value:
            payload[plural].add(str(value))
        values = extra.pop(plural, None)
        if values:
            if isinstance(values, (str, bytes)):
                values = [values]
            payload[plural].update(str(item) for item in values if item)

    payload["extra"].update(extra)
    _state.kds_refresh[bid] = payload
    _register_commit_hook()


def schedule_order_status_changed(branch_id, message: dict[str, Any]) -> None:
    """Her durum deltasını yalnız başarılı transaction commit'inden sonra yayınlar."""
    if not branch_id:
        return
    bid = str(branch_id)
    payload = dict(message)

    def _broadcast() -> None:
        from apps.orders.ws_broadcast import broadcast_kitchen_order_status_changed

        broadcast_kitchen_order_status_changed(bid, payload)

    transaction.on_commit(_broadcast)


def schedule_prep_update(
    branch_id,
    station_id=None,
    *,
    task_pk=None,
    removed_task_id=None,
    refresh_all=False,
) -> None:
    """Hazırlık WS yayınını yalnız başarılı transaction commit'inden sonra gönderir."""
    if not branch_id:
        return
    bid = str(branch_id)
    sid = str(station_id) if station_id else None
    task_pk_str = str(task_pk) if task_pk else None
    removed = str(removed_task_id) if removed_task_id else None
    do_refresh_all = bool(refresh_all)

    def _broadcast() -> None:
        from apps.prep.models import PrepTask
        from apps.prep.ws_broadcast import broadcast_prep_update

        task = None
        if task_pk_str and not do_refresh_all and not removed:
            task = PrepTask.objects.filter(pk=task_pk_str, is_active=True).first()

        try:
            broadcast_prep_update(
                bid,
                sid,
                task=task,
                removed_task_id=removed,
                refresh_all=do_refresh_all,
            )
        except Exception:
            logger.exception(
                "Ertelenmiş prep WS yayını başarısız (branch_id=%s)", bid
            )

    transaction.on_commit(_broadcast)


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
            reason = str(payload.get("reason", "unknown"))
            message = dict(payload.get("extra", {}))
            reasons = sorted(payload.get("reasons", set()))
            if reasons:
                message["reasons"] = reasons
            for plural in ("order_ids", "table_ids", "item_ids"):
                values = sorted(payload.get(plural, set()))
                if not values:
                    continue
                message[plural] = values
                if len(values) == 1:
                    message[plural[:-1]] = values[0]
            try:
                broadcast_kds_refresh(branch_id, reason, **message)
            except Exception:
                logger.exception(
                    "Ertelenmiş KDS WS yayını başarısız (branch_id=%s)", branch_id
                )


def reset_deferred_state_for_tests() -> None:
    """Test izolasyonu."""
    _state.table_broadcasts = {}
    _state.kds_refresh = {}
