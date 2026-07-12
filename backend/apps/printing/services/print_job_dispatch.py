"""PrintJob → Celery kuyruğu gönderimi."""

from __future__ import annotations

import logging

from apps.printing.models import PrintJob, PrintJobStatus

logger = logging.getLogger(__name__)


def enqueue_print_job(job: PrintJob | str) -> None:
    """
    PENDING bir PrintJob kaydını printing kuyruğuna gönderir.
    Tamamlanmış / başarısız işler yeniden kuyruğa alınmaz.
    """
    from apps.printing.tasks import execute_receipt_print_job

    job_id = str(job.id if isinstance(job, PrintJob) else job)
    row = (
        job
        if isinstance(job, PrintJob)
        else PrintJob.objects.filter(pk=job_id).only("id", "status").first()
    )
    if row is None:
        logger.warning("enqueue_print_job: kayıt bulunamadı %s", job_id)
        return
    if row.status not in (PrintJobStatus.PENDING, PrintJobStatus.PROCESSING):
        return

    execute_receipt_print_job.delay(job_id)
