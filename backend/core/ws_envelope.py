"""WebSocket v2 olay zarfı üretimi ve istemci geri uyumluluk dönüşümü."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any

from django.core.cache import cache

_SCOPE_FIELDS = ("table_id", "order_id", "item_id")
_SEQUENCE_TTL = 86400 * 7


def use_ws_event_protocol_v2() -> bool:
    return os.environ.get("WS_EVENT_PROTOCOL_V2", "true").lower() in (
        "true",
        "1",
        "yes",
    )


def _sequence_cache_key(*, branch_id: str, table_id: str | None = None) -> str:
    if table_id:
        return f"ws:seq:table:{table_id}"
    return f"ws:seq:branch:{branch_id}"


def next_ws_sequence(*, branch_id: str, table_id: str | None = None) -> int:
    key = _sequence_cache_key(branch_id=str(branch_id), table_id=table_id)
    try:
        return cache.incr(key)
    except (ValueError, Exception):
        cache.set(key, 1, timeout=_SEQUENCE_TTL)
        return 1


def _split_scope(data: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    payload = dict(data)
    scope: dict[str, str] = {}
    for field in _SCOPE_FIELDS:
        value = payload.pop(field, None)
        if value:
            scope[field] = str(value)
    return payload, scope


def build_ws_event(
    event_type: str,
    branch_id: str,
    data: dict[str, Any],
    **scope: Any,
) -> dict[str, Any]:
    payload, extracted_scope = _split_scope(data)
    merged_scope = {**extracted_scope, **{k: str(v) for k, v in scope.items() if v}}

    table_id = merged_scope.get("table_id")
    sequence = next_ws_sequence(branch_id=str(branch_id), table_id=table_id)

    envelope: dict[str, Any] = {
        "version": 2,
        "event_id": str(uuid.uuid4()),
        "sequence": sequence,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "type": event_type,
        "branch_id": str(branch_id),
        "data": payload,
    }
    for field in _SCOPE_FIELDS:
        if field in merged_scope:
            envelope[field] = merged_scope[field]
    return envelope


def build_channel_event(
    event_type: str,
    branch_id: str,
    message: dict[str, Any],
) -> dict[str, Any]:
    """Channels ``group_send`` yükü: ``type`` + ``message``."""
    if use_ws_event_protocol_v2():
        envelope = build_ws_event(event_type, branch_id, message)
        return {"type": event_type, "message": envelope}
    return {"type": event_type, "message": message}


def table_ids_from_payload(message: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    single = message.get("table_id")
    if single:
        ids.append(str(single))
    for value in message.get("table_ids") or []:
        if value:
            ids.append(str(value))
    return list(dict.fromkeys(ids))


def wrap_legacy_event(event: dict[str, Any]) -> dict[str, Any]:
    """
    Channels olayını istemci tel formatına çevirir.

    v2 zarfında metadata korunur; ``data`` düzleştirilerek legacy alanları taşır.
    """
    message = event.get("message")
    if isinstance(message, dict) and message.get("version") == 2:
        payload = dict(message.get("data") or {})
        for key in ("branch_id", "table_id", "order_id", "item_id"):
            value = message.get(key)
            if value is not None and key not in payload:
                payload[key] = value
        wire: dict[str, Any] = {
            "type": message.get("type") or event.get("type"),
            "data": payload,
            "message": payload,
        }
        for meta in ("version", "event_id", "sequence", "occurred_at", "branch_id"):
            if meta in message:
                wire[meta] = message[meta]
        for key in _SCOPE_FIELDS:
            if key in message and key not in wire:
                wire[key] = message[key]
        return wire

    msg = message if message is not None else event.get("data")
    event_type = event.get("type")
    if isinstance(msg, dict) and not event_type:
        event_type = msg.get("type")
    return {
        "type": event_type,
        "data": msg,
        "message": msg,
    }
