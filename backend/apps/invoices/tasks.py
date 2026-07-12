"""Invoice PDF generation Celery tasks."""
from __future__ import annotations

import logging

from celery import shared_task
from django.db import transaction
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=15,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    time_limit=120,
    soft_time_limit=90,
    acks_late=False,
    queue="pdf_export",
)
def generate_invoice_pdf(self, invoice_id: str) -> None:
    """
    Fatura PDF'ini Celery worker'da üretir.

    Retry mekanizması: geçici hatalarda tekrar dener.
    Kalıcı hatalarda (invoice silinmiş) sessizce çıkar.
    """
    from apps.invoices.models import Invoice

    try:
        with transaction.atomic():
            invoice = Invoice.objects.select_related("sale", "sale__order", "branch").get(
                id=invoice_id, is_active=True
            )
    except Invoice.DoesNotExist:
        logger.warning("Invoice not found for PDF generation: %s", invoice_id)
        return

    try:
        from apps.invoices.services import _build_pdf_bytes
        from django.core.files.base import ContentFile

        pdf_bytes = _build_pdf_bytes(invoice, invoice.sale)
        filename = f"{invoice.invoice_number}.pdf"

        invoice.pdf_file.save(filename, ContentFile(pdf_bytes), save=True)

        logger.info(
            "Invoice PDF generated: invoice=%s size=%d",
            invoice.invoice_number, len(pdf_bytes),
        )

    except Exception as exc:
        logger.exception(
            "Invoice PDF generation failed (attempt=%d/%d): invoice_id=%s",
            self.request.retries, self.max_retries, invoice_id,
        )
        raise self.retry(exc=exc)
