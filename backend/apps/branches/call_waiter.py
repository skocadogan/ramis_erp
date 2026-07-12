"""Akıllı buton / harici istemcilerden garson çağrısı."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.utils.translation import gettext as _

from .models import Table, TableStatus, WaiterBranchAssignment
from .services import NotificationService


CALL_WAITER_MESSAGE_MAX_LEN = 500


def call_waiter_cooldown_seconds() -> int:
    return int(getattr(settings, "CALL_WAITER_COOLDOWN_SECONDS", 30))


def normalize_customer_message(message: str | None) -> str | None:
    if message is None:
        return None
    stripped = message.strip()
    if not stripped:
        return None
    return stripped[:CALL_WAITER_MESSAGE_MAX_LEN]


def compose_waiter_call_message(
    table_name: str,
    customer_message: str | None = None,
) -> str:
    base = _("%(table)s masasından garson çağrısı") % {"table": table_name}
    if customer_message:
        return f"{base}: {customer_message}"
    return base


def _cooldown_cache_key(table_id: str) -> str:
    return f"call_waiter:{table_id}"


def waiter_ids_for_table(table: Table) -> list[str]:
    """
    Masaya atanmış garson ID'lerini (str UUID) döndürür.

    Kapsam: masaya/zone'a doğrudan atanmış garsonlar ∪ şube geneli atanmış garsonlar
    (zones ve tables ikisi de boş olan WaiterBranchAssignment → tüm masaları kapsar).
    """
    branch_id = table.zone.branch_id
    from django.db.models import Count, Q

    # Masaya/zone'a özel atanmışlar
    specific_ids = set(
        WaiterBranchAssignment.objects.filter(
            branch_id=branch_id,
            user__is_active=True,
        )
        .filter(Q(tables=table) | Q(zones=table.zone))
        .values_list("user_id", flat=True)
        .distinct()
    )

    # Şube geneli atanmışlar (hiç zone/masa belirtilmemiş)
    branch_wide_ids = set(
        WaiterBranchAssignment.objects.filter(
            branch_id=branch_id,
            user__is_active=True,
        )
        .annotate(zone_count=Count("zones"), table_count=Count("tables"))
        .filter(zone_count=0, table_count=0)
        .values_list("user_id", flat=True)
        .distinct()
    )

    return [str(x) for x in specific_ids | branch_wide_ids]


def models_q_for_table(table: Table):
    from django.db.models import Q

    return Q(tables=table) | Q(zones=table.zone)


@dataclass(frozen=True)
class CallWaiterResult:
    status: str
    table_id: str
    table_name: str | None = None
    notified_count: int = 0
    reason: str | None = None
    call_id: str | None = None


class CallWaiterNotFound(Exception):
    """Masa yok, pasif veya garson ataması yok."""


class CallWaiterBadRequest(Exception):
    """Geçersiz table_id (UUID formatı)."""


def parse_table_id(table_id: str) -> str:
    """UUID doğrula; geçersizse CallWaiterBadRequest."""
    try:
        return str(uuid.UUID(table_id))
    except ValueError as exc:
        raise CallWaiterBadRequest(_("Geçersiz table_id.")) from exc


def call_waiter(table_id: str, *, message: str | None = None) -> CallWaiterResult:
    """
    Garson çağrısı işler.
    - Atama yok → CallWaiterNotFound (404)
    - Cooldown içinde → ignored (200)
    - Başarılı → accepted + WS bildirimi
    """
    table_id = parse_table_id(table_id)

    try:
        table = (
            Table.objects.select_related("zone", "zone__branch")
            .get(pk=table_id, is_active=True)
        )
    except (Table.DoesNotExist, ValueError):
        raise CallWaiterNotFound(_("Masa bulunamadı.")) from None

    if table.status == TableStatus.OUT_OF_SERVICE:
        raise CallWaiterNotFound(_("Masa hizmet dışı."))

    waiter_ids = waiter_ids_for_table(table)
    if not waiter_ids:
        raise CallWaiterNotFound(_("Bu masa için atanmış garson bulunamadı."))

    cache_key = _cooldown_cache_key(str(table.id))
    if cache.get(cache_key):
        return CallWaiterResult(
            status="ignored",
            table_id=str(table.id),
            table_name=table.name,
            reason="rate_limited",
        )

    call_id = str(uuid.uuid4())
    customer_message = normalize_customer_message(message)
    notification_message = compose_waiter_call_message(table.name, customer_message)
    payload = {
        "call_id": call_id,
        "branch_id": str(table.zone.branch_id),
        "source": "smart_button",
        "created_at": timezone.now().isoformat(),
    }
    if customer_message:
        payload["customer_message"] = customer_message
    payload["assigned_waiter_ids"] = waiter_ids
    notified_count = len(waiter_ids)
    NotificationService.broadcast_waiter_call(
        table=table,
        message=notification_message,
        data=payload,
    )

    from apps.performances.services import record_waiter_call

    record_waiter_call(
        call_id=call_id,
        branch_id=str(table.zone.branch_id),
        table_id=str(table.id),
        table_name=table.name,
        zone_name=table.zone.name,
        source=payload.get("source", "smart_button"),
        notified_count=notified_count,
        called_at=timezone.now(),
        customer_message=customer_message or "",
    )

    cache.set(cache_key, True, timeout=call_waiter_cooldown_seconds())

    return CallWaiterResult(
        status="accepted",
        table_id=str(table.id),
        table_name=table.name,
        notified_count=notified_count,
        call_id=call_id,
    )
