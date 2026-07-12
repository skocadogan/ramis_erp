"""Masa temizlik zamanlayıcı görevleri."""

import logging

from celery import shared_task
from django.utils import timezone

from core.celery_task_options import MAINTENANCE_TASK_OPTIONS

logger = logging.getLogger(__name__)


@shared_task(name='apps.branches.tasks.release_table_from_cleaning', **MAINTENANCE_TASK_OPTIONS)
def release_table_from_cleaning(table_id: str) -> bool:
    from apps.branches.models import Table, TableStatus
    from apps.branches.services import TableService
    from apps.branches.table_cleaning import compute_cleaning_until

    try:
        table = Table.objects.select_related('zone__branch').get(pk=table_id)
    except Table.DoesNotExist:
        return False

    if table.status != TableStatus.CLEANING or not table.cleaning_started_at:
        return False

    branch = table.zone.branch if table.zone_id else None
    until = compute_cleaning_until(table.cleaning_started_at, branch) if branch else None
    if until and timezone.now() < until:
        return False

    TableService.finish_cleaning(table_id, revoke_scheduled=False)
    return True


@shared_task(name='apps.branches.tasks.sweep_stale_cleaning_tables', **MAINTENANCE_TASK_OPTIONS)
def sweep_stale_cleaning_tables() -> int:
    """Worker restart veya kaçan ETA sonrası temizlikte kalan masaları serbest bırakır."""
    from apps.branches.models import Table, TableStatus
    from apps.branches.services import TableService
    from apps.branches.table_cleaning import compute_cleaning_until

    now = timezone.now()
    qs = (
        Table.objects.filter(status=TableStatus.CLEANING, cleaning_started_at__isnull=False)
        .select_related('zone__branch')
        .only('id', 'status', 'cleaning_started_at', 'zone_id', 'zone__branch')
    )
    released = 0
    for table in qs.iterator():
        branch = table.zone.branch if table.zone_id else None
        until = compute_cleaning_until(table.cleaning_started_at, branch) if branch else None
        if until and now >= until:
            TableService.finish_cleaning(table.id, revoke_scheduled=False)
            released += 1
    if released:
        logger.info('sweep_stale_cleaning_tables released %s table(s)', released)
    return released
