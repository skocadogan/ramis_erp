import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core.celery_task_options import MAINTENANCE_TASK_OPTIONS

logger = logging.getLogger(__name__)


@shared_task(
    name="apps.prep.tasks.cancel_overdue_prep_tasks",
    **MAINTENANCE_TASK_OPTIONS,
)
def cancel_overdue_prep_tasks(deadline_minutes_past: int | None = None):
    """
    Süresi geçmiş (deadline aşılmış) ve hâlâ PENDING/IN_PROGRESS olan
    hazırlık görevlerini otomatik olarak iptal eder.

    ``deadline_minutes_past``: deadline'dan kaç dakika sonra iptal edileceği.
    Varsayılan: ``PREP_TASK_CANCEL_OVERDUE_MINUTES`` ortam değişkeni (yoksa 60).
    """
    from .models import PrepTask, PrepStatus
    from .ws_broadcast import broadcast_prep_update

    if deadline_minutes_past is None:
        deadline_minutes_past = getattr(
            settings, "PREP_TASK_CANCEL_OVERDUE_MINUTES", 60
        )

    cutoff = timezone.now() - timedelta(minutes=deadline_minutes_past)

    overdue_tasks = PrepTask.objects.filter(
        status__in=[PrepStatus.PENDING, PrepStatus.IN_PROGRESS],
        deadline__lt=cutoff,
        is_active=True,
    ).select_related("branch")

    total = overdue_tasks.count()
    if total == 0:
        logger.info(
            "cancel_overdue_prep_tasks: süresi geçmiş görev bulunamadı."
        )
        return {"cancelled_count": 0}

    with transaction.atomic():
        # Her bir görevi iptal et ve broadcast yap
        for task in overdue_tasks:
            task.status = PrepStatus.CANCELLED
            task.save(update_fields=["status", "updated_at"])

            # WebSocket bildirimi — istemci önbelleğini güncelle
            try:
                broadcast_prep_update(
                    branch_id=task.branch_id,
                    station_id=task.station_id,
                    task=task,
                )
            except Exception:
                logger.exception(
                    "cancel_overdue_prep_tasks: broadcast başarısız (task=%s)",
                    task.pk,
                )

    logger.warning(
        "cancel_overdue_prep_tasks: %d adet süresi geçmiş görev iptal edildi "
        "(cutoff=%s, deadline_minutes_past=%d).",
        total,
        cutoff.isoformat(),
        deadline_minutes_past,
    )
    return {"cancelled_count": total}
