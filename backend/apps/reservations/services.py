from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.branches.models import Table, TableStatus
from apps.branches.services import TableService
from apps.reservations.models import (
    Reservation,
    ReservationBranchSettings,
    ReservationStatus,
)


class ReservationError(Exception):
    pass


def _aware_dt(d, t):
    naive = datetime.combine(d, t)
    if timezone.is_naive(naive):
        return timezone.make_aware(naive, timezone.get_current_timezone())
    return naive


def _overlap(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


def _reservation_info_text(r: Reservation) -> str:
    parts = [r.customer_name.strip()]
    if (r.customer_phone or "").strip():
        parts.append(r.customer_phone.strip())
    return " · ".join(parts)


class ReservationService:
    @staticmethod
    def _get_for_update(reservation_id) -> Reservation:
        r = Reservation.objects.select_for_update().filter(pk=reservation_id, is_active=True).first()
        if not r:
            raise ReservationError(_("Rezervasyon bulunamadı."))
        return r

    @staticmethod
    def _active_statuses():
        return [
            ReservationStatus.PENDING,
            ReservationStatus.CONFIRMED,
            ReservationStatus.SEATED,
        ]

    @classmethod
    def _table_conflict(cls, table_id, start_at, end_at, exclude_reservation_id=None):
        if not table_id:
            return
        qs = Reservation.objects.filter(
            table_id=table_id,
            status__in=cls._active_statuses(),
            is_active=True,
        )
        if exclude_reservation_id:
            qs = qs.exclude(pk=exclude_reservation_id)
        for r in qs:
            rs = _aware_dt(r.scheduled_date, r.scheduled_time)
            re = rs + timedelta(minutes=r.duration_minutes or 120)
            if _overlap(start_at, end_at, rs, re):
                raise ReservationError(_("Bu zaman aralığında masa zaten rezerve."))

    @staticmethod
    @transaction.atomic
    def create_reservation(
        *,
        branch_id,
        customer_name,
        party_size,
        scheduled_date,
        scheduled_time,
        user,
        table_id=None,
        customer_phone="",
        customer_email="",
        duration_minutes=120,
        notes="",
    ) -> Reservation:
        start_at = _aware_dt(scheduled_date, scheduled_time)
        end_at = start_at + timedelta(minutes=duration_minutes)

        if table_id:
            table = Table.objects.select_for_update().filter(pk=table_id, zone__branch_id=branch_id).first()
            if not table:
                raise ReservationError(_("Masa bulunamadı veya şubeye ait değil."))
            if table.status != TableStatus.FREE:
                raise ReservationError(
                    _("Masa müsait değil (rezerve, dolu veya kapalı). Masa planında uygun bir masa seçin.")
                )
            if party_size and table.capacity and party_size > table.capacity:
                raise ReservationError(_("Masa kapasitesi %(n)s kişi.") % {"n": table.capacity})
            ReservationService._table_conflict(table_id, start_at, end_at)

        r = Reservation.objects.create(
            branch_id=branch_id,
            table_id=table_id,
            customer_name=customer_name,
            customer_phone=customer_phone or "",
            customer_email=customer_email or "",
            party_size=party_size,
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
            duration_minutes=duration_minutes,
            notes=notes or "",
            created_by=user if user and getattr(user, "is_authenticated", False) else None,
        )
        ReservationService._sync_table_from_reservation_row(r)
        return r

    @staticmethod
    @transaction.atomic
    def update_reservation(reservation_id, **fields) -> Reservation:
        r = ReservationService._get_for_update(reservation_id)
        if r.status in (ReservationStatus.CANCELLED, ReservationStatus.COMPLETED, ReservationStatus.NO_SHOW):
            raise ReservationError(_("Bu rezervasyon güncellenemez."))

        table_id = fields.get("table_id", r.table_id)
        sched_date = fields.get("scheduled_date", r.scheduled_date)
        sched_time = fields.get("scheduled_time", r.scheduled_time)
        duration = fields.get("duration_minutes", r.duration_minutes)

        start_at = _aware_dt(sched_date, sched_time)
        end_at = start_at + timedelta(minutes=duration or 120)
        ReservationService._table_conflict(table_id, start_at, end_at, exclude_reservation_id=str(r.id))

        if r.status == ReservationStatus.SEATED and "table_id" in fields:
            new_tid = fields["table_id"]
            new_tid_s = str(new_tid) if new_tid else None
            cur_tid = str(r.table_id) if r.table_id else None
            if new_tid_s != cur_tid:
                raise ReservationError(_("Misafir oturmuşken masa değiştirilemez."))

        old_tid = str(r.table_id) if r.table_id else None

        for key in (
            "customer_name",
            "customer_phone",
            "customer_email",
            "party_size",
            "scheduled_date",
            "scheduled_time",
            "duration_minutes",
            "notes",
        ):
            if key in fields and fields[key] is not None:
                setattr(r, key, fields[key])
        if "table_id" in fields:
            r.table_id = fields["table_id"]
        r.save()

        new_tid = str(r.table_id) if r.table_id else None
        if old_tid != new_tid:
            if old_tid:
                TableService.cancel_reservation(old_tid)
            if new_tid:
                tbl = Table.objects.select_for_update().filter(pk=new_tid, zone__branch_id=r.branch_id).first()
                if not tbl:
                    raise ReservationError(_("Masa bulunamadı veya şubeye ait değil."))
                if tbl.status != TableStatus.FREE:
                    raise ReservationError(_("Yeni masa müsait değil."))
                ReservationService._sync_table_from_reservation_row(r)
        elif new_tid and r.status not in (ReservationStatus.SEATED, ReservationStatus.COMPLETED):
            ReservationService._sync_table_from_reservation_row(r)

        return r

    @staticmethod
    @transaction.atomic
    def confirm(reservation_id) -> Reservation:
        r = ReservationService._get_for_update(reservation_id)
        if r.status != ReservationStatus.PENDING:
            raise ReservationError(_("Sadece beklemedeki rezervasyon onaylanır."))
        r.status = ReservationStatus.CONFIRMED
        r.save(update_fields=["status", "updated_at"])
        return r

    @staticmethod
    @transaction.atomic
    def seat(reservation_id) -> Reservation:
        r = ReservationService._get_for_update(reservation_id)
        if r.status not in (ReservationStatus.PENDING, ReservationStatus.CONFIRMED):
            raise ReservationError(_("Rezervasyon oturmaya uygun değil."))
        if not r.table_id:
            raise ReservationError(_("Masa atanmadan oturulamaz."))
        r.status = ReservationStatus.SEATED
        r.save(update_fields=["status", "updated_at"])
        tbl = TableService.open_table(r.table_id)

        from apps.reservations.reservation_alerts import notify_reservation_arrived

        notify_reservation_arrived(r, tbl)
        return r

    @staticmethod
    @transaction.atomic
    def cancel(reservation_id, reason: str = "") -> Reservation:
        r = ReservationService._get_for_update(reservation_id)
        if r.status in (ReservationStatus.CANCELLED, ReservationStatus.COMPLETED):
            raise ReservationError(_("Rezervasyon zaten kapalı."))
        prev_status = r.status
        prev_table = str(r.table_id) if r.table_id else None
        r.status = ReservationStatus.CANCELLED
        if reason:
            r.notes = (r.notes + _("\nİptal: ") + reason).strip()
        r.save(update_fields=["status", "notes", "updated_at"])
        if prev_table and prev_status in (ReservationStatus.PENDING, ReservationStatus.CONFIRMED):
            TableService.cancel_reservation(prev_table, sync_reservation=False)
        from apps.reservations.reservation_alerts import dismiss_pending_due_alerts

        dismiss_pending_due_alerts(
            reservation_id=str(r.id),
            branch_id=str(r.branch_id),
        )
        return r

    @staticmethod
    @transaction.atomic
    def mark_no_show(reservation_id) -> Reservation:
        r = ReservationService._get_for_update(reservation_id)
        if r.status not in (ReservationStatus.PENDING, ReservationStatus.CONFIRMED):
            raise ReservationError(_("Durum gelmedi olarak işaretlenemez."))
        prev_table = str(r.table_id) if r.table_id else None
        r.status = ReservationStatus.NO_SHOW
        r.save(update_fields=["status", "updated_at"])
        if prev_table:
            TableService.cancel_reservation(prev_table, sync_reservation=False)
        from apps.reservations.reservation_alerts import dismiss_pending_due_alerts

        dismiss_pending_due_alerts(
            reservation_id=str(r.id),
            branch_id=str(r.branch_id),
        )
        return r

    @staticmethod
    @transaction.atomic
    def delete_reservation(reservation_id) -> None:
        r = ReservationService._get_for_update(reservation_id)
        prev_status = r.status
        prev_table = str(r.table_id) if r.table_id else None
        if prev_table and prev_status in (
            ReservationStatus.PENDING,
            ReservationStatus.CONFIRMED,
            ReservationStatus.NO_SHOW,
        ):
            TableService.cancel_reservation(prev_table, sync_reservation=False)
        elif prev_table and prev_status in (
            ReservationStatus.CANCELLED,
            ReservationStatus.COMPLETED,
        ):
            TableService.cancel_reservation(prev_table, sync_reservation=False)
        r.delete()

    @staticmethod
    def _sync_table_from_reservation_row(r: Reservation) -> None:
        """Masa modelindeki RESERVED anlığını rezervasyon satırı ile hizalar."""
        if not r.table_id:
            return
        if r.status in (ReservationStatus.CANCELLED, ReservationStatus.COMPLETED, ReservationStatus.NO_SHOW):
            return
        if r.status == ReservationStatus.SEATED:
            return

        info = _reservation_info_text(r)
        scheduled = _aware_dt(r.scheduled_date, r.scheduled_time)
        table = Table.objects.select_for_update().get(pk=r.table_id)

        if table.status == TableStatus.FREE:
            TableService.reserve_table(
                r.table_id,
                info,
                reservation_scheduled_at=scheduled,
                reservation_party_size=r.party_size,
                sync_reservation=False,
            )
        elif table.status == TableStatus.RESERVED:
            TableService.update_reservation_snapshot(
                r.table_id,
                info,
                reservation_scheduled_at=scheduled,
                reservation_party_size=r.party_size,
                sync_reservation=False,
            )
        else:
            raise ReservationError(_("Masa rezerve görüntüsü güncellenemiyor (dolu veya kapalı)."))

    @staticmethod
    def upsert_branch_settings(
        branch_id: str,
        *,
        due_alert_lead_minutes: int,
        due_alert_interval_minutes: int,
    ) -> ReservationBranchSettings:
        obj, _ = ReservationBranchSettings.objects.update_or_create(
            branch_id=branch_id,
            defaults={
                "due_alert_lead_minutes": due_alert_lead_minutes,
                "due_alert_interval_minutes": due_alert_interval_minutes,
                "is_active": True,
            },
        )
        return obj
