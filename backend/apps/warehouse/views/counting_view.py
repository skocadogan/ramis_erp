from django.core.exceptions import ObjectDoesNotExist
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rbac.drf import RBACPermission
from core.branch_scope import filter_queryset_by_accessible_warehouses
from .base import StandardPagination
from ..serializers import StockCountingSerializer, StockCountingCreateSerializer
from ..services import StockCountingService
from .. import selectors


class StockCountingViewSet(viewsets.ModelViewSet):
    serializer_class = StockCountingSerializer
    permission_classes = [RBACPermission]
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['counting_number', 'notes']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            self.permission_codes = ['warehouse.view_stock_counting', 'warehouse.manage_stock_counting']
        elif self.action == 'approve':
            self.permission_codes = ['warehouse.approve_stock_counting']
        elif self.action == 'destroy':
            self.permission_codes = ['warehouse.manage_stock_counting', 'warehouse.delete_stock_counting_final']
        else:
            self.permission_codes = ['warehouse.manage_stock_counting']
        return super().get_permissions()

    def get_queryset(self):
        qs = selectors.get_stock_countings(
            warehouse_id=self.request.query_params.get('warehouse_id'),
            status=self.request.query_params.get('status'),
        ).select_related('warehouse', 'counted_by', 'approved_by').prefetch_related('items__stock_item')
        return filter_queryset_by_accessible_warehouses(qs, self.request.user)

    def get_serializer_class(self):
        if self.action == 'create':
            return StockCountingCreateSerializer
        return StockCountingSerializer

    def _serialize_counting(self, counting):
        counting = self.get_queryset().get(pk=counting.pk)
        return StockCountingSerializer(counting).data

    def create(self, request, *args, **kwargs):
        serializer = StockCountingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        items_data = data.pop('items', [])
        auto_populate = data.pop('auto_populate', False)

        counting_data = {
            'warehouse_id': data['warehouse_id'],
            'counting_date': data['counting_date'],
            'notes': data.get('notes', ''),
        }
        normalized_items = [
            {
                'stock_item_id': row['stock_item_id'],
                'system_quantity': row['system_quantity'],
                'counted_quantity': row['counted_quantity'],
                'unit': row['unit'],
                'notes': row.get('notes', ''),
                'difference_reason': row.get('difference_reason'),
            }
            for row in items_data
        ]

        try:
            counting = StockCountingService.create_counting(
                data=counting_data,
                items_data=normalized_items,
                user=request.user,
            )
            if auto_populate:
                StockCountingService.auto_populate_items(counting.id)
            return Response(
                self._serialize_counting(counting),
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        try:
            counting = StockCountingService.start_counting(pk)
            return Response(self._serialize_counting(counting))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def finish(self, request, pk=None):
        try:
            counting = StockCountingService.complete_counting(pk)
            return Response(self._serialize_counting(counting))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='update_items')
    def update_items(self, request, pk=None):
        items = request.data.get('items', [])
        if not isinstance(items, list):
            return Response({'error': 'items listesi gerekli.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            counting = StockCountingService.update_counting_items(pk, items)
            return Response(self._serialize_counting(counting))
        except (ValueError, ObjectDoesNotExist) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        try:
            counting = StockCountingService.approve_counting(pk, user=request.user)
            return Response(self._serialize_counting(counting))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            StockCountingService.delete_counting(instance.id, user=request.user)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
