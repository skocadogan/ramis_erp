from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from django.http import HttpResponse
from django.utils import timezone
from django.utils.translation import gettext as _

from core.branch_scope import branch_filter_qs
from rbac.drf import RBACPermission
from apps.reporting.services.excel_export import ExcelExportService
from apps.reporting.services.pdf_export import PDFExportService
from apps.reporting.services.renderer import ReportRenderer

from .models import WaiterCallLog
from .serializers import WaiterCallLogSerializer, WaiterOrderSalesSerializer
from .selectors import (
    aggregate_waiter_call_totals,
    get_waiter_call_logs_queryset,
    staff_waiter_call_performance,
)
from .waiter_order_selectors import (
    aggregate_cancellation_reasons,
    aggregate_waiter_order_totals,
    build_order_channel_map,
    daily_order_counts_for_chart,
    get_waiter_orders_queryset,
    staff_waiter_order_performance,
)


class PerformancesPagination(PageNumberPagination):
    page_size = 200
    page_size_query_param = 'page_size'
    max_page_size = 500


class WaiterCallLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WaiterCallLogSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Performans Yönetimi'
    pagination_class = PerformancesPagination

    def get_permissions(self):
        self.permission_codes = ['performances.view_performance']
        return super().get_permissions()

    def _base_queryset(self):
        params = self.request.query_params
        qs = get_waiter_call_logs_queryset(
            branch_id=params.get('branch_id'),
            start_date=params.get('start_date'),
            end_date=params.get('end_date'),
            staff_id=params.get('staff_id'),
            status=params.get('status'),
        )
        return branch_filter_qs(qs, self.request, field='branch_id')

    def get_queryset(self):
        return self._base_queryset()

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        totals = aggregate_waiter_call_totals(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            response.data['totals'] = totals
            return response

        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'count': queryset.count(),
            'results': serializer.data,
            'totals': totals,
        })

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        queryset = self._base_queryset()
        totals = aggregate_waiter_call_totals(queryset)
        staff_rows = staff_waiter_call_performance(queryset)
        return Response({
            'totals': totals,
            'staff_performance': staff_rows,
        })

    @action(detail=False, methods=['get'], url_path='export/excel')
    def export_excel(self, request):
        queryset = self._base_queryset()
        totals = aggregate_waiter_call_totals(queryset)
        items = list(queryset[:5000])

        columns = [
            {'key': 'called_at', 'label': _('Tarih')},
            {'key': 'branch_name', 'label': _('Şube')},
            {'key': 'table_name', 'label': _('Masa')},
            {'key': 'zone_name', 'label': _('Bölge')},
            {'key': 'dismissed_by_name', 'label': _('Görüldü yapan')},
            {'key': 'response_seconds', 'label': _('Yanıt (sn)')},
            {'key': 'status_display', 'label': _('Durum')},
        ]

        data = []
        for log in items:
            dismissed_name = ''
            if log.dismissed_by:
                dismissed_name = log.dismissed_by.get_full_name().strip() or log.dismissed_by.username
            data.append({
                'called_at': timezone.localtime(log.called_at).strftime('%d.%m.%Y %H:%M'),
                'branch_name': log.branch.name if log.branch else '',
                'table_name': log.table_name,
                'zone_name': log.zone_name,
                'dismissed_by_name': dismissed_name,
                'response_seconds': log.response_seconds if log.response_seconds is not None else '',
                'status_display': log.get_status_display(),
            })

        data.append({
            'called_at': _('TOPLAM'),
            'branch_name': '',
            'table_name': '',
            'zone_name': '',
            'dismissed_by_name': '',
            'response_seconds': totals['avg_response_seconds'],
            'status_display': str(totals['total_calls']),
        })

        excel_bytes = ExcelExportService.generate_excel(
            data, columns, title=_('Garson Çağrı Performans Raporu')
        )
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        filename = f"garson_cagri_{timezone.now().strftime('%Y%m%d_%H%M')}.xlsx"
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
        queryset = self._base_queryset()
        totals = aggregate_waiter_call_totals(queryset)
        staff_rows = staff_waiter_call_performance(queryset)
        items = list(queryset[:1000])

        context = {
            'logs': items,
            'totals': totals,
            'staff_performance': staff_rows,
            'report_date': timezone.now(),
            'filters': {
                'start_date': request.query_params.get('start_date'),
                'end_date': request.query_params.get('end_date'),
                'branch': request.query_params.get('branch_id'),
            },
        }

        renderer = ReportRenderer(language_code=request.LANGUAGE_CODE)
        html_content = renderer.render_file('reports/waiter_calls_report.html', context)

        pdf_service = PDFExportService()
        pdf_bytes = pdf_service.generate_pdf_from_html(html_content)

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"garson_cagri_{timezone.now().strftime('%Y%m%d_%H%M')}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class WaiterOrderSalesViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WaiterOrderSalesSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Performans Yönetimi — Garson Satış'
    pagination_class = PerformancesPagination

    def get_permissions(self):
        self.permission_codes = ['performances.view_performance']
        return super().get_permissions()

    def _base_queryset(self):
        params = self.request.query_params
        return get_waiter_orders_queryset(
            branch_id=params.get('branch_id'),
            start_date=params.get('start_date'),
            end_date=params.get('end_date'),
            staff_id=params.get('staff_id'),
            status=params.get('status'),
        )

    def get_queryset(self):
        qs = self._base_queryset()
        return branch_filter_qs(qs, self.request, field='branch_id')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        qs = self.filter_queryset(self.get_queryset())
        order_ids = list(qs.values_list('id', flat=True)[:5000])
        ctx['channel_by_order'] = build_order_channel_map(order_ids)
        return ctx

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        order_ids = list(queryset.values_list('id', flat=True))
        channel_by_order = build_order_channel_map(order_ids)
        totals = aggregate_waiter_order_totals(queryset, channel_by_order)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(
                page,
                many=True,
                context={**self.get_serializer_context(), 'channel_by_order': channel_by_order},
            )
            response = self.get_paginated_response(serializer.data)
            response.data['totals'] = totals
            return response

        serializer = self.get_serializer(
            queryset,
            many=True,
            context={**self.get_serializer_context(), 'channel_by_order': channel_by_order},
        )
        return Response({
            'count': queryset.count(),
            'results': serializer.data,
            'totals': totals,
        })

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        queryset = branch_filter_qs(self._base_queryset(), request, field='branch_id')
        order_ids = list(queryset.values_list('id', flat=True))
        channel_by_order = build_order_channel_map(order_ids)
        totals = aggregate_waiter_order_totals(queryset, channel_by_order)
        staff_rows = staff_waiter_order_performance(queryset, channel_by_order)
        return Response({
            'totals': totals,
            'staff_performance': staff_rows,
            'cancellation_breakdown': aggregate_cancellation_reasons(queryset),
            'daily_sales': daily_order_counts_for_chart(queryset),
        })

    @action(detail=False, methods=['get'], url_path='export/excel')
    def export_excel(self, request):
        from apps.orders.cancellation_reasons import format_cancellation_reason_display
        from apps.orders.models import OrderStatus

        queryset = branch_filter_qs(self._base_queryset(), request, field='branch_id')
        order_ids = list(queryset.values_list('id', flat=True)[:5000])
        channel_by_order = build_order_channel_map(order_ids)
        totals = aggregate_waiter_order_totals(queryset, channel_by_order)
        items = list(queryset[:5000])

        channel_labels = {
            'mobile': _('Mobil uygulama'),
            'web': _('Web'),
            'unknown': _('Bilinmiyor'),
        }

        columns = [
            {'key': 'created_at', 'label': _('Tarih')},
            {'key': 'branch_name', 'label': _('Şube')},
            {'key': 'table_name', 'label': _('Masa')},
            {'key': 'zone_name', 'label': _('Bölge')},
            {'key': 'staff_name', 'label': _('Garson')},
            {'key': 'order_number', 'label': _('Sipariş No')},
            {'key': 'total_amount', 'label': _('Tutar')},
            {'key': 'order_channel', 'label': _('Kanal')},
            {'key': 'status_display', 'label': _('Durum')},
            {'key': 'cancel_reason', 'label': _('İptal gerekçesi')},
        ]

        data = []
        for order in items:
            staff_name = ''
            if order.user:
                staff_name = order.user.get_full_name().strip() or order.user.username
            zone_name = order.table.zone.name if order.table and order.table.zone else ''
            ch = channel_by_order.get(str(order.id), 'unknown')
            cancel_reason = ''
            if order.status == OrderStatus.CANCELLED:
                cancel_reason = format_cancellation_reason_display(
                    code=order.cancel_reason_code,
                    text=order.cancel_reason_text,
                ) or ''
            data.append({
                'created_at': timezone.localtime(order.created_at).strftime('%d.%m.%Y %H:%M'),
                'branch_name': order.branch.name if order.branch else '',
                'table_name': order.table.name if order.table else '',
                'zone_name': zone_name,
                'staff_name': staff_name,
                'order_number': order.order_number or '',
                'total_amount': str(order.total_amount),
                'order_channel': channel_labels.get(ch, ch),
                'status_display': order.get_status_display(),
                'cancel_reason': cancel_reason,
            })

        data.append({
            'created_at': _('TOPLAM'),
            'branch_name': '',
            'table_name': '',
            'zone_name': '',
            'staff_name': '',
            'order_number': str(totals['total_orders']),
            'total_amount': totals['total_sales_amount'],
            'order_channel': '',
            'status_display': '',
            'cancel_reason': '',
        })

        excel_bytes = ExcelExportService.generate_excel(
            data, columns, title=_('Garson Satış Performans Raporu')
        )
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        filename = f"garson_satis_{timezone.now().strftime('%Y%m%d_%H%M')}.xlsx"
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
        queryset = branch_filter_qs(self._base_queryset(), request, field='branch_id')
        order_ids = list(queryset.values_list('id', flat=True))
        channel_by_order = build_order_channel_map(order_ids)
        totals = aggregate_waiter_order_totals(queryset, channel_by_order)
        staff_rows = staff_waiter_order_performance(queryset, channel_by_order)
        items = list(queryset[:1000])
        channel_labels = {
            'mobile': _('Mobil uygulama'),
            'web': _('Web'),
            'unknown': _('Bilinmiyor'),
        }
        for order in items:
            ch = channel_by_order.get(str(order.id), 'unknown')
            order.report_channel_label = channel_labels.get(ch, ch)

        context = {
            'orders': items,
            'channel_by_order': channel_by_order,
            'totals': totals,
            'staff_performance': staff_rows,
            'cancellation_breakdown': aggregate_cancellation_reasons(queryset),
            'report_date': timezone.now(),
            'filters': {
                'start_date': request.query_params.get('start_date'),
                'end_date': request.query_params.get('end_date'),
                'branch': request.query_params.get('branch_id'),
            },
        }

        renderer = ReportRenderer(language_code=request.LANGUAGE_CODE)
        html_content = renderer.render_file('reports/waiter_sales_report.html', context)

        pdf_service = PDFExportService()
        pdf_bytes = pdf_service.generate_pdf_from_html(html_content)

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"garson_satis_{timezone.now().strftime('%Y%m%d_%H%M')}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
