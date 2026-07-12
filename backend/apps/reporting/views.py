from django.http import HttpResponse
from django.utils.translation import gettext as _
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.renderers import JSONRenderer
from .models import ReportTemplate
from .serializers import ReportTemplateSerializer
from .services.pdf_export import PDFExportService
from .services.renderer import ReportRenderer
from rbac.drf import RBACPermission

class ReportTemplateViewSet(viewsets.ModelViewSet):
    queryset = ReportTemplate.objects.filter(is_active=True)
    serializer_class = ReportTemplateSerializer
    permission_classes = [RBACPermission]
    renderer_classes = [JSONRenderer]
    lookup_field = 'slug'
    
    required_permissions = {
        'list': 'reporting.view_report_template',
        'retrieve': 'reporting.view_report_template',
        'create': 'reporting.manage_report_template',
        'update': 'reporting.manage_report_template',
        'partial_update': 'reporting.manage_report_template',
        'destroy': 'reporting.manage_report_template',
        'preview': 'reporting.generate_report',
        'export_pdf': 'reporting.generate_report',
        'print_thermal': ['reporting.generate_report', 'printing.direct_print'],
    }

    @action(detail=True, methods=['post'])
    def preview(self, request, slug=None):
        """Returns rendered HTML for preview."""
        template = self.get_object()
        renderer = ReportRenderer(language_code=request.LANGUAGE_CODE)
        context = request.data.get('context', {})
        
        try:
            html = renderer.render_string(template.html_body, context)
            return Response({'html': html})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def export_pdf(self, request, slug=None):
        """Returns a PDF file."""
        from django.conf import settings
        if getattr(settings, 'DISABLE_PDF_EXPORT', False):
            return Response(
                {'error': _('PDF raporlama devre dışı. Sistem yöneticinize başvurun.')},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        template = self.get_object()
        pdf_service = PDFExportService()
        context = request.data.get('context', {})
        
        try:
            pdf_bytes = pdf_service.generate_pdf_from_template(template, context)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{template.slug}.pdf"'
            return response
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def print_thermal(self, request, slug=None):
        """Renders the template and sends it to a physical printer."""
        template = self.get_object()
        printer_id = request.data.get('printer_id')
        context = request.data.get('context', {})
        
        if not printer_id:
            return Response({'error': _('Yazıcı ID gereklidir.')}, status=status.HTTP_400_BAD_REQUEST)
            
        from apps.printing.models import Printer
        from apps.printing.services.escpos_service import EscPosService
        
        try:
            printer = Printer.objects.get(id=printer_id)
            
            # Şablonu render et
            renderer = ReportRenderer(language_code=request.LANGUAGE_CODE)
            rendered_content = renderer.render_string(template.html_body, context)
            
            # ESC/POS için HTML'den temizlenmiş metin çıktısı üret
            from .utils import html_to_thermal_text
            clean_text = html_to_thermal_text(rendered_content)
            
            service = EscPosService(printer)
            service.print_raw_text(clean_text)
            
            return Response(
                {
                    'status': 'success',
                    'message': _('Baskı %(printer)s yazıcısına gönderildi.')
                    % {'printer': printer.name},
                }
            )
        except Printer.DoesNotExist:
            return Response({'error': _('Yazıcı bulunamadı.')}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
