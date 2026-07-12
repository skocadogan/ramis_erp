"""Masa temizlik süresi yardımcıları ve Celery zamanlama."""

from __future__ import annotations

import logging
from datetime import timedelta
from uuid import UUID

from django.utils import timezone

logger = logging.getLogger(__name__)

MIN_TABLE_CLEANING_MINUTES = 1
MAX_TABLE_CLEANING_MINUTES = 60
DEFAULT_TABLE_CLEANING_MINUTES = 5


def clamp_cleaning_minutes(minutes: int | None) -> int:
    if minutes is None:
        return DEFAULT_TABLE_CLEANING_MINUTES
    return max(MIN_TABLE_CLEANING_MINUTES, min(MAX_TABLE_CLEANING_MINUTES, int(minutes)))


def get_branch_cleaning_minutes(branch) -> int:
    return clamp_cleaning_minutes(getattr(branch, 'table_cleaning_duration_minutes', None))


def compute_cleaning_until(cleaning_started_at, branch) -> timezone.datetime | None:
    if not cleaning_started_at:
        return None
    return cleaning_started_at + timedelta(minutes=get_branch_cleaning_minutes(branch))


def cleaning_task_id(table_id) -> str:
    return f'table-cleaning-{table_id}'


def table_zone_is_takeaway(table) -> bool:
    """Masa paket (takeaway) bölgesindeyse temizlik akışı devreye girmez."""
    zone = getattr(table, 'zone', None)
    if zone is None:
        return False
    return bool(getattr(zone, 'is_takeaway', False))


def revoke_cleaning_release(table_id) -> None:
    try:
        from celery import current_app

        current_app.control.revoke(cleaning_task_id(table_id), terminate=False)
    except Exception:
        logger.debug('Celery revoke skipped for table %s', table_id, exc_info=True)


def schedule_cleaning_release(table_id, cleaning_until) -> None:
    from apps.branches.tasks import release_table_from_cleaning

    revoke_cleaning_release(table_id)
    release_table_from_cleaning.apply_async(
        args=[str(table_id)],
        eta=cleaning_until,
        task_id=cleaning_task_id(table_id),
    )


def serialize_cleaning_fields(table) -> dict:
    branch = getattr(getattr(table, 'zone', None), 'branch', None)
    started = table.cleaning_started_at
    until = compute_cleaning_until(started, branch) if started and branch else None
    remaining = None
    if until:
        remaining = max(0, int((until - timezone.now()).total_seconds()))
    return {
        'cleaning_started_at': started,
        'cleaning_until': until,
        'cleaning_remaining_seconds': remaining,
        'table_cleaning_duration_minutes': get_branch_cleaning_minutes(branch) if branch else DEFAULT_TABLE_CLEANING_MINUTES,
    }
