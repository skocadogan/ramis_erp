"""Garson çağrısı görüldü durumunun tüm istemcilerde senkronu."""
from __future__ import annotations

from django.utils.translation import gettext as _

from core.branch_scope import user_may_access_branch

from .services import NotificationService


class WaiterCallDismissBadRequest(Exception):
    """Geçersiz istek gövdesi."""


def _resolve_dismiss_waiter_ids(call_ids: list[str]) -> list[int] | None:
    """
    Verilen çağrı ID'lerine ait masalara atanmış garson ID'lerini döndürür.

    Eğer herhangi bir çağrının masası yoksa (rezervasyon bildirimi vb.)
    ``None`` döner = herkese gitmeli.
    """
    from apps.performances.models import WaiterCallLog

    logs = list(
        WaiterCallLog.objects.filter(id__in=call_ids)
        .select_related("table", "table__zone", "table__zone__branch")
        .defer("notified_count", "response_seconds", "dismissed_at", "dismissed_by")
    )

    if not logs:
        return None

    # Herhangi bir çağrının masası yoksa → herkese gitmeli (rezervasyon bildirimi)
    tables = [log.table for log in logs if log.table_id is not None]
    if not tables:
        return None

    from django.db.models import Q

    from .models import WaiterBranchAssignment

    all_ids: set[int] = set()
    for table in tables:
        branch_id = table.zone.branch_id
        waiter_ids = WaiterBranchAssignment.objects.filter(
            branch_id=branch_id,
            user__is_active=True,
        ).filter(
            Q(tables=table) | Q(zones=table.zone)
        ).values_list("user_id", flat=True).distinct()
        all_ids.update(waiter_ids)

    # User model UUID PK kullanır → msgpack için str'e çevir
    return [str(x) for x in all_ids] if all_ids else None


def dismiss_waiter_calls(
    *,
    user,
    branch_id: str,
    call_id: str | None = None,
    call_ids: list[str] | None = None,
    dismiss_all: bool = False,
) -> dict:
    branch_id = (branch_id or "").strip()
    if not branch_id:
        raise WaiterCallDismissBadRequest(_("branch_id zorunludur."))

    if not user_may_access_branch(user, branch_id):
        raise WaiterCallDismissBadRequest(_("Bu şube için yetkiniz yok."))

    if dismiss_all:
        NotificationService.broadcast_waiter_call_dismissed(
            branch_id=branch_id,
            dismiss_all=True,
        )
        from apps.performances.services import record_waiter_call_dismiss

        record_waiter_call_dismiss(
            branch_id=branch_id,
            user=user,
            dismiss_all=True,
        )
        return {"status": "ok", "dismiss_all": True, "branch_id": branch_id}

    ids: list[str] = []
    if call_id:
        ids.append(str(call_id).strip())
    if call_ids:
        ids.extend(str(x).strip() for x in call_ids if str(x).strip())

    ids = list(dict.fromkeys(ids))
    if not ids:
        raise WaiterCallDismissBadRequest(
            _("call_id, call_ids veya dismiss_all belirtilmelidir.")
        )

    assigned_waiter_ids = _resolve_dismiss_waiter_ids(ids)
    NotificationService.broadcast_waiter_call_dismissed(
        branch_id=branch_id,
        call_ids=ids,
        assigned_waiter_ids=assigned_waiter_ids,
    )
    from apps.performances.services import record_waiter_call_dismiss

    record_waiter_call_dismiss(
        branch_id=branch_id,
        user=user,
        call_ids=ids,
    )
    return {"status": "ok", "call_ids": ids, "branch_id": branch_id}
