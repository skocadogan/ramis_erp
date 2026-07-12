"""
CELERY_BEAT_SCHEDULE → django_celery_beat PeriodicTask senkronizasyonu.

Üretimde Beat `DatabaseScheduler` kullanır; görevler veritabanından okunur.
settings.py içindeki CELERY_BEAT_SCHEDULE otomatik uygulanmaz — migrate/deploy sonrası
`manage.py sync_celery_beat_schedule` çalıştırılmalıdır.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from typing import Any

from celery.schedules import crontab
from django.conf import settings
from django.db import transaction
from django_celery_beat.models import CrontabSchedule, IntervalSchedule, PeriodicTask

logger = logging.getLogger(__name__)

MANAGED_DESCRIPTION = "Managed from CELERY_BEAT_SCHEDULE via sync_celery_beat_schedule"


def _crontab_field(value: Any) -> str:
    return str(value)


def _resolve_crontab(schedule: crontab) -> CrontabSchedule:
    tz = getattr(settings, "CELERY_TIMEZONE", None) or settings.TIME_ZONE
    lookup = {
        "minute": _crontab_field(schedule._orig_minute),
        "hour": _crontab_field(schedule._orig_hour),
        "day_of_week": _crontab_field(schedule._orig_day_of_week),
        "day_of_month": _crontab_field(schedule._orig_day_of_month),
        "month_of_year": _crontab_field(schedule._orig_month_of_year),
        "timezone": tz,
    }
    obj, _ = CrontabSchedule.objects.get_or_create(**lookup)
    return obj


def _resolve_interval(schedule: timedelta) -> IntervalSchedule:
    total = int(schedule.total_seconds())
    if total <= 0:
        raise ValueError(f"Geçersiz interval süresi: {schedule!r}")

    if total % 86400 == 0:
        every, period = total // 86400, IntervalSchedule.DAYS
    elif total % 3600 == 0:
        every, period = total // 3600, IntervalSchedule.HOURS
    elif total % 60 == 0:
        every, period = total // 60, IntervalSchedule.MINUTES
    else:
        every, period = total, IntervalSchedule.SECONDS

    obj, _ = IntervalSchedule.objects.get_or_create(every=every, period=period)
    return obj


def sync_celery_beat_schedule(*, dry_run: bool = False) -> dict[str, int]:
    """
    settings.CELERY_BEAT_SCHEDULE kayıtlarını PeriodicTask tablosuna yazar/günceller.
    Dönüş: created, updated, disabled, unchanged sayıları.
    """
    schedule_map: dict = getattr(settings, "CELERY_BEAT_SCHEDULE", {}) or {}
    stats = {"created": 0, "updated": 0, "disabled": 0, "unchanged": 0}

    if dry_run:
        logger.info("sync_celery_beat_schedule dry-run: %d görev tanımı", len(schedule_map))
        return stats

    with transaction.atomic():
        for name, entry in schedule_map.items():
            task_name = entry["task"]
            celery_schedule = entry["schedule"]
            args = entry.get("args", ())
            kwargs = entry.get("kwargs", {})

            crontab_obj = None
            interval_obj = None

            if isinstance(celery_schedule, crontab):
                crontab_obj = _resolve_crontab(celery_schedule)
            elif isinstance(celery_schedule, timedelta):
                interval_obj = _resolve_interval(celery_schedule)
            else:
                raise TypeError(
                    f"Desteklenmeyen schedule türü ({name}): {type(celery_schedule).__name__}"
                )

            defaults = {
                "task": task_name,
                "crontab": crontab_obj,
                "interval": interval_obj,
                "solar": None,
                "clocked": None,
                "args": json.dumps(list(args)),
                "kwargs": json.dumps(kwargs if isinstance(kwargs, dict) else {}),
                "enabled": True,
                "description": MANAGED_DESCRIPTION,
            }

            existing = PeriodicTask.objects.filter(name=name).first()
            if existing is None:
                PeriodicTask.objects.create(name=name, **defaults)
                stats["created"] += 1
                continue

            changed_fields = [
                field for field, value in defaults.items() if getattr(existing, field) != value
            ]
            if changed_fields:
                for field, value in defaults.items():
                    setattr(existing, field, value)
                existing.save(update_fields=list(defaults.keys()))
                stats["updated"] += 1
            else:
                stats["unchanged"] += 1

        stale = PeriodicTask.objects.filter(description=MANAGED_DESCRIPTION).exclude(
            name__in=schedule_map.keys()
        )
        disabled = stale.update(enabled=False)
        stats["disabled"] = disabled

    return stats
