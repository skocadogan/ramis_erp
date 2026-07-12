"""Garson çağrı kayıt servisi — ana akışı bloklamaz, hata yutulur."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import WaiterCallLog, WaiterCallStatus

User = get_user_model()
logger = logging.getLogger(__name__)


def _safe(fn):
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            logger.warning("WaiterCallLog işlemi başarısız", exc_info=True)
            return None

    return wrapper


def _parse_call_uuids(raw_ids: list[str]) -> list[uuid.UUID]:
    parsed: list[uuid.UUID] = []
    for raw in raw_ids:
        try:
            parsed.append(uuid.UUID(str(raw).strip()))
        except (ValueError, AttributeError):
            continue
    return parsed


@_safe
def record_waiter_call(
    *,
    call_id: str,
    branch_id: str,
    table_id: str,
    table_name: str,
    zone_name: str = '',
    source: str = 'smart_button',
    notified_count: int = 0,
    called_at: datetime | None = None,
    reservation_id: str | None = None,
    customer_message: str = '',
) -> WaiterCallLog | None:
    ts = called_at or timezone.now()
    return WaiterCallLog.objects.create(
        id=uuid.UUID(str(call_id)),
        branch_id=branch_id,
        table_id=table_id,
        table_name=table_name,
        zone_name=zone_name or '',
        source=source or 'smart_button',
        status=WaiterCallStatus.PENDING,
        notified_count=max(0, int(notified_count)),
        called_at=ts,
        reservation_id=reservation_id,
        customer_message=(customer_message or '').strip()[:500],
    )


@_safe
def record_waiter_call_dismiss(
    *,
    branch_id: str,
    user,
    call_id: str | None = None,
    call_ids: list[str] | None = None,
    dismiss_all: bool = False,
) -> int:
    now = timezone.now()
    qs = WaiterCallLog.objects.filter(
        branch_id=branch_id,
        status=WaiterCallStatus.PENDING,
    )

    if dismiss_all:
        pending = list(qs.only('id', 'called_at'))
    else:
        ids: list[str] = []
        if call_id:
            ids.append(str(call_id).strip())
        if call_ids:
            ids.extend(str(x).strip() for x in call_ids if str(x).strip())
        uuids = _parse_call_uuids(ids)
        if not uuids:
            return 0
        pending = list(qs.filter(id__in=uuids).only('id', 'called_at'))

    updated = 0
    for log in pending:
        seconds = max(0, int((now - log.called_at).total_seconds()))
        WaiterCallLog.objects.filter(pk=log.pk).update(
            status=WaiterCallStatus.DISMISSED,
            dismissed_at=now,
            dismissed_by_id=getattr(user, 'pk', None),
            response_seconds=seconds,
        )
        updated += 1
    return updated
