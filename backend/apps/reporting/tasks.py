"""Async PDF generation Celery tasks."""
from __future__ import annotations

import base64
import logging
from typing import Any

from celery import shared_task
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

PDF_CACHE_TTL = int(getattr(settings, 'PDF_EXPORT_CACHE_TTL', 600))


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    time_limit=300,
    soft_time_limit=240,
    acks_late=False,
    queue="pdf_export",
)
def generate_report_pdf_async(
    self,
    cache_key: str,
    report_type: str,
    params: dict[str, Any],
    export_format: str = "pdf",
    language: str = "tr",
    report_class_path: str | None = None,
    user_id: str | None = None,
) -> None:
    try:
        pdf_bytes, filename = _build_pdf(
            report_type=report_type,
            params=params,
            export_format=export_format,
            language=language,
            report_class_path=report_class_path,
            user_id=user_id,
        )

        pdf_size = len(pdf_bytes)
        max_size = int(getattr(settings, 'PDF_EXPORT_CACHE_MAX_BYTES', 20 * 1024 * 1024))

        if pdf_size > max_size:
            from django.core.files.storage import default_storage
            file_path = f"reports/pdf_export_{cache_key.split(':')[-1]}.pdf"
            default_storage.save(file_path, ContentFile(pdf_bytes))
            download_url = default_storage.url(file_path)
        else:
            download_url = f"data:application/pdf;base64,{base64.b64encode(pdf_bytes).decode()}"

        cache.set(
            cache_key,
            {
                "status": "completed",
                "download_url": download_url,
                "filename": filename,
                "size_bytes": pdf_size,
                "completed_at": timezone.now().isoformat(),
            },
            timeout=PDF_CACHE_TTL,
        )

        logger.info(
            "PDF export completed: cache_key=%s size=%d type=%s",
            cache_key, pdf_size, report_type,
        )

    except Exception as exc:
        logger.exception(
            "PDF export failed (attempt=%d/%d): cache_key=%s type=%s",
            self.request.retries, self.max_retries, cache_key, report_type,
        )

        if self.request.retries >= self.max_retries:
            cache.set(
                cache_key,
                {
                    "status": "failed",
                    "error": str(exc)[:500],
                    "retry_allowed": False,
                    "failed_at": timezone.now().isoformat(),
                },
                timeout=PDF_CACHE_TTL,
            )
            return

        raise self.retry(exc=exc)


def _build_pdf(
    report_type: str,
    params: dict[str, Any],
    export_format: str,
    language: str,
    report_class_path: str | None,
    user_id: str | None,
) -> tuple[bytes, str]:
    from types import SimpleNamespace

    from django.contrib.auth import get_user_model

    from apps.reporting.registry import report_registry
    from apps.reporting.services.renderer import ReportRenderer
    from apps.reporting.services.pdf_export import PDFExportService

    User = get_user_model()

    if report_type.startswith("direct:"):
        return _build_direct_view_pdf(report_type, params, language, report_class_path)
    elif report_type.startswith("template:"):
        template_slug = report_type.split(":", 1)[1]
        return _build_template_pdf(template_slug, params, language)
    else:
        report_class = report_registry.get_report(report_type)
        if not report_class:
            raise ValueError(f"Report not found: {report_type}")

        # Celery worker'da request yok; rapor sınıflarının self.request.user
        # ve self.request.LANGUAGE_CODE erişimi için stub oluştur.
        user = User.objects.get(id=user_id) if user_id else None
        stub_request = SimpleNamespace(
            user=user,
            LANGUAGE_CODE=language,
            query_params={},
        )

        # None değerleri filtrele — rapor sınıfları genelde .get('key') ile okur,
        # ama None değerler istenmeyen davranışa yol açabilir.
        clean_params = {k: v for k, v in params.items() if v is not None and v != ''}

        report_instance = report_class(request=stub_request, **clean_params)
        context = report_instance.get_context()
        template_name = report_instance.get_template_name()

        renderer = ReportRenderer(language_code=language)
        html_content = renderer.render_file(template_name, context)

        pdf_service = PDFExportService()
        pdf_bytes = pdf_service.generate_pdf_from_html(html_content)

        return pdf_bytes, f"{report_type}.pdf"


def _build_template_pdf(template_slug: str, params: dict, language: str) -> tuple[bytes, str]:
    from apps.reporting.models import ReportTemplate
    from apps.reporting.services.renderer import ReportRenderer
    from apps.reporting.services.pdf_export import PDFExportService

    template = ReportTemplate.objects.get(slug=template_slug, is_active=True)
    context = params.get("context", {})
    renderer = ReportRenderer(language_code=language)
    html_content = renderer.render_string(template.html_body, context)

    pdf_service = PDFExportService()
    pdf_bytes = pdf_service.generate_pdf_from_html(html_content, template.css_styles)

    return pdf_bytes, f"{template_slug}.pdf"


def _build_direct_view_pdf(
    endpoint: str, params: dict, language: str, report_class_path: str | None,
) -> tuple[bytes, str]:
    raise NotImplementedError("Direct view PDF async henüz implement edilmedi")
