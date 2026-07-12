from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rbac.drf import RBACPermission
from core.branch_scope import filter_warehouse_transfer_queryset
from apps.inventory.services import InsufficientStockError
from .base import StandardPagination
from ..serializers import WarehouseTransferSerializer, WarehouseTransferCreateSerializer
from ..services import TransferService, TransferStockValidationError
from .. import selectors

class WarehouseTransferViewSet(viewsets.ModelViewSet):
    serializer_class = WarehouseTransferSerializer
    permission_classes = [RBACPermission]
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['transfer_number', 'notes']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            self.permission_codes = ['warehouse.view_transfer', 'warehouse.manage_transfer']
        elif self.action == 'approve':
            self.permission_codes = ['warehouse.approve_transfer']
        else:
            self.permission_codes = ['warehouse.manage_transfer']
        return super().get_permissions()

    def get_queryset(self):
        qs = selectors.get_transfers(
            source_warehouse_id=self.request.query_params.get('source_warehouse_id'),
            target_warehouse_id=self.request.query_params.get('target_warehouse_id'),
            status=self.request.query_params.get('status'),
            start_date=self.request.query_params.get('start_date'),
            end_date=self.request.query_params.get('end_date'),
        ).select_related('source_warehouse', 'target_warehouse', 'requested_by', 'approved_by').prefetch_related('items__stock_item')
        return filter_warehouse_transfer_queryset(qs, self.request.user)

    def get_serializer_class(self):
        if self.action == 'create': return WarehouseTransferCreateSerializer
        return WarehouseTransferSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data
        items_normalized = [
            {
                'stock_item_id': row['stock_item_id'],
                'quantity': row['quantity'],
                'unit': row['unit'],
                'notes': row.get('notes', ''),
            }
            for row in vd['items']
        ]
        transfer_data = {
            'source_warehouse_id': vd['source_warehouse_id'],
            'target_warehouse_id': vd['target_warehouse_id'],
            'transfer_date': vd['transfer_date'],
            'notes': vd.get('notes', ''),
        }
        try:
            transfer = TransferService.create_transfer(
                transfer_data,
                items_normalized,
                user=request.user,
                accept_partial=vd.get('accept_partial', False),
            )
        except TransferStockValidationError as e:
            return Response(
                {
                    'detail': str(e),
                    'code': 'INSUFFICIENT_STOCK',
                    'insufficient_items': e.insufficient_items,
                    'feasible_items': e.feasible_items,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        transfer = (
            transfer.__class__.objects.select_related(
                'source_warehouse', 'target_warehouse', 'requested_by', 'approved_by'
            )
            .prefetch_related('items__stock_item')
            .get(pk=transfer.pk)
        )
        output = WarehouseTransferSerializer(transfer, context={'request': request})
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        """
        PUT: Frontend oluşturma ile aynı gövdeyi kullanır (source_warehouse_id, target_warehouse_id, …).
        ModelSerializer güncellemesi «source_warehouse» beklediği için TransferService kullanılır.
        """
        instance = self.get_object()
        serializer = WarehouseTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data
        items_normalized = [
            {
                'stock_item_id': row['stock_item_id'],
                'quantity': row['quantity'],
                'unit': row['unit'],
                'notes': row.get('notes', ''),
            }
            for row in vd['items']
        ]
        transfer_data = {
            'source_warehouse_id': vd['source_warehouse_id'],
            'target_warehouse_id': vd['target_warehouse_id'],
            'transfer_date': vd['transfer_date'],
            'notes': vd.get('notes', ''),
        }
        try:
            transfer = TransferService.update_transfer(
                instance.pk,
                transfer_data,
                items_normalized,
                accept_partial=vd.get('accept_partial', False),
            )
        except TransferStockValidationError as e:
            return Response(
                {
                    'detail': str(e),
                    'code': 'INSUFFICIENT_STOCK',
                    'insufficient_items': e.insufficient_items,
                    'feasible_items': e.feasible_items,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        transfer = (
            transfer.__class__.objects.select_related(
                'source_warehouse', 'target_warehouse', 'requested_by', 'approved_by'
            )
            .prefetch_related('items__stock_item')
            .get(pk=transfer.pk)
        )
        output = WarehouseTransferSerializer(transfer, context={'request': request})
        return Response(output.data)

    def partial_update(self, request, *args, **kwargs):
        """PATCH de tam gövde beklenir (modal PUT ile uyumlu)."""
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        try:
            transfer = TransferService.approve_transfer(pk, user=request.user)
            return Response(WarehouseTransferSerializer(transfer).data)
        except (TransferStockValidationError, ValueError) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        try:
            transfer = TransferService.complete_transfer(pk, user=request.user)
            return Response(WarehouseTransferSerializer(transfer).data)
        except (TransferStockValidationError, ValueError, InsufficientStockError) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        """Taslak / bekleyen / yoldaki transferi iptal eder (stok çıkış-girişi tetiklenmez)."""
        try:
            transfer = TransferService.cancel_transfer(pk)
            return Response(WarehouseTransferSerializer(transfer).data)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
