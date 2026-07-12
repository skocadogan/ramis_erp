"""
CELERY_BEAT_SCHEDULE — ortam değişkenlerinden üretilir.

Tüm Beat zamanlamaları backend.env / ortam değişkenleri ile yapılandırılır;
settings.CELERY_BEAT_SCHEDULE bu modül üzerinden doldurulur. Üretimde
`manage.py sync_celery_beat_schedule` ile django_celery_beat DB'sine yazılır.
"""

from __future__ import annotations

import os
from datetime import timedelta

from celery.schedules import crontab


def _env_int(
    name: str,
    default: int,
    *,
    min_value: int | None = None,
    max_value: int | None = None,
) -> int:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        value = default
    else:
        try:
            value = int(str(raw).strip())
        except ValueError:
            value = default
    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


def build_celery_beat_schedule(*, reservation_expiry_hours: int) -> dict:
    """settings.CELERY_BEAT_SCHEDULE sözlüğünü ortam değişkenlerinden oluşturur."""
    printer_sync_minutes = _env_int('PRINTER_STATUS_SYNC_INTERVAL_MINUTES', 5, min_value=1)

    return {
        'cleanup-reservations-nightly': {
            'task': 'apps.inventory.tasks.cleanup_expired_reservations',
            'schedule': crontab(
                hour=_env_int('BEAT_CLEANUP_RESERVATIONS_HOUR', 3, min_value=0, max_value=23),
                minute=_env_int('BEAT_CLEANUP_RESERVATIONS_MINUTE', 0, min_value=0, max_value=59),
            ),
            'args': (reservation_expiry_hours,),
        },
        'rollup-product-station-timing-nightly': {
            'task': 'apps.orders.tasks.roll_up_product_station_timing_stats',
            'schedule': crontab(
                hour=_env_int('BEAT_ROLLUP_PRODUCT_STATION_TIMING_HOUR', 3, min_value=0, max_value=23),
                minute=_env_int('BEAT_ROLLUP_PRODUCT_STATION_TIMING_MINUTE', 15, min_value=0, max_value=59),
            ),
        },
        'sync-printer-statuses-periodically': {
            'task': 'apps.printing.tasks.sync_all_printer_statuses',
            'schedule': timedelta(minutes=printer_sync_minutes),
        },
        'maintain-print-job-queue': {
            'task': 'apps.printing.tasks.maintain_print_job_queue',
            'schedule': timedelta(
                seconds=_env_int('PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS', 30, min_value=15),
            ),
        },
        'scan-kitchen-low-stock-nightly': {
            'task': 'apps.warehouse.tasks.scan_kitchen_low_stock_deficiencies',
            'schedule': crontab(
                hour=_env_int('BEAT_SCAN_KITCHEN_LOW_STOCK_HOUR', 4, min_value=0, max_value=23),
                minute=_env_int('BEAT_SCAN_KITCHEN_LOW_STOCK_MINUTE', 0, min_value=0, max_value=59),
            ),
        },
        'scan-overdue-purchase-orders-nightly': {
            'task': 'apps.warehouse.tasks.scan_overdue_purchase_orders_daily',
            'schedule': crontab(
                hour=_env_int('BEAT_SCAN_OVERDUE_PO_HOUR', 5, min_value=0, max_value=23),
                minute=_env_int('BEAT_SCAN_OVERDUE_PO_MINUTE', 0, min_value=0, max_value=59),
            ),
        },
        'scan-expiring-lots-daily': {
            'task': 'apps.inventory.tasks.scan_expiring_lots_daily',
            'schedule': crontab(
                hour=_env_int('BEAT_SCAN_EXPIRING_LOTS_HOUR', 4, min_value=0, max_value=23),
                minute=_env_int('BEAT_SCAN_EXPIRING_LOTS_MINUTE', 30, min_value=0, max_value=59),
            ),
        },
        'cleanup-negative-lots-nightly': {
            'task': 'apps.inventory.tasks.cleanup_negative_lots',
            'schedule': crontab(
                hour=_env_int('BEAT_CLEANUP_NEGATIVE_LOTS_HOUR', 3, min_value=0, max_value=23),
                minute=_env_int('BEAT_CLEANUP_NEGATIVE_LOTS_MINUTE', 0, min_value=0, max_value=59),
            ),
            'options': {'expires': 3600},
        },
        'sweep-stale-cleaning-tables': {
            'task': 'apps.branches.tasks.sweep_stale_cleaning_tables',
            'schedule': timedelta(
                minutes=_env_int('BEAT_SWEEP_STALE_CLEANING_TABLES_INTERVAL_MINUTES', 1, min_value=1),
            ),
        },
        'notify-due-reservations': {
            'task': 'apps.reservations.tasks.notify_due_reservations',
            'schedule': timedelta(
                minutes=_env_int('BEAT_NOTIFY_DUE_RESERVATIONS_INTERVAL_MINUTES', 1, min_value=1),
            ),
        },
        'cancel-overdue-prep-tasks': {
            'task': 'apps.prep.tasks.cancel_overdue_prep_tasks',
            'schedule': timedelta(
                minutes=_env_int(
                    'BEAT_CANCEL_OVERDUE_PREP_TASKS_INTERVAL_MINUTES',
                    15,
                    min_value=5,
                ),
            ),
        },
        'cleanup-redis-stale-keys': {
            'task': 'core.tasks.cleanup_redis_stale_keys',
            'schedule': crontab(
                hour=_env_int('BEAT_REDIS_CLEANUP_HOUR', 2, min_value=0, max_value=23),
                minute=_env_int('BEAT_REDIS_CLEANUP_MINUTE', 30, min_value=0, max_value=59),
            ),
        },
        'cleanup-stale-pos-connections': {
            'task': 'core.tasks.cleanup_stale_pos_connections',
            'schedule': crontab(
                hour=_env_int('BEAT_POS_CONNECTIONS_CLEANUP_HOUR', 3, min_value=0, max_value=23),
                minute=_env_int('BEAT_POS_CONNECTIONS_CLEANUP_MINUTE', 45, min_value=0, max_value=59),
            ),
            'kwargs': {'max_hours': 24},
        },
        'auto-close-active-tables-nightly': {
            'task': 'apps.orders.tasks.auto_close_active_tables_task',
            'schedule': crontab(
                hour=_env_int('BEAT_AUTO_CLOSE_TABLES_HOUR', 2, min_value=0, max_value=23),
                minute=_env_int('BEAT_AUTO_CLOSE_TABLES_MINUTE', 0, min_value=0, max_value=59),
            ),
        },
        'warm-dashboard-cache': {
            'task': 'apps.dashboard.tasks.warm_dashboard_cache',
            'schedule': timedelta(
                seconds=_env_int('BEAT_WARM_DASHBOARD_CACHE_INTERVAL_SECONDS', 180, min_value=30),
            ),
        },
        'purge-expired-86-nightly': {
            'task': 'apps.production_planning.tasks.purge_expired_product_day_availability',
            'schedule': crontab(
                hour=_env_int('BEAT_PURGE_EXPIRED_86_HOUR', 5, min_value=0, max_value=23),
                minute=_env_int('BEAT_PURGE_EXPIRED_86_MINUTE', 0, min_value=0, max_value=59),
            ),
        },
        'repair-orphan-deficiency-reports-nightly': {
            'task': 'apps.warehouse.tasks.repair_orphan_deficiency_reports',
            'schedule': crontab(
                hour=_env_int('BEAT_DEFICIENCY_REPAIR_HOUR', 4, min_value=0, max_value=23),
                minute=_env_int('BEAT_DEFICIENCY_REPAIR_MINUTE', 45, min_value=0, max_value=59),
            ),
            'options': {'expires': 3600},
        },
    }
