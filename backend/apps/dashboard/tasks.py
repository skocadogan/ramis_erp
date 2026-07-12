"""Dashboard cache warm-up ve periyodik hesaplama görevleri."""
import logging

from celery import shared_task
from django.utils import timezone

from core.celery_task_options import MAINTENANCE_TASK_OPTIONS

logger = logging.getLogger(__name__)


@shared_task(name='apps.dashboard.tasks.warm_dashboard_cache', **MAINTENANCE_TASK_OPTIONS)
def warm_dashboard_cache():
    """
    Dashboard ve inventory dashboard cache'ini önceden hesaplayıp Redis'e yazar.

    Her 3 dakikada bir çalışarak cache miss durumunda ilk isteğin
    12-15 DB sorgusu çekmesini engeller (thundering herd koruması).
    """
    from apps.branches.models import Branch
    from apps.dashboard.selectors import (
        get_dashboard_summary,
        get_inventory_dashboard_summary,
    )

    today = timezone.now().date()
    active_branches = list(
        Branch.objects.filter(is_active=True).values_list('id', flat=True)
    )

    warmed = 0
    for branch_id in active_branches:
        try:
            get_dashboard_summary(branch_ids=[str(branch_id)])
            get_inventory_dashboard_summary(branch_ids=[str(branch_id)])
            warmed += 1
        except Exception:
            logger.exception(
                "Dashboard cache warm-up başarısız (branch_id=%s)", branch_id
            )

    # Süper kullanıcı için tüm şubeler
    try:
        get_dashboard_summary(branch_ids=None)
        get_inventory_dashboard_summary(branch_ids=None)
        warmed += 1
    except Exception:
        logger.exception("Dashboard cache warm-up başarısız (all branches)")

    logger.info(
        "warm_dashboard_cache: %d şube için cache yenilendi (tarih=%s)",
        warmed,
        today.isoformat(),
    )
    return {'warmed_branches': warmed, 'date': today.isoformat()}
