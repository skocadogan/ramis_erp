from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.translation import gettext as _
from rbac.drf import RBACPermission, _check_permission
from core.branch_scope import filter_queryset_by_accessible_warehouses
from .base import StandardPagination
from ..models import PurchaseOrder, PurchaseOrderStatus
from ..serializers import (
    PurchaseOrderSerializer, PurchaseOrderCreateSerializer, PurchaseOrderUpdateSerializer
)
from ..services import PurchaseOrderService
from .. import selectors

class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    permission_classes = [RBACPermission]
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['order_number', 'supplier__name', 'notes']

    def get_permissions(self):
        read_codes = ['warehouse.view_purchase_order', 'warehouse.manage_purchase_order']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        elif self.action == 'approve':
            self.permission_codes = ['warehouse.approve_purchase_order']
        elif self.action == 'mark_ordered':
            self.permission_codes = ['warehouse.place_purchase_order']
        elif self.action in ('update', 'partial_update'):
            self.permission_codes = ['warehouse.manage_purchase_order', 'warehouse.edit_purchase_order_post_approval']
        else:
            self.permission_codes = ['warehouse.manage_purchase_order']
        return super().get_permissions()

    def get_queryset(self):
        qs = selectors.get_purchase_orders(
            warehouse_id=self.request.query_params.get('warehouse_id'),
            supplier_id=self.request.query_params.get('supplier_id'),
            status=self.request.query_params.get('status'),
            stock_item_id=self.request.query_params.get('stock_item_id'),
            start_date=self.request.query_params.get('start_date'),
            end_date=self.request.query_params.get('end_date'),
            overdue=self.request.query_params.get('overdue', '').lower() in ('1', 'true', 'yes'),
        ).select_related('supplier', 'warehouse', 'created_by', 'approved_by').prefetch_related('items__stock_item')
        return filter_queryset_by_accessible_warehouses(qs, self.request.user)

    def get_serializer_class(self):
        if self.action == 'create': return PurchaseOrderCreateSerializer
        if self.action in ('update', 'partial_update'): return PurchaseOrderUpdateSerializer
        return PurchaseOrderSerializer

    def _serialize_order(self, order):
        order = self.get_queryset().get(pk=order.pk)
        return PurchaseOrderSerializer(order, context={'request': self.request}).data

    def create(self, request, *args, **kwargs):
        serializer = PurchaseOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        items_data = data.pop('items')
        order_data = {
            'supplier_id': data['supplier_id'],
            'warehouse_id': data['warehouse_id'],
            'order_date': data['order_date'],
            'expected_date': data.get('expected_date'),
            'notes': data.get('notes', ''),
        }
        normalized_items = [
            {
                'stock_item_id': row['stock_item_id'],
                'quantity': row['quantity'],
                'unit': row['unit'],
                'unit_price': row['unit_price'],
                'notes': row.get('notes', ''),
            }
            for row in items_data
        ]
        try:
            order = PurchaseOrderService.create_order(
                order_data,
                normalized_items,
                user=request.user,
            )
            return Response(self._serialize_order(order), status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        return self._update_purchase_order(request, partial=False, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self._update_purchase_order(request, partial=True, *args, **kwargs)

    def _update_purchase_order(self, request, partial=False, *args, **kwargs):
        instance = self.get_object()
        st = instance.status
        is_super = getattr(request.user, 'is_superuser', False)
        has_post_approval_edit = _check_permission(request, 'warehouse.edit_purchase_order_post_approval')

        if st == PurchaseOrderStatus.DRAFT:
            if not (is_super or _check_permission(request, 'warehouse.manage_purchase_order')):
                return Response({'error': _('Yetki hatası.')}, status=status.HTTP_403_FORBIDDEN)
        elif st in (PurchaseOrderStatus.PENDING, PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIALLY_RECEIVED):
            if not (is_super or has_post_approval_edit):
                return Response({'error': _('Onay sonrası düzenleme yetkisi gerekir.')}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({'error': _('Bu durumda düzenleme yapılamaz.')}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PurchaseOrderUpdateSerializer(data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        items_data = None
        if 'items' in vd:
            items_data = [
                {
                    'stock_item_id': row['stock_item_id'],
                    'quantity': row['quantity'],
                    'unit': row['unit'],
                    'unit_price': row['unit_price'],
                    'notes': row.get('notes', ''),
                }
                for row in vd.pop('items')
            ]

        update_data = {}
        for field in ('supplier_id', 'warehouse_id', 'order_date', 'expected_date', 'notes'):
            if field in vd:
                update_data[field] = vd[field]

        try:
            order = PurchaseOrderService.update_order(
                str(instance.id),
                update_data,
                items_data=items_data,
                allow_edit_after_approval=(st != PurchaseOrderStatus.DRAFT),
            )
            return Response(self._serialize_order(order))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        try:
            order = PurchaseOrderService.submit_for_approval(pk)
            return Response(self._serialize_order(order))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        try:
            order = PurchaseOrderService.approve_order(pk, user=request.user)
            return Response(self._serialize_order(order))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='mark_ordered')
    def mark_ordered(self, request, pk=None):
        try:
            order = PurchaseOrderService.mark_ordered(pk)
            return Response(self._serialize_order(order))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        try:
            order = PurchaseOrderService.cancel_order(pk)
            return Response(self._serialize_order(order))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='recalculate-status')
    def recalculate_status(self, request, pk=None):
        self.get_object()
        try:
            order = PurchaseOrderService.recalculate_status(pk)
            return Response(self._serialize_order(order))
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='suggest-preview')
    def suggest_preview(self, request):
        warehouse_id = request.data.get('warehouse_id')
        if not warehouse_id:
            return Response({'error': _('warehouse_id zorunludur.')}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(PurchaseOrderService.preview_suggestions(warehouse_id))
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='suggest')
    def suggest(self, request):
        warehouse_id = request.data.get('warehouse_id')
        if not warehouse_id:
            return Response({'error': _('warehouse_id zorunludur.')}, status=status.HTTP_400_BAD_REQUEST)
        preferred_suppliers = request.data.get('preferred_suppliers')
        try:
            result = PurchaseOrderService.suggest_orders_for_warehouse(
                warehouse_id=warehouse_id,
                user=request.user,
                preferred_suppliers=preferred_suppliers,
            )
            return Response(
                {
                    'orders': PurchaseOrderSerializer(result['orders'], many=True).data,
                    'created_count': len(result['orders']),
                    'skipped_items': result.get('skipped_items', []),
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
