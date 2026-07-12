from rest_framework import viewsets, status
from django.utils.translation import gettext as _
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Printer
from .serializers import PrinterSerializer
from .services.escpos_service import EscPosService, PrinterError
from rbac.drf import RBACPermission

class PrinterViewSet(viewsets.ModelViewSet):
    queryset = Printer.objects.filter(is_active=True)
    serializer_class = PrinterSerializer
    permission_classes = [RBACPermission]
    
    # İzin kodları seed_rbac.py için
    required_permissions = {
        'list': 'printing.view_printer',
        'retrieve': 'printing.view_printer',
        'create': 'printing.manage_printer',
        'update': 'printing.manage_printer',
        'partial_update': 'printing.manage_printer',
        'destroy': 'printing.manage_printer',
        'test_print': 'printing.direct_print',
        'sync_status': 'printing.view_printer',
    }

    def get_queryset(self):
        from core.branch_scope import branch_filter_qs
        return branch_filter_qs(
            super().get_queryset().select_related('kitchen_station'),
            self.request,
        )

    @action(detail=True, methods=['post'])
    def test_print(self, request, pk=None):
        """Sends a test page to the printer."""
        printer = self.get_object()
        service = EscPosService(printer)
        
        test_payload = {
            'header': _('TEST BASKISI'),
            'sub_header': _('Yazıcı: %(name)s') % {'name': printer.name},
            'items': [
                {'name': _('Sistem Kontrol'), 'qty': 1, 'price': 'OK'},
                {'name': _('Bağlantı Tipi'), 'qty': 1, 'price': printer.connection_type},
            ],
            'total': _('BAŞARILI')
        }
        
        try:
            service.print_ticket(test_payload)
            return Response({'status': 'success', 'message': _('Test çıktısı gönderildi.')})
        except PrinterError as e:
            return Response(
                {'status': 'error', 'message': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def sync_status(self, request, pk=None):
        """Perform an on-demand status check for a single printer."""
        printer = self.get_object()
        service = EscPosService(printer)
        try:
            from django.utils import timezone
            status_data = service.check_status()
            printer.status_info = status_data
            if status_data.get('online'):
                printer.last_seen = timezone.now()
            printer.save(update_fields=["status_info", "last_seen", "updated_at"])
            return Response(PrinterSerializer(printer).data)
        except Exception as e:
            return Response(
                {'status': 'error', 'message': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
