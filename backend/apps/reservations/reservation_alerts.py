"""Rezervasyon geliş bildirimi ayarları — lead/interval ile tekrarlayan uyarılar."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.branches.models import Table
from apps.branches.services import NotificationService
from apps.reservations.models import Reservation, ReservationStatus
from apps.reservations.selectors import ReservationAlertSettings, get_reservation_alert_settings


RESERVATION_DUE_SOURCE = "reservation_due"
RESERVATION_ARRIVED_SOURCE = "reservation_arrived"

_settings_cache: dict[str, ReservationAlertSettings] = {}


def _branch_alert_settings(branch_id) -> ReservationAlertSettings:
    key = str(branch_id)
    if key not in _settings_cache:
        _settings_cache[key] = get_reservation_alert_settings(branch_id)
    return _settings_cache[key]


def clear_reservation_alert_settings_cache() -> None:
    _settings_cache.clear()


def _aware_dt(d, t):
    naive = datetime.combine(d, t)
    if timezone.is_naive(naive):
        return timezone.make_aware(naive, timezone.get_current_timezone())
    return naive


def _reservation_due_message(reservation: Reservation, table: Table | None) -> str:
    table_part = table.name if table else _("masa atanmadı")
    return _(
        "Rezervasyon saati geldi: %(customer)s · %(table)s · %(party)s kişi"
    ) % {
        "customer": reservation.customer_name,
        "table": table_part,
        "party": reservation.party_size,
    }


def _reservation_upcoming_message(
    reservation: Reservation,
    table: Table | None,
    *,
    minutes_until: int,
) -> str:
    table_part = table.name if table else _("masa atanmadı")
    return _(
        "Rezervasyon yaklaşıyor (%(minutes)s dk): %(customer)s · %(table)s · %(party)s kişi"
    ) % {
        "minutes": minutes_until,
        "customer": reservation.customer_name,
        "table": table_part,
        "party": reservation.party_size,
    }


def _reservation_arrived_message(reservation: Reservation, table: Table) -> str:
    return _(
        "Misafir geldi: %(customer)s · %(table)s · %(party)s kişi"
    ) % {
        "customer": reservation.customer_name,
        "table": table.name,
        "party": reservation.party_size,
    }


def _waiter_call_payload(
    *,
    call_id: str,
    reservation: Reservation,
    table: Table | None,
    source: str,
) -> dict:
    payload: dict = {
        "call_id": call_id,
        "branch_id": str(reservation.branch_id),
        "source": source,
        "reservation_id": str(reservation.id),
        "customer_name": reservation.customer_name,
        "party_size": reservation.party_size,
        "scheduled_at": _aware_dt(
            reservation.scheduled_date, reservation.scheduled_time
        ).isoformat(),
        "created_at": timezone.now().isoformat(),
    }
    if table is not None:
        payload["table_id"] = str(table.id)
    return payload


def _staff_table(reservation: Reservation, table: Table | None) -> Table | None:
    if table is not None:
        return table
    return (
        Table.objects.filter(zone__branch_id=reservation.branch_id, is_active=True)
        .select_related("zone")
        .first()
    )


def _broadcast_reservation_alert(
    *,
    reservation: Reservation,
    table: Table | None,
    message: str,
    source: str,
    staff_event: str,
) -> None:
    """
    Garson çağrı kanalı (masa varsa) + personel bildirim kanalına yayınlar.
    """
    call_id = str(uuid.uuid4())
    payload = _waiter_call_payload(
        call_id=call_id,
        reservation=reservation,
        table=table,
        source=source,
    )

    if table is not None:
        from apps.branches.call_waiter import waiter_ids_for_table

        waiter_ids = waiter_ids_for_table(table)
        if waiter_ids:
            payload["assigned_waiter_ids"] = waiter_ids

        NotificationService.broadcast_waiter_call(
            table=table,
            message=message,
            data=payload,
        )
        from apps.performances.services import record_waiter_call

        record_waiter_call(
            call_id=call_id,
            branch_id=str(reservation.branch_id),
            table_id=str(table.id),
            table_name=table.name,
            zone_name=table.zone.name if table.zone_id else "",
            source=source,
            notified_count=len(waiter_ids) if waiter_ids else 1,
            called_at=timezone.now(),
            reservation_id=str(reservation.id),
        )

    staff_table = _staff_table(reservation, table)
    if staff_table is not None:
        NotificationService.broadcast_to_staff_notifications_branch(
            table=staff_table,
            event_type=staff_event,
            message=message,
            data=payload,
        )


def dismiss_pending_due_alerts(*, reservation_id: str, branch_id: str) -> None:
    """Rezervasyon oturdu/iptal olduğunda bekleyen 'saati geldi' uyarılarını kapatır."""
    from apps.performances.models import WaiterCallLog, WaiterCallStatus
    from apps.performances.services import record_waiter_call_dismiss

    pending_ids = list(
        WaiterCallLog.objects.filter(
            reservation_id=reservation_id,
            branch_id=branch_id,
            source=RESERVATION_DUE_SOURCE,
            status=WaiterCallStatus.PENDING,
        ).values_list("id", flat=True)
    )
    if not pending_ids:
        return

    call_ids = [str(x) for x in pending_ids]
    NotificationService.broadcast_waiter_call_dismissed(
        branch_id=branch_id,
        call_ids=call_ids,
    )
    record_waiter_call_dismiss(
        branch_id=branch_id,
        user=None,
        call_ids=call_ids,
    )


def _should_notify_reservation(
    reservation: Reservation,
    *,
    now,
    settings: ReservationAlertSettings,
    cutoff,
) -> bool:
    scheduled = _aware_dt(reservation.scheduled_date, reservation.scheduled_time)
    if scheduled < cutoff:
        return False
    alert_start = scheduled - timedelta(minutes=settings.due_alert_lead_minutes)
    if now < alert_start:
        return False
    if reservation.due_notified_at is None:
        return True
    interval = timedelta(minutes=settings.due_alert_interval_minutes)
    return now >= reservation.due_notified_at + interval


@transaction.atomic
def notify_reservation_due(reservation: Reservation) -> bool:
    """
    Rezervasyon geliş bildirimi — şube ayarına göre lead/interval ile tekrarlanır.
    True dönerse bildirim gönderildi.
    """
    # table null olabilir; select_for_update + select_related outer join'de PG hata verir.
    r = (
        Reservation.objects.select_for_update(of=("self",))
        .select_related("table", "table__zone")
        .get(pk=reservation.pk)
    )
    if r.status not in (ReservationStatus.PENDING, ReservationStatus.CONFIRMED):
        return False

    settings = _branch_alert_settings(r.branch_id)
    now = timezone.now()
    scheduled = _aware_dt(r.scheduled_date, r.scheduled_time)
    cutoff = now - timedelta(minutes=24 * 60)
    if not _should_notify_reservation(r, now=now, settings=settings, cutoff=cutoff):
        return False

    table = r.table
    if r.due_notified_at:
        dismiss_pending_due_alerts(
            reservation_id=str(r.id),
            branch_id=str(r.branch_id),
        )

    if now >= scheduled:
        message = _reservation_due_message(r, table)
    else:
        minutes_until = max(1, int((scheduled - now).total_seconds() // 60))
        message = _reservation_upcoming_message(r, table, minutes_until=minutes_until)

    _broadcast_reservation_alert(
        reservation=r,
        table=table,
        message=message,
        source=RESERVATION_DUE_SOURCE,
        staff_event="reservation_due",
    )

    r.due_notified_at = now
    r.save(update_fields=["due_notified_at", "updated_at"])
    return True


def notify_reservation_arrived(reservation: Reservation, table: Table) -> None:
    """Misafir oturdu — garson/mobil/POS uyarısı."""
    dismiss_pending_due_alerts(
        reservation_id=str(reservation.id),
        branch_id=str(reservation.branch_id),
    )
    message = _reservation_arrived_message(reservation, table)
    _broadcast_reservation_alert(
        reservation=reservation,
        table=table,
        message=message,
        source=RESERVATION_ARRIVED_SOURCE,
        staff_event="guest_arrived",
    )


def find_due_reservations(*, window_minutes: int = 24 * 60) -> list[Reservation]:
    """
    Şube ayarına göre bildirim penceresine girmiş aktif rezervasyonlar.
    window_minutes: çok eski kayıtları taramayı sınırlar.
    """
    now = timezone.now()
    cutoff = now - timedelta(minutes=window_minutes)
    qs = (
        Reservation.objects.filter(
            is_active=True,
            status__in=[ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
        )
        .select_related("table", "table__zone", "branch")
        .order_by("scheduled_date", "scheduled_time")
    )
    due: list[Reservation] = []
    for r in qs.iterator():
        settings = _branch_alert_settings(r.branch_id)
        if _should_notify_reservation(r, now=now, settings=settings, cutoff=cutoff):
            due.append(r)
    return due
