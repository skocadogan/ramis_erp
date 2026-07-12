from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from decimal import Decimal
from django.utils.translation import gettext as _
from rbac.drf import RBACPermission
from core.branch_scope import filter_queryset_by_accessible_warehouses
from .base import StandardPagination
from ..serializers import WarehouseSerializer, WarehouseStockLevelSerializer
from ..services import WarehouseService
from .. import selectors

class WarehouseViewSet(viewsets.ModelViewSet):
    serializer_class = WarehouseSerializer
    permission_classes = [RBACPermission]
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']

    def get_permissions(self):
        read_codes = ['warehouse.view_warehouse', 'warehouse.manage_warehouse']
        write_codes = ['warehouse.manage_warehouse']
        if self.action in ['list', 'retrieve', 'stock_levels', 'summary']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def get_queryset(self):
        branch_id = self.request.query_params.get('branch_id')
        qs = selectors.get_warehouses(branch_id=branch_id).prefetch_related('branches', 'manager')
        return filter_queryset_by_accessible_warehouses(qs, self.request.user, warehouse_id_field="id")

    def perform_create(self, serializer):
        serializer.instance = WarehouseService.create_warehouse(serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = WarehouseService.update_warehouse(serializer.instance.id, serializer.validated_data)

    def perform_destroy(self, instance):
        WarehouseService.delete_warehouse(instance.id)

    @action(detail=True, methods=['get'])
    def stock_levels(self, request, pk=None):
        low_stock_only = request.query_params.get('low_stock') == 'true'
        search = request.query_params.get('search') or request.query_params.get('q')
        levels = selectors.get_warehouse_stock_levels(
            pk,
            low_stock_only=low_stock_only,
            search=search,
        )
        page = self.paginate_queryset(levels)
        if page is not None:
            serializer = WarehouseStockLevelSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = WarehouseStockLevelSerializer(levels, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def set_minimum(self, request, pk=None):
        stock_item_id = request.data.get('stock_item_id')
        minimum_quantity = request.data.get('minimum_quantity')
        if not stock_item_id or minimum_quantity is None:
            return Response({'error': _('stock_item_id ve minimum_quantity zorunludur.')}, status=status.HTTP_400_BAD_REQUEST)
        try:
            level = WarehouseService.set_minimum_quantity(warehouse_id=pk, stock_item_id=stock_item_id, minimum_quantity=Decimal(str(minimum_quantity)))
            return Response(WarehouseStockLevelSerializer(level).data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        branch_id = request.query_params.get('branch_id')
        return Response(
            selectors.get_all_warehouses_summary(branch_id=branch_id, user=request.user)
        )
