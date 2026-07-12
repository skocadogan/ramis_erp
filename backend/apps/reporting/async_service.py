"""Async PDF export: Celery task + Redis cache polling flow."""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

PDF_CACHE_TTL = int(getattr(settings, 'PDF_EXPORT_CACHE_TTL', 600))
PDF_CACHE_MAX_BYTES = int(getattr(settings, 'PDF_EXPORT_CACHE_MAX_BYTES', 20 * 1024 * 1024))


def _build_cache_key(user_id: str, report_slug: str, params: dict, export_format: str) -> str:
    params_json = json.dumps(params, sort_keys=True, default=str)
    params_hash = hashlib.sha256(params_json.encode()).hexdigest()[:16]
    return f"pdf:export:{user_id}:{report_slug}:{params_hash}:{export_format}"


def enqueue_pdf_export(
    user_id: str,
    report_type: str,
    params: dict[str, Any],
    export_format: str = "pdf",
    language: str = "tr",
    report_class_path: str | None = None,
) -> dict[str, Any]:
    cache_key = _build_cache_key(user_id, report_type, params, export_format)
    task_id = uuid.uuid4().hex

    cache.set(
        cache_key,
        {
            "status": "processing",
            "task_id": task_id,
            "report_type": report_type,
            "created_at": timezone.now().isoformat(),
        },
        timeout=PDF_CACHE_TTL,
    )

    from apps.reporting.tasks import generate_report_pdf_async

    generate_report_pdf_async.apply_async(
        kwargs={
            "cache_key": cache_key,
            "report_type": report_type,
            "params": params,
            "export_format": export_format,
            "language": language,
            "report_class_path": report_class_path,
            "user_id": user_id,
        },
        task_id=task_id,
        queue="pdf_export",
    )

    logger.info(
        "PDF export enqueued: cache_key=%s task_id=%s report_type=%s user=%s",
        cache_key, task_id, report_type, user_id,
    )

    return {"task_id": task_id, "cache_key": cache_key, "status": "processing"}


def get_pdf_export_status(cache_key: str) -> dict[str, Any]:
    data = cache.get(cache_key)
    if data is None:
        return {"status": "not_found"}
    return data
