import logging

from celery import shared_task
from django.conf import settings

from core.celery_task_options import MAINTENANCE_TASK_OPTIONS

logger = logging.getLogger(__name__)


@shared_task(
    name="apps.production_planning.tasks.purge_expired_product_day_availability",
    **MAINTENANCE_TASK_OPTIONS,
)
def purge_expired_product_day_availability(enabled: bool | None = None):
    """
    Geçmiş Ürün Kalmadı (86) kayıtlarını temizler.

    ``BEAT_PURGE_EXPIRED_86_ENABLED=false`` ise işlem atlanır.
    Celery Beat: ``purge-expired-86-nightly`` (``BEAT_PURGE_EXPIRED_86_*``).
    """
    from apps.production_planning.services.availability_purge_service import (
        purge_expired_product_day_availability as _purge,
    )

    if enabled is None:
        enabled = getattr(settings, "BEAT_PURGE_EXPIRED_86_ENABLED", False)

    return _purge(enabled=enabled)
