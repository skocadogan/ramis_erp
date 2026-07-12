from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rbac.drf import RBACPermission
from core.branch_scope import filter_queryset_by_accessible_warehouses
from .base import StandardPagination
from ..serializers import GoodsReceivingSerializer, GoodsReceivingCreateSerializer
from ..services import GoodsReceivingService
from .. import selectors

class GoodsReceivingViewSet(viewsets.ModelViewSet):
    serializer_class = GoodsReceivingSerializer
    permission_classes = [RBACPermission]
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['receiving_number', 'supplier__name', 'invoice_number', 'waybill_number']

    def get_permissions(self):
        read_codes = ['warehouse.view_goods_receiving', 'warehouse.manage_goods_receiving']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = ['warehouse.manage_goods_receiving']
        return super().get_permissions()

    def get_queryset(self):
        qs = selectors.get_goods_receivings(
            warehouse_id=self.request.query_params.get('warehouse_id'),
            supplier_id=self.request.query_params.get('supplier_id'),
            purchase_order_id=self.request.query_params.get('purchase_order_id'),
            status=self.request.query_params.get('status'),
            start_date=self.request.query_params.get('start_date'),
            end_date=self.request.query_params.get('end_date'),
        ).select_related('supplier', 'warehouse', 'purchase_order', 'received_by', 'inspected_by').prefetch_related('items__stock_item')
        return filter_queryset_by_accessible_warehouses(qs, self.request.user)

    def get_serializer_class(self):
        if self.action == 'create': return GoodsReceivingCreateSerializer
        return GoodsReceivingSerializer

    def create(self, request, *args, **kwargs):
        serializer = GoodsReceivingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        items_data = data.pop('items')
        try:
            receiving = GoodsReceivingService.create_receiving(data=data, items_data=items_data, user=request.user)
            return Response(GoodsReceivingSerializer(receiving).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            GoodsReceivingService.delete_receiving(instance.id, user=request.user)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        try:
            receiving = GoodsReceivingService.complete_receiving(pk, user=request.user)
            return Response(GoodsReceivingSerializer(receiving).data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
