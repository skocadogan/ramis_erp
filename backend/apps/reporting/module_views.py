import logging

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from django.utils.translation import gettext as _

from .registry import report_registry
from .services.renderer import ReportRenderer
from .services.pdf_export import PDFExportService
from rbac.drf import RBACPermission

logger = logging.getLogger(__name__)

class ModuleReportViewSet(viewsets.ViewSet):
    """
    Kayıtlı sistem raporlarını (modül raporları) listeleyen ve üreten ViewSet.
    """
    permission_classes = [RBACPermission]
    
    # Her raporun kendi izni olabilir ama şimdilik genel bir izin kullanıyoruz
    required_permissions = {
        'list': 'reporting.view_report_template',
        'generate': 'reporting.generate_report',
        'export_status': 'reporting.generate_report',
    }

    def list(self, request):
        """Kayıtlı tüm raporları listeler."""
        reports = report_registry.list_reports()
        return Response(reports)

    @action(detail=False, methods=['post'], url_path='(?P<slug>[^/.]+)/generate')
    def generate(self, request, slug=None):
        """
        Belirtilen raporu üretir.
        Gövdede filtreleme için 'params' gönderilebilir.

        Query params:
            ?async=true  → Celery'de üret, {task_id, cache_key, status} dön
            ?async=false → Mevcut davranış: direkt PDF blob dön (default)
        """
        report_class = report_registry.get_report(slug)
        if not report_class:
            return Response(
                {'error': _('Rapor bulunamadı: %(slug)s') % {'slug': slug}},
                status=status.HTTP_404_NOT_FOUND,
            )

        export_format = request.data.get('format', 'pdf')
        params = request.data.get('params', {})
        use_async = request.query_params.get('async', 'false').lower() in ('true', '1', 'yes')

        # Async mod: Celery'ye ata, hemen yanıt dön
        if use_async:
            from django.conf import settings
            if not getattr(settings, 'PDF_EXPORT_ASYNC_ENABLED', True):
                return Response(
                    {'error': _('Async PDF export şu anda devre dışı.')},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            from .async_service import enqueue_pdf_export
            result = enqueue_pdf_export(
                user_id=str(request.user.id),
                report_type=slug,
                params=params,
                export_format=export_format,
                language=request.LANGUAGE_CODE or 'tr',
            )
            return Response(result, status=status.HTTP_202_ACCEPTED)

        # Sync mod: mevcut davranış (backward compatible)
        try:
            report_instance = report_class(request=request, **params)
            context = report_instance.get_context()
            template_name = report_instance.get_template_name()

            renderer = ReportRenderer(language_code=request.LANGUAGE_CODE)
            html_content = renderer.render_file(template_name, context)

            if export_format == 'pdf':
                from django.conf import settings
                if getattr(settings, 'DISABLE_PDF_EXPORT', False):
                    return Response(
                        {'error': _('PDF raporlama devre dışı. Sistem yöneticinize başvurun.')},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE,
                    )
                pdf_service = PDFExportService()
                pdf_bytes = pdf_service.generate_pdf_from_html(html_content)

                response = HttpResponse(pdf_bytes, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="{slug}.pdf"'
                return response

            elif export_format == 'excel':
                if hasattr(report_instance, 'get_excel_data'):
                    excel_data, excel_columns = report_instance.get_excel_data(context)
                    from .services.excel_export import ExcelExportService
                    excel_bytes = ExcelExportService.generate_excel(
                        excel_data, excel_columns, title=report_instance.name
                    )
                    response = HttpResponse(
                        excel_bytes,
                        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    )
                    response['Content-Disposition'] = f'attachment; filename="{slug}.xlsx"'
                    return response
                else:
                    return Response(
                        {'error': _('Bu rapor Excel formatını desteklemiyor.')},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            return Response({'html': html_content})

        except Exception as e:
            logger.exception("Modül raporu oluşturulurken hata")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='export-status')
    def export_status(self, request):
        """
        PDF export durumunu sorgular.

        Query params:
            cache_key — enqueue_pdf_export()'tan dönen cache_key

        Response:
            {"status": "processing"}
            {"status": "completed", "download_url": "...", "filename": "...", "size_bytes": 123}
            {"status": "failed", "error": "...", "retry_allowed": false}
            {"status": "not_found"}
        """
        cache_key = request.query_params.get('cache_key', '').strip()
        if not cache_key:
            return Response(
                {'error': _('cache_key parametresi zorunludur.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .async_service import get_pdf_export_status
        result = get_pdf_export_status(cache_key)
        return Response(result)
