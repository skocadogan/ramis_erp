import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.printing.locks import printer_escpos_lock
from apps.printing.models import PrintJob, PrintJobStatus, Printer
from apps.printing.services.escpos_service import EscPosService, PrinterError
from apps.printing.services.print_job_dispatch import enqueue_print_job
from apps.reporting.models import ReceiptTemplate
from apps.reporting.services.receipt_renderer import (
    ReceiptRenderer,
    enrich_print_context_from_branch,
    enrich_print_context_from_order,
)
from core.celery_task_options import MAINTENANCE_TASK_OPTIONS, PRINTING_TASK_OPTIONS

logger = logging.getLogger(__name__)


def _stale_processing_seconds() -> int:
    return int(getattr(settings, "PRINT_JOB_STALE_PROCESSING_SECONDS", 180))


def _run_escpos_for_job(job: PrintJob) -> None:
    template = ReceiptTemplate.objects.get(slug=job.receipt_slug, is_active=True)
    renderer = ReceiptRenderer(template.paper_width)
    service = EscPosService(job.printer)
    device = service._get_device()
    context = enrich_print_context_from_order(dict(job.context or {}))
    context = enrich_print_context_from_branch(
        context,
        fallback_branch_id=str(job.printer.branch_id),
    )
    try:
        renderer.render_to_escpos(template.layout_json, context, device)
    finally:
        if hasattr(device, "close"):
            try:
                device.close()
            except Exception as close_err:
                logger.warning("Error closing printer device: %s", close_err)


@shared_task(name="apps.printing.tasks.execute_receipt_print_job", **PRINTING_TASK_OPTIONS)
def execute_receipt_print_job(print_job_id: str) -> None:
    """
    Tek bir PrintJob kaydını işler. Yazıcı başına kilit ile sıraya girer.
    Farklı yazıcılar paralel worker'larda eşzamanlı işlenebilir.
    """
    job = PrintJob.objects.filter(pk=print_job_id).select_related("printer").first()
    if not job:
        logger.warning("PrintJob bulunamadı: %s", print_job_id)
        return

    if job.status == PrintJobStatus.COMPLETED:
        return
    if job.status == PrintJobStatus.FAILED:
        return
    if job.status == PrintJobStatus.PROCESSING:
        stale_after = _stale_processing_seconds()
        if timezone.now() - job.updated_at < timedelta(seconds=stale_after):
            return

    try:
        with printer_escpos_lock(str(job.printer_id)):
            job.refresh_from_db(fields=["status", "error_message", "updated_at"])
            if job.status == PrintJobStatus.COMPLETED:
                return
            if job.status == PrintJobStatus.FAILED:
                return
            if job.status == PrintJobStatus.PROCESSING:
                stale_after = _stale_processing_seconds()
                if timezone.now() - job.updated_at < timedelta(seconds=stale_after):
                    return

            job.status = PrintJobStatus.PROCESSING
            job.error_message = ""
            job.save(update_fields=["status", "error_message", "updated_at"])

            try:
                _run_escpos_for_job(job)
            except ReceiptTemplate.DoesNotExist:
                msg = f"Fiş şablonu bulunamadı veya pasif: {job.receipt_slug}"
                logger.error(msg)
                job.status = PrintJobStatus.FAILED
                job.error_message = msg
                job.save(update_fields=["status", "error_message", "updated_at"])
                return
            except (PrinterError, OSError, TimeoutError, ConnectionError) as e:
                logger.exception("Termal baskı hatası job=%s", print_job_id)
                job.status = PrintJobStatus.FAILED
                job.error_message = str(e)[:4000]
                job.save(update_fields=["status", "error_message", "updated_at"])
                return
            except Exception as e:  # noqa: BLE001
                logger.exception("Termal baskı beklenmeyen hata job=%s", print_job_id)
                job.status = PrintJobStatus.FAILED
                job.error_message = str(e)[:4000]
                job.save(update_fields=["status", "error_message", "updated_at"])
                return

            job.refresh_from_db()
            job.status = PrintJobStatus.COMPLETED
            job.completed_at = timezone.now()
            job.error_message = ""
            job.save(update_fields=["status", "completed_at", "error_message", "updated_at"])

    except TimeoutError:
        logger.warning(
            "Yazıcı kilidi meşgul, yeniden denenecek job=%s printer=%s",
            print_job_id,
            job.printer_id,
        )
        raise


@shared_task(name="apps.printing.tasks.maintain_print_job_queue", **MAINTENANCE_TASK_OPTIONS)
def maintain_print_job_queue() -> None:
    """
    PENDING işleri yeniden kuyruğa alır; takılı PROCESSING kayıtlarını FAILED yapar.
    Çok istasyonlu siparişlerde Celery mesajı kaybı / worker kesintisi sonrası kurtarma.
    """
    pending_age = int(getattr(settings, "PRINT_JOB_REQUEUE_PENDING_SECONDS", 45))
    processing_stale = _stale_processing_seconds()
    batch_size = int(getattr(settings, "PRINT_JOB_MAINTENANCE_BATCH_SIZE", 100))

    now = timezone.now()
    pending_cutoff = now - timedelta(seconds=pending_age)
    processing_cutoff = now - timedelta(seconds=processing_stale)

    pending_jobs = (
        PrintJob.objects.filter(
            status=PrintJobStatus.PENDING,
            created_at__lte=pending_cutoff,
        )
        .order_by("created_at")[:batch_size]
    )
    requeued = 0
    for job in pending_jobs:
        try:
            enqueue_print_job(job)
            requeued += 1
        except Exception:  # noqa: BLE001
            logger.exception("PENDING PrintJob yeniden kuyruğa alınamadı job=%s", job.id)

    stale_jobs = (
        PrintJob.objects.filter(
            status=PrintJobStatus.PROCESSING,
            updated_at__lte=processing_cutoff,
        )
        .order_by("updated_at")[:batch_size]
    )
    failed = 0
    for job in stale_jobs:
        job.status = PrintJobStatus.FAILED
        job.error_message = _(
            "Yazdırma işi zaman aşımına uğradı; worker yanıt vermedi."
        )
        job.save(update_fields=["status", "error_message", "updated_at"])
        failed += 1

    if requeued or failed:
        logger.info(
            "maintain_print_job_queue: requeued=%s failed_stale=%s",
            requeued,
            failed,
        )


@shared_task(name="apps.printing.tasks.sync_all_printer_statuses", **MAINTENANCE_TASK_OPTIONS)
def sync_all_printer_statuses() -> None:
    """
    Aktif yazıcıların erişilebilirlik durumunu kontrol eder.
    Aktif baskı (PROCESSING) olan yazıcılar atlanır — ESC/POS soket çakışması önlenir.
    """
    busy_printer_ids = set(
        PrintJob.objects.filter(status=PrintJobStatus.PROCESSING).values_list(
            "printer_id", flat=True
        )
    )
    printers = Printer.objects.filter(is_active=True)
    for printer in printers:
        if printer.id in busy_printer_ids:
            continue
        try:
            service = EscPosService(printer)
            status_data = service.check_status()

            printer.status_info = status_data
            if status_data.get("online"):
                printer.last_seen = timezone.now()

            printer.save(update_fields=["status_info", "last_seen", "updated_at"])
        except Exception as e:
            logger.error("Status check failed for printer %s: %s", printer.name, e)
