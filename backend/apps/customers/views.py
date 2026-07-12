from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.translation import gettext as _
from rest_framework.pagination import PageNumberPagination
from django.http import HttpResponse
from django.utils import timezone
from rbac.drf import RBACPermission

from .models import Customer
from .serializers import CustomerSerializer
from .services import get_customer_sales_queryset, calculate_sales_totals
from apps.sales.serializers import SaleSerializer
from apps.reporting.services.excel_export import ExcelExportService
from apps.reporting.services.pdf_export import PDFExportService
from apps.reporting.services.renderer import ReportRenderer

class CustomerPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200

class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Müşteri Yönetimi'
    pagination_class = CustomerPagination

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'detail_sales', 'export_pdf', 'export_excel', 'export_sales_pdf', 'export_sales_excel']:
            self.permission_codes = ['customers.view_customer', 'customers.manage_customer']
        else:
            self.permission_codes = ['customers.manage_customer']
        return super().get_permissions()

    def get_queryset(self):
        # Müşteriler global olduğundan (şubeden bağımsız) doğrudan tüm aktifleri döner
        # Ancak soft delete için is_active=True olanları filtreliyoruz
        qs = Customer.objects.filter(is_active=True)
        
        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(phone__icontains=search) |
                Q(email__icontains=search)
            )
        
        customer_type = self.request.query_params.get('customer_type')
        if customer_type and customer_type != 'ALL':
            qs = qs.filter(customer_type=customer_type)

        return qs

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        # Soft delete mekanizması
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'])
    def detail_sales(self, request, pk=None):
        """Müşterinin yaptığı geçmiş satışların listesi ve toplamları."""
        customer = self.get_object()
        sales_qs = get_customer_sales_queryset(customer, request)
        totals = calculate_sales_totals(sales_qs)

        page = self.paginate_queryset(sales_qs)
        if page is not None:
            serializer = SaleSerializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            response.data['totals'] = totals
            return response

        serializer = SaleSerializer(sales_qs, many=True)
        return Response({
            'count': sales_qs.count(),
            'results': serializer.data,
            'totals': totals,
        })

    @action(detail=False, methods=['get'], url_path='export/excel')
    def export_excel(self, request):
        queryset = self.get_queryset()
        
        columns = [
            {'key': 'name', 'label': _('Müşteri/Firma Adı')},
            {'key': 'customer_type', 'label': _('Tip')},
            {'key': 'phone', 'label': _('Telefon')},
            {'key': 'email', 'label': _('E-posta')},
            {'key': 'tax_office', 'label': _('Vergi Dairesi')},
            {'key': 'tax_no', 'label': _('Vergi No')},
            {'key': 'tc_no', 'label': _('T.C. No')},
            {'key': 'address', 'label': _('Adres')},
        ]
        
        data = []
        for c in queryset:
            data.append({
                'name': c.name,
                'customer_type': c.get_customer_type_display(),
                'phone': c.phone,
                'email': c.email,
                'tax_office': c.tax_office,
                'tax_no': c.tax_no,
                'tc_no': c.tc_no,
                'address': c.address,
            })
            
        excel_bytes = ExcelExportService.generate_excel(data, columns, title=_("Müşteri Listesi"))
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename = f"musteri_listesi_{timezone.now().strftime('%Y%m%d_%H%M')}.xlsx"
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
        queryset = self.get_queryset()
        
        context = {
            'customers': queryset[:1000],
            'report_date': timezone.now(),
            'filters': {
                'customer_type': request.query_params.get('customer_type'),
                'search': request.query_params.get('search'),
            }
        }
        
        renderer = ReportRenderer(language_code=request.LANGUAGE_CODE)
        html_content = renderer.render_file('reports/customer_list.html', context)
        
        pdf_service = PDFExportService()
        pdf_bytes = pdf_service.generate_pdf_from_html(html_content)
        
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"musteri_listesi_{timezone.now().strftime('%Y%m%d_%H%M')}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['get'], url_path='export-sales/pdf')
    def export_sales_pdf(self, request, pk=None):
        from django.conf import settings
        if getattr(settings, 'DISABLE_PDF_EXPORT', False):
            return Response(
                {'error': _('PDF raporlama devre dışı.')},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        customer = self.get_object()
        sales_qs = get_customer_sales_queryset(customer, request)
        totals = calculate_sales_totals(sales_qs)

        context = {
            'customer_name': customer.name,
            'sales': sales_qs[:1000],
            'totals': totals,
            'report_date': timezone.now(),
        }
        
        renderer = ReportRenderer(language_code=request.LANGUAGE_CODE)
        html_content = renderer.render_file('reports/customer_sales_detail.html', context)
        
        pdf_service = PDFExportService()
        pdf_bytes = pdf_service.generate_pdf_from_html(html_content)
        
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"musteri_satis_detay_{customer.id}_{timezone.now().strftime('%Y%m%d_%H%M')}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['get'], url_path='export-sales/excel')
    def export_sales_excel(self, request, pk=None):
        customer = self.get_object()
        sales_qs = get_customer_sales_queryset(customer, request)
        totals = calculate_sales_totals(sales_qs)

        columns = [
            {'key': 'id', 'label': _('Satış No')},
            {'key': 'paid_at', 'label': _('Tarih')},
            {'key': 'branch_name', 'label': _('Şube')},
            {'key': 'payment_method_display', 'label': _('Ödeme Yöntemi')},
            {'key': 'gross_amount', 'label': _('Brüt Tutar')},
            {'key': 'discount_amount', 'label': _('İndirim')},
            {'key': 'total_amount', 'label': _('Net Tutar')},
        ]
        
        data = []
        for s in sales_qs:
            data.append({
                'id': str(s.id),
                'paid_at': s.paid_at.strftime('%d.%m.%Y %H:%M'),
                'branch_name': s.branch.name,
                'payment_method_display': s.get_payment_method_display(),
                'gross_amount': float(s.total_amount + s.discount_amount),
                'discount_amount': float(s.discount_amount),
                'total_amount': float(s.total_amount),
            })
            
        data.append({
            'id': _('TOPLAM'),
            'paid_at': '',
            'branch_name': '',
            'payment_method_display': '',
            'gross_amount': totals['gross_total'],
            'discount_amount': totals['discount_total'],
            'total_amount': totals['net_total'],
        })
        
        excel_bytes = ExcelExportService.generate_excel(data, columns, title=_("Müşteri Satış Detayları"))
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename = f"musteri_satis_detay_{customer.id}_{timezone.now().strftime('%Y%m%d_%H%M')}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
