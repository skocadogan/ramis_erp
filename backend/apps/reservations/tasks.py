"""Rezervasyon zamanlayıcı görevleri."""

import logging

from celery import shared_task

from core.celery_task_options import MAINTENANCE_TASK_OPTIONS

logger = logging.getLogger(__name__)


@shared_task(name="apps.reservations.tasks.notify_due_reservations", **MAINTENANCE_TASK_OPTIONS)
def notify_due_reservations() -> int:
    """
    Rezervasyon saati gelen kayıtlar için POS/garson bildirimi gönderir.
    Her dakika Celery Beat ile çalışır (maintenance kuyruğu — ramis-worker-maintenance).
    """
    from django.conf import settings

    from apps.reservations.reservation_alerts import find_due_reservations, notify_reservation_due

    channel_backend = (
        settings.CHANNEL_LAYERS.get("default", {}).get("BACKEND", "")
        if getattr(settings, "CHANNEL_LAYERS", None)
        else ""
    )
    if "InMemory" in channel_backend:
        logger.warning(
            "CHANNEL_LAYERS InMemory — Celery worker'dan gönderilen WS bildirimleri "
            "Daphne sürecine ulaşmaz. Üretimde REDIS_URL tanımlayın."
        )

    due = find_due_reservations()
    if due:
        logger.info("notify_due_reservations: %d aday rezervasyon", len(due))

    sent = 0
    for reservation in due:
        try:
            if notify_reservation_due(reservation):
                sent += 1
        except Exception:
            logger.warning(
                "Rezervasyon saati bildirimi başarısız (reservation_id=%s)",
                reservation.id,
                exc_info=True,
            )
    if sent:
        logger.info("notify_due_reservations: %d bildirim gönderildi", sent)
    elif due:
        logger.info(
            "notify_due_reservations: aday var ama bildirim gönderilmedi (interval veya durum)"
        )
    return sent
