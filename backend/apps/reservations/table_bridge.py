"""Masa düzeyi rezervasyon snapshot → Reservation satırı (Celery uyarıları için)."""
from __future__ import annotations

from datetime import datetime

from django.utils import timezone
from django.utils.translation import gettext as _

from apps.branches.models import Table
from apps.reservations.models import Reservation, ReservationStatus


def _aware_dt(d, t):
    naive = datetime.combine(d, t)
    if timezone.is_naive(naive):
        return timezone.make_aware(naive, timezone.get_current_timezone())
    return naive


def _parse_reservation_info(info: str) -> tuple[str, str]:
    text = (info or "").strip()
    if not text:
        return str(_("Misafir")), ""
    if " · " in text:
        name, phone = text.split(" · ", 1)
        return (name.strip() or text), phone.strip()
    return text, ""


def _scheduled_parts(scheduled_at) -> tuple | None:
    if scheduled_at is None:
        return None
    dt = scheduled_at
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    local = timezone.localtime(dt)
    return local.date(), local.time()


def ensure_reservation_for_table(
    table: Table,
    *,
    reservation_info: str,
    reservation_scheduled_at=None,
    reservation_party_size=None,
) -> Reservation | None:
    """
    Table RESERVED alanlarından Reservation upsert.
    scheduled_at yoksa satır oluşturulmaz (saati-geldi uyarısı anlamsız).
    """
    parts = _scheduled_parts(reservation_scheduled_at)
    if parts is None:
        return None

    scheduled_date, scheduled_time = parts
    customer_name, customer_phone = _parse_reservation_info(reservation_info)
    party_size = max(1, int(reservation_party_size or 1))
    branch_id = table.zone.branch_id if table.zone_id else None
    if not branch_id:
        return None

    active = (
        Reservation.objects.filter(
            table_id=table.id,
            status__in=[ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
            is_active=True,
        )
        .order_by("-updated_at")
        .first()
    )

    new_start = _aware_dt(scheduled_date, scheduled_time)

    if active:
        update_fields = [
            "customer_name",
            "customer_phone",
            "party_size",
            "scheduled_date",
            "scheduled_time",
            "updated_at",
        ]
        active.customer_name = customer_name
        active.customer_phone = customer_phone
        active.party_size = party_size
        active.scheduled_date = scheduled_date
        active.scheduled_time = scheduled_time
        if active.due_notified_at and new_start > timezone.now():
            active.due_notified_at = None
            update_fields.append("due_notified_at")
        active.save(update_fields=update_fields)
        return active

    return Reservation.objects.create(
        branch_id=branch_id,
        table_id=table.id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        party_size=party_size,
        scheduled_date=scheduled_date,
        scheduled_time=scheduled_time,
        duration_minutes=120,
        status=ReservationStatus.CONFIRMED,
    )


def cancel_active_reservations_for_table(table_id, *, dismiss_alerts: bool = True) -> int:
    """Masaya bağlı bekleyen/onaylı rezervasyonları iptal eder (masa alanını değiştirmez)."""
    from apps.reservations.reservation_alerts import dismiss_pending_due_alerts

    qs = Reservation.objects.filter(
        table_id=table_id,
        status__in=[ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
        is_active=True,
    )
    count = 0
    for r in qs:
        r.status = ReservationStatus.CANCELLED
        r.save(update_fields=["status", "updated_at"])
        if dismiss_alerts:
            dismiss_pending_due_alerts(
                reservation_id=str(r.id),
                branch_id=str(r.branch_id),
            )
        count += 1
    return count
