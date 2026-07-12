from __future__ import annotations

from django.db.models import QuerySet
from django.utils import timezone

from .models import PrepBranchSettings, PrepTask, PrepStatus, PrepTemplate


def branch_id_for_prep_task_list_defaults(request) -> str | None:
    """
    ``include_historic_completed`` verilmediğinde şube ayarı için kullanılacak şube kimliği.

    Önce ``branch_id`` query param; yoksa süper kullanıcı dışında ``request.user.branch_id``.
    Çok şubeli süper kullanıcıda param yoksa None (tek varsayılan uygulanamaz).
    """
    bid = (request.query_params.get("branch_id") or "").strip()
    if bid:
        return bid
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if getattr(user, "is_superuser", False):
        return None
    ub = getattr(user, "branch_id", None)
    return str(ub) if ub else None


def default_include_historic_completed_for_prep_list(request) -> bool:
    """
    Query'de ``include_historic_completed`` yokken kullanılacak değer.

    - ``True``: tam liste (eski gün tamamlananlar dahil).
    - ``False``: operasyon modu (dün ve öncesi oluşturulmuş tamamlananlar hariç).

    Şube çözülemezse veya ``PrepBranchSettings`` kaydı yoksa ``False`` (mevcut KDS
    davranışı: parametre gönderilmemesi = operasyonel).
    Kayıt varsa ``management_hide_old_completed`` ile terslenir.
    """
    bid = branch_id_for_prep_task_list_defaults(request)
    if not bid:
        return False
    row = PrepBranchSettings.objects.filter(
            branch_id=bid, is_active=True
        ).first()
    if row is None:
        return False
    return not row.management_hide_old_completed


def get_active_prep_tasks(
    branch_id: str = None,
    station_id: str = None,
    *,
    include_historic_completed: bool = False,
    status_group: str | None = None,
    user=None,
    has_manage_templates: bool = False,
) -> QuerySet:
    """
    Mutfak / hazırlık listesi için görevler.

    Varsayılanda o günden (takvim) önce oluşturulup tamamlanmış kayıtlar listeden
    düşer; şablondan her gün yeni satır üretilse de dünkü biten görevler KDS’de
    "aktif" birikmez. Tam geçmiş için ``include_historic_completed=True``.
    """
    qs = PrepTask.objects.filter(is_active=True).exclude(status=PrepStatus.CANCELLED)

    if not include_historic_completed:
        today = timezone.localdate()
        # Tamamlanmış + bugünden önce oluşturulmuş → arşiv; tahta sadece bugünkü açık/biten işe odaklansın
        qs = qs.exclude(
            status=PrepStatus.COMPLETED,
            created_at__date__lt=today,
        )

    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    if station_id:
        qs = qs.filter(station_id=station_id)

    # İzin bazlı filtreleme:
    # - prep.manage_templates → tüm görevler görünür
    # - Sadece prep.view_preptask → herkese atanan (assigned_to=None) + sadece kendisine atanan görevler
    if user is not None and not has_manage_templates:
        from django.db.models import Q
        qs = qs.filter(Q(assigned_to__isnull=True) | Q(assigned_to=user))

    status_group = (status_group or "").strip().lower()
    if status_group == "active":
        qs = qs.filter(status__in=[PrepStatus.PENDING, PrepStatus.IN_PROGRESS])
    elif status_group == "completed":
        qs = qs.filter(status=PrepStatus.COMPLETED)
        if user is not None and not has_manage_templates:
            has_add = (
                hasattr(user, "has_permission")
                and user.has_permission("prep.add_preptask")
            )
            if not has_add:
                qs = qs.filter(completed_by=user)

    return qs.select_related("station", "assigned_to", "completed_by").prefetch_related("assignments")

def get_active_prep_templates(branch_id: str = None) -> QuerySet:
    """Aktif hazırlık şablonlarını getirir."""
    qs = PrepTemplate.objects.filter(is_active=True)
    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    return qs

def get_prep_task_by_id(task_id: str) -> PrepTask:
    """ID'ye göre aktif görev getirir."""
    return (
        PrepTask.objects.filter(id=task_id, is_active=True)
        .select_related('station', 'assigned_to', 'completed_by')
        .prefetch_related('assignments')
        .first()
    )
