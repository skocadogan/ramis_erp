"""Bekleyen garson çağrılarını listeleme ve vardiya kapanışında temizleme."""

from django.utils import timezone
from django.utils.translation import gettext as _

from core.branch_scope import user_may_access_branch

from .call_waiter import compose_waiter_call_message
from .models import WaiterBranchAssignment
from .services import NotificationService


class WaiterCallPendingBadRequest(Exception):
    """Geçersiz istek."""


def _reservation_due_pending_message(*, reservation, table_name: str) -> str:
    from datetime import datetime

    naive = datetime.combine(reservation.scheduled_date, reservation.scheduled_time)
    if timezone.is_naive(naive):
        scheduled = timezone.make_aware(naive, timezone.get_current_timezone())
    else:
        scheduled = naive
    now = timezone.now()
    if now >= scheduled:
        return _(
            "Rezervasyon saati geldi: %(customer)s · %(table)s · %(party)s kişi"
        ) % {
            "customer": reservation.customer_name,
            "table": table_name,
            "party": reservation.party_size,
        }
    minutes = max(1, int((scheduled - now).total_seconds() // 60))
    return _(
        "Rezervasyon yaklaşıyor (%(minutes)s dk): %(customer)s · %(table)s · %(party)s kişi"
    ) % {
        "minutes": minutes,
        "customer": reservation.customer_name,
        "table": table_name,
        "party": reservation.party_size,
    }


def _eligible_table_ids_for_user(user, branch_id) -> set[str] | None:
    """
    Kullanıcının atandığı masa ID'leri.
    ``None`` = tüm masalar (POS / yetkili kullanıcı).
    """
    # Cache'ten veya doğrudan RBAC'den POS yetkisi kontrolü
    from rbac.cache import get_cached_user_permissions

    perms = get_cached_user_permissions(user) or set()
    if "pos.view_pos" in perms:
        return None  # POS — tüm masalar

    from apps.branches.waiter_scope import eligible_table_ids_for

    try:
        WaiterBranchAssignment.objects.get(user=user, branch_id=branch_id)
    except WaiterBranchAssignment.DoesNotExist:
        return set()  # Hiçbir masaya atanmamış
    return eligible_table_ids_for(user, branch_id)


def list_pending_waiter_calls(*, user, branch_id: str) -> list[dict]:
    """Şubedeki PENDING garson çağrılarını WS payload ile uyumlu döndürür."""
    branch_id = (branch_id or "").strip()
    if not branch_id:
        raise WaiterCallPendingBadRequest(_("branch_id zorunludur."))

    if not user_may_access_branch(user, branch_id):
        raise WaiterCallPendingBadRequest(_("Bu şube için yetkiniz yok."))

    eligible = _eligible_table_ids_for_user(user, branch_id)
    # eligible = None → POS, tüm çağrıları görür
    # eligible = set() → atamasız, hiçbir çağrıyı görmez

    from apps.performances.models import WaiterCallLog, WaiterCallStatus

    qs = WaiterCallLog.objects.filter(
        branch_id=branch_id,
        status=WaiterCallStatus.PENDING,
    )
    if eligible is not None:
        qs = qs.filter(table_id__in=eligible)

    logs = qs.select_related("reservation").order_by("-called_at")[:50]

    results = []
    for log in logs:
        entry = {
            "call_id": str(log.id),
            "branch_id": str(log.branch_id),
            "table_id": str(log.table_id) if log.table_id else None,
            "table_name": log.table_name,
            "zone_name": log.zone_name or "",
            "source": log.source or "smart_button",
            "message": compose_waiter_call_message(
                log.table_name,
                (log.customer_message or "").strip() or None,
            ),
            "created_at": log.called_at.isoformat(),
        }
        if log.source == "reservation_due":
            reservation = log.reservation
            if reservation:
                entry["message"] = _reservation_due_pending_message(
                    reservation=reservation,
                    table_name=log.table_name,
                )
            entry["reservation_id"] = str(log.reservation_id) if log.reservation_id else None
            if reservation:
                entry["customer_name"] = reservation.customer_name
        elif log.source == "reservation_arrived":
            reservation = log.reservation
            if reservation:
                entry["message"] = _(
                    "Misafir geldi: %(customer)s · %(table)s · %(party)s kişi"
                ) % {
                    "customer": reservation.customer_name,
                    "table": log.table_name,
                    "party": reservation.party_size,
                }
            entry["reservation_id"] = str(log.reservation_id) if log.reservation_id else None
            if reservation:
                entry["customer_name"] = reservation.customer_name
        results.append(entry)

    return results


def expire_pending_waiter_calls(*, branch_id: str) -> int:
    """
    Vardiya kapanışında bekleyen çağrıları temizler.
    DB kayıtları DISMISSED olur; bağlı istemcilere dismiss_all yayınlanır.
    """
    branch_id = (branch_id or "").strip()
    if not branch_id:
        return 0

    from apps.performances.models import WaiterCallLog, WaiterCallStatus

    pending_count = WaiterCallLog.objects.filter(
        branch_id=branch_id,
        status=WaiterCallStatus.PENDING,
    ).count()
    if pending_count == 0:
        return 0

    NotificationService.broadcast_waiter_call_dismissed(
        branch_id=branch_id,
        dismiss_all=True,
    )
    from apps.performances.services import record_waiter_call_dismiss

    record_waiter_call_dismiss(
        branch_id=branch_id,
        user=None,
        dismiss_all=True,
    )
    return pending_count
