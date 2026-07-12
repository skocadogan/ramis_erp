"""Core Celery görevleri — altyapı bakımı."""


import logging

from celery import shared_task

from core.celery_task_options import MAINTENANCE_TASK_OPTIONS
from core.redis_maintenance import (
    clean_stale_pos_connections,
    collect_redis_diagnostics,
    run_redis_maintenance,
)

logger = logging.getLogger(__name__)


@shared_task(name="core.tasks.cleanup_redis_stale_keys", **MAINTENANCE_TASK_OPTIONS)
def cleanup_redis_stale_keys(dry_run: bool = False) -> dict:
    """
    Redis'te asılı kalan Celery meta, eski cache nesilleri ve TTL'siz channel anahtarlarını temizler.
    Beat ile gece çalıştırılır (BEAT_REDIS_CLEANUP_*).
    """
    report = run_redis_maintenance(dry_run=dry_run)
    if not report.get("skipped"):
        diagnostics = collect_redis_diagnostics()
        recs = diagnostics.get("recommendations") or []
        if recs:
            logger.info("Redis optimizasyon önerileri: %s", "; ".join(recs))
    return report


@shared_task(name="core.tasks.cleanup_stale_pos_connections", **MAINTENANCE_TASK_OPTIONS)
def cleanup_stale_pos_connections(max_hours: int = 24) -> dict:
    """
    POS terminal WebSocket bağlantı cache'inde asılı kalmış kayıtları temizler.

    ``pos_connections_{terminal_id}`` anahtarlarındaki ``connected_at`` değeri
    ``max_hours`` saatten eski olan girişleri kaldırır. Tüm girişler eskiyse
    cache anahtarını tamamen siler.

    Beat ile günlük çalıştırılır (BEAT_POS_CONNECTIONS_CLEANUP_*).
    """
    return clean_stale_pos_connections(max_hours=max_hours)
