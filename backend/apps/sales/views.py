from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.translation import gettext as _
from rest_framework.pagination import PageNumberPagination
from django.http import HttpResponse
from rbac.drf import RBACPermission
from django.utils import timezone as django_timezone
from django.utils import timezone # Double check
from django.utils.dateparse import parse_date
from core.branch_scope import branch_filter_qs
from apps.reporting.services.excel_export import ExcelExportService
from apps.reporting.services.pdf_export import PDFExportService
from apps.reporting.services.renderer import ReportRenderer


from .models import Sale, PaymentMethod
from .serializers import SaleSerializer, CancellationRecordSerializer
from .selectors import get_sales_queryset, aggregate_sale_money_totals, get_sales_summary
from .cancellation_selectors import (
    get_cancellations_queryset,
    aggregate_cancellation_totals,
    resolve_cancellation_actors,
    format_cancellation_reason_display,
)
from .services import SaleService, SaleValidationError, sales_summary_cache_key


def _truthy_query_param(value):
    if value is None:
        return False
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


class SalesPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class SaleViewSet(viewsets.ModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Satış Yönetimi'
    pagination_class = SalesPagination
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'summary', 'deleted', 'export_pdf', 'export_excel', 'cancellations', 'export_cancellations_pdf', 'export_cancellations_excel']:
            self.permission_codes = ['sales.view_sale', 'sales.manage_sale']
        else:
            self.permission_codes = ['sales.manage_sale']
        return super().get_permissions()

    def get_queryset(self):
        params = self.request.query_params
        qs = get_sales_queryset(
            branch_id=params.get('branch_id'),
            payment_method=params.get('payment_method')
            if params.get('payment_method') in [m.value for m in PaymentMethod]
            else None,
            start_date=params.get('start_date'),
            end_date=params.get('end_date'),
            order_id=params.get('order'),
            discount_only=_truthy_query_param(params.get('discount_only')),
            pos_terminal_id=params.get('pos_terminal_id'),
            created_by_id=params.get('created_by_id'),
            table_id=params.get('table_id'),
        )
        return branch_filter_qs(qs, self.request, field='branch_id')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        totals = aggregate_sale_money_totals(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            response.data['totals'] = totals
            response.data['total_amount_sum'] = totals['net_total']
            return response

        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'count': queryset.count(),
            'results': serializer.data,
            'totals': totals,
            'total_amount_sum': totals['net_total'],
        })

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            SaleService.soft_delete(instance.id)
        except SaleValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['delete'], url_path='bulk_delete_permanent')
    def bulk_delete_permanent(self, request):
        ids = request.data.get('ids', [])
        try:
            deleted_count = SaleService.bulk_delete_permanent(ids)
        except SaleValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'deleted': deleted_count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='bulk_restore')
    def bulk_restore(self, request):
        ids = request.data.get('ids', [])
        try:
            restored_count = SaleService.bulk_restore(ids)
        except SaleValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'restored': restored_count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def deleted(self, request):
        params = request.query_params
        qs = get_sales_queryset(
            branch_id=params.get('branch_id'),
            start_date=params.get('start_date'),
            end_date=params.get('end_date'),
            discount_only=_truthy_query_param(params.get('discount_only')),
            deleted=True,
            pos_terminal_id=params.get('pos_terminal_id'),
            created_by_id=params.get('created_by_id'),
        )
        qs = branch_filter_qs(qs, request, field='branch_id')
        totals = aggregate_sale_money_totals(qs)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            response.data['totals'] = totals
            response.data['total_amount_sum'] = totals['net_total']
            return response

        serializer = self.get_serializer(qs, many=True)
        return Response({
            'count': qs.count(),
            'results': serializer.data,
            'totals': totals,
            'total_amount_sum': totals['net_total'],
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        PERF-2: Özet veriler 5 dakika önbelleklenir.
        Önbellek anahtarı: kullanıcı şube kapsamı + şube parametresi + güncel nesil + tarih
        (aynı ?branch_id olmadan çok şubeli kullanıcı ile süper kullanıcı sonuçları karışmasın diye).
        """
        from django.core.cache import cache
        from django.utils import timezone

        today = timezone.now().date().isoformat()
        cache_key = sales_summary_cache_key(request, today)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        base_qs = self.get_queryset()
        data = get_sales_summary(base_qs)
        cache.set(cache_key, data, timeout=300)  # 5 dakika
        return Response(data)

    @action(detail=False, methods=['get'], url_path='export/excel')
    def export_excel(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        totals = aggregate_sale_money_totals(queryset)
        items = list(queryset[:5000])
        
        columns = [
            {'key': 'id', 'label': _('No')},
            {'key': 'paid_at', 'label': _('Tarih')},
            {'key': 'branch_name', 'label': _('Şube')},
            {'key': 'payment_method', 'label': _('Ödeme Türü')},
            {'key': 'gross_total', 'label': _('Brüt')},
            {'key': 'discount', 'label': _('İndirim')},
            {'key': 'net_total', 'label': _('Net')},
        ]
        
        data = []
        for s in items:
            pm_display = s.get_payment_method_display()
            if s.is_split_payment:
                pm_display = f"{pm_display} ({_('(bölünmüş)')})"
            
            data.append({
                'id': str(s.id),
                'paid_at': s.paid_at.strftime('%d.%m.%Y %H:%M'),
                'branch_name': s.branch.name,
                'payment_method': pm_display,
                'gross_total': float(s.total_amount + s.discount_amount),
                'discount': float(s.discount_amount),
                'net_total': float(s.total_amount),
            })
            
        # Alt toplam satırı ekle
        data.append({
            'id': _('TOPLAM'),
            'paid_at': '',
            'branch_name': '',
            'payment_method': '',
            'gross_total': totals['gross_total'],
            'discount': totals['discount_total'],
            'net_total': totals['net_total'],
        })
        
        excel_bytes = ExcelExportService.generate_excel(data, columns, title=_("Satış Raporu"))
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename = f"satis_raporu_{timezone.now().strftime('%Y%m%d_%H%M')}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=['get'], url_path='export/pdf')
    def export_pdf(self, request):
        from django.conf import settings
        if getattr(settings, 'DISABLE_PDF_EXPORT', False):
            return Response(
                {'error': _('PDF raporlama devre dışı.')},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        queryset = self.filter_queryset(self.get_queryset())
        totals = aggregate_sale_money_totals(queryset)
        
        context = {
            'sales': queryset[:1000],  # PDF için limitliyoruz
            'totals': totals,
            'report_date': timezone.now(),
            'filters': {
                'start_date': request.query_params.get('start_date'),
                'end_date': request.query_params.get('end_date'),
                'branch': request.query_params.get('branch_id'),
            }
        }
        
        renderer = ReportRenderer(language_code=request.LANGUAGE_CODE)
        html_content = renderer.render_file('reports/sales_report.html', context)
        
        pdf_service = PDFExportService()
        pdf_bytes = pdf_service.generate_pdf_from_html(html_content)
        
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"satis_raporu_{timezone.now().strftime('%Y%m%d_%H%M')}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def _cancellations_queryset(self, request):
        params = request.query_params
        qs = get_cancellations_queryset(
            branch_id=params.get('branch_id'),
            start_date=params.get('start_date'),
            end_date=params.get('end_date'),
            product_id=params.get('product_id'),
            search=params.get('search'),
            table_id=params.get('table_id'),
        )
        return branch_filter_qs(qs, request, field='order__branch_id')

    @action(detail=False, methods=['get'], url_path='cancellations')
    def cancellations(self, request):
        queryset = self._cancellations_queryset(request)
        totals = aggregate_cancellation_totals(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            actor_map = resolve_cancellation_actors(page)
            data = CancellationRecordSerializer.serialize_items(page, actor_map)
            response = self.get_paginated_response(data)
            response.data['totals'] = totals
            return response

        items = list(queryset)
        actor_map = resolve_cancellation_actors(items)
        data = CancellationRecordSerializer.serialize_items(items, actor_map)
        return Response({
            'count': len(data),
            'results': data,
            'totals': totals,
        })

    @action(detail=False, methods=['get'], url_path='cancellations/export/excel')
    def export_cancellations_excel(self, request):
        queryset = self._cancellations_queryset(request)
        totals = aggregate_cancellation_totals(queryset)
        items = list(queryset[:5000])
        actor_map = resolve_cancellation_actors(items)
        rows = CancellationRecordSerializer.serialize_items(items, actor_map)

        columns = [
            {'key': 'cancelled_at', 'label': _('Tarih')},
            {'key': 'branch_name', 'label': _('Şube')},
            {'key': 'table_name', 'label': _('Masa')},
            {'key': 'cancelled_by_name', 'label': _('İptal Eden')},
            {'key': 'reason', 'label': _('Neden')},
            {'key': 'product_name', 'label': _('Ürün')},
            {'key': 'quantity', 'label': _('Miktar')},
            {'key': 'total_price', 'label': _('Tutar')},
        ]

        data = []
        for row in rows:
            reason = format_cancellation_reason_display(
                row.get('cancel_reason_code'),
                row.get('cancel_reason_text'),
            )
            cancelled_at = row.get('cancelled_at')
            data.append({
                'cancelled_at': cancelled_at.strftime('%d.%m.%Y %H:%M') if cancelled_at else '',
                'branch_name': row.get('branch_name') or '',
                'table_name': row.get('table_name') or '',
                'cancelled_by_name': row.get('cancelled_by_name') or '',
                'reason': reason,
                'product_name': row.get('product_name') or '',
                'quantity': row.get('quantity') or 0,
                'total_price': float(row.get('total_price') or 0),
            })

        data.append({
            'cancelled_at': _('TOPLAM'),
            'branch_name': '',
            'table_name': '',
            'cancelled_by_name': '',
            'reason': '',
            'product_name': '',
            'quantity': totals['item_count'],
            'total_price': totals['total_amount'],
        })

        excel_bytes = ExcelExportService.generate_excel(
            data, columns, title=_("İptaller ve İadeler Raporu")
        )
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        filename = f"{_('iptaller_iadeler')}_{timezone.now().strftime('%Y%m%d_%H%M')}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'], url_path='return')
    def return_sale(self, request, pk=None):
        """Satışı iade eder — ReturnDisposalFlow oluşturup stok iade akışı başlatır."""
        reason_code = request.data.get('reason_code', '')
        reason_text = request.data.get('reason_text', '')
        if not reason_code:
            return Response(
                {'detail': _('İade gerekçe kodu zorunludur.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            sale = SaleService.return_sale(
                sale_id=pk,
                reason_code=reason_code,
                reason_text=reason_text,
                performed_by=request.user,
            )
        except SaleValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(sale)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='cancellations/export/pdf')
    def export_cancellations_pdf(self, request):
        from django.conf import settings
        if getattr(settings, 'DISABLE_PDF_EXPORT', False):
            return Response(
                {'error': _('PDF raporlama devre dışı.')},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        queryset = self._cancellations_queryset(request)
        totals = aggregate_cancellation_totals(queryset)
        items = list(queryset[:1000])
        actor_map = resolve_cancellation_actors(items)
        rows = CancellationRecordSerializer.serialize_items(items, actor_map)
        for row in rows:
            row['reason_display'] = format_cancellation_reason_display(
                row.get('cancel_reason_code'),
                row.get('cancel_reason_text'),
            )

        context = {
            'rows': rows,
            'totals': totals,
            'report_date': timezone.now(),
            'filters': {
                'start_date': request.query_params.get('start_date'),
                'end_date': request.query_params.get('end_date'),
                'branch': request.query_params.get('branch_id'),
            },
        }

        renderer = ReportRenderer(language_code=request.LANGUAGE_CODE)
        html_content = renderer.render_file('reports/cancellations_report.html', context)

        pdf_service = PDFExportService()
        pdf_bytes = pdf_service.generate_pdf_from_html(html_content)

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"{_('iptaller_iadeler')}_{timezone.now().strftime('%Y%m%d_%H%M')}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
