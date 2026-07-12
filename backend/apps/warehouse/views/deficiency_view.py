from django.db.models import Prefetch
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.translation import gettext as _
from rbac.drf import RBACPermission
from core.branch_scope import filter_queryset_by_accessible_warehouses
from .base import StandardPagination
from ..serializers import DeficiencyReportSerializer, DeficiencyReportCreateSerializer
from ..services import DeficiencyReportService
from ..services.deficiency_action_service import DeficiencyActionService
from ..models import WarehouseTransfer, PurchaseOrder
from .. import selectors


def _deficiency_report_prefetches():
    return (
        'items__stock_item',
        Prefetch(
            'purchase_orders',
            queryset=PurchaseOrder.objects.filter(is_active=True),
        ),
        Prefetch(
            'transfers',
            queryset=WarehouseTransfer.objects.filter(is_active=True).prefetch_related(
                'items__stock_item',
            ),
        ),
    )


class DeficiencyReportViewSet(viewsets.ModelViewSet):
    serializer_class = DeficiencyReportSerializer
    permission_classes = [RBACPermission]
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['report_number', 'notes']
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_permissions(self):
        read_codes = [
            'warehouse.view_deficiency_report',
            'warehouse.manage_deficiency_report',
        ]
        if self.action in ['list', 'retrieve', 'stock_availability']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = ['warehouse.manage_deficiency_report']
        return super().get_permissions()

    def get_queryset(self):
        qs = selectors.get_deficiency_reports(
            warehouse_id=self.request.query_params.get('warehouse_id'),
            branch_id=self.request.query_params.get('branch_id'),
            kitchen_station_id=self.request.query_params.get('kitchen_station_id'),
            status=self.request.query_params.get('status'),
        ).select_related(
            'kitchen_station__branch', 'target_warehouse', 'created_by', 'approved_by',
        ).prefetch_related(*_deficiency_report_prefetches())
        return filter_queryset_by_accessible_warehouses(
            qs, self.request.user, warehouse_id_field='target_warehouse_id',
        )

    def get_serializer_class(self):
        if self.action == 'create':
            return DeficiencyReportCreateSerializer
        return DeficiencyReportSerializer

    def _serialize_report(self, report):
        report = (
            self.get_queryset()
            .filter(pk=report.pk)
            .first()
        )
        if report is None:
            report = (
                selectors.get_deficiency_reports()
                .select_related(
                    'kitchen_station__branch', 'target_warehouse', 'created_by', 'approved_by',
                )
                .prefetch_related(*_deficiency_report_prefetches())
                .get(pk=report.pk)
            )
        return DeficiencyReportSerializer(report, context={'request': self.request}).data

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data
        try:
            report = DeficiencyReportService.create_report(
                kitchen_station_id=vd['kitchen_station_id'],
                notes=vd.get('notes', ''),
                items=vd['items'],
                user=request.user,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        output = self._serialize_report(report)
        return Response(output, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            DeficiencyReportService.delete_report(instance.id, user=request.user)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        try:
            report = DeficiencyReportService.approve_report(pk, user=request.user)
            return Response(self._serialize_report(report))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        try:
            report = DeficiencyReportService.cancel_report(pk, user=request.user)
            return Response(self._serialize_report(report))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='create_purchase_order')
    def create_purchase_order(self, request, pk=None):
        supplier_id = request.data.get('supplier_id')
        warehouse_id = request.data.get('warehouse_id')
        if not supplier_id or not warehouse_id:
            return Response(
                {'error': _('supplier_id ve warehouse_id zorunludur.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            po = DeficiencyReportService.create_purchase_order(
                pk,
                supplier_id=supplier_id,
                warehouse_id=warehouse_id,
                user=request.user,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        from ..serializers import PurchaseOrderSerializer

        return Response(PurchaseOrderSerializer(po).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='create_transfer')
    def create_transfer(self, request, pk=None):
        source_warehouse_id = request.data.get('source_warehouse_id')
        if not source_warehouse_id:
            return Response(
                {'error': _('source_warehouse_id zorunludur.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            transfer = DeficiencyReportService.create_transfer(
                pk,
                source_warehouse_id=source_warehouse_id,
                user=request.user,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        from ..serializers import WarehouseTransferSerializer

        return Response(WarehouseTransferSerializer(transfer).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='stock_availability')
    def stock_availability(self, request, pk=None):
        self.get_object()
        try:
            data = DeficiencyReportService.get_availability(pk)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(data)

    @action(detail=True, methods=['post'], url_path='auto_fulfill')
    def auto_fulfill(self, request, pk=None):
        self.get_object()
        try:
            transfers = DeficiencyReportService.auto_fulfill(pk, user=request.user)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        from ..serializers import WarehouseTransferSerializer

        return Response(
            WarehouseTransferSerializer(transfers, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='preview_item_actions')
    def preview_item_actions(self, request, pk=None):
        self.get_object()
        items = request.data.get('items') or []
        try:
            summary = DeficiencyActionService.preview_item_actions(pk, items)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(summary)

    @action(detail=True, methods=['post'], url_path='execute_item_actions')
    def execute_item_actions(self, request, pk=None):
        self.get_object()
        items = request.data.get('items') or []
        try:
            result = DeficiencyActionService.queue_item_actions(
                pk,
                items,
                supplier_id=request.data.get('supplier_id'),
                warehouse_id=request.data.get('warehouse_id'),
                user=request.user,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_202_ACCEPTED)
