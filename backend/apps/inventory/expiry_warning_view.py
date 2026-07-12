from django.conf import settings
from django.utils.translation import gettext as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from rbac.drf import RBACPermission
from core.branch_scope import user_accessible_warehouse_id_strings

from apps.warehouse.views.base import StandardPagination

from .models import ExpiryActionType
from .serializers import (
    ExpiryActionCreateSerializer,
    ExpiryActionHistorySerializer,
    ExpiryAutoReturnCancelSerializer,
    StockMovementSerializer,
)
from .services.expiry_automation_service import ExpiryAutomationService
from .services.expiry_return_cancel_service import auto_return_cancel_expired_lot
from .services import InsufficientStockError
from .services.expiry_action_service import ExpiryActionService, serialize_lot, serialize_lots
from .services.expiry_service import ExpiryTrackingService


def _resolve_warehouse_scope(request, warehouse_id: str | None):
    """Kullanıcının erişebildiği depo id listesini döndürür."""
    allowed = user_accessible_warehouse_id_strings(request.user)
    if allowed is not None:
        if not allowed:
            return None, []
        if warehouse_id:
            if str(warehouse_id) not in allowed:
                return Response(
                    {'detail': _('Bu depo için yetkiniz yok.')},
                    status=status.HTTP_403_FORBIDDEN,
                ), None
            return None, [str(warehouse_id)]
        return None, list(allowed)
    if warehouse_id:
        return None, [str(warehouse_id)]
    return None, None


def _parse_days_ahead(raw) -> int:
    options = getattr(settings, 'EXPIRY_WARNING_DAYS_OPTIONS', [3, 7])
    default = getattr(settings, 'EXPIRY_WARNING_DAYS_DEFAULT', 3)
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return default
    if days in options:
        return days
    return default


class ExpiryWarningViewSet(viewsets.ViewSet):
    """SKT erken uyarı listesi, özet ve aksiyon akışı."""

    permission_classes = [RBACPermission]
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action in ('create_action', 'preview_action', 'execute_action'):
            self.permission_codes = ['inventory.manage_expiry_action']
        elif self.action in ('auto_return_cancel',):
            self.permission_codes = ['inventory.manage_return_cancel']
        else:
            self.permission_codes = [
                'inventory.view_expiry_risk',
                'inventory.view_stock_item',
                'inventory.manage_stock_item',
            ]
        return super().get_permissions()

    def list(self, request):
        warehouse_id = request.query_params.get('warehouse_id') or None
        days_ahead = _parse_days_ahead(request.query_params.get('days_ahead'))

        denied, wids = _resolve_warehouse_scope(request, warehouse_id)
        if isinstance(denied, Response):
            return denied

        if wids is not None:
            lots = ExpiryTrackingService.get_expiring_lots(
                warehouse_ids=wids,
                days_ahead=days_ahead,
            )
        else:
            lots = ExpiryTrackingService.get_expiring_lots(
                warehouse_id=warehouse_id,
                days_ahead=days_ahead,
            )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(lots, request, view=self)
        lot_page = page if page is not None else lots
        data = serialize_lots(lot_page)
        if page is not None:
            return paginator.get_paginated_response(data)
        return Response(data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        warehouse_id = request.query_params.get('warehouse_id') or None
        denied, wids = _resolve_warehouse_scope(request, warehouse_id)
        if isinstance(denied, Response):
            return denied

        if wids is not None:
            data = ExpiryTrackingService.get_summary(limit_warehouse_ids=wids)
        else:
            data = ExpiryTrackingService.get_summary(warehouse_id=warehouse_id)
        return Response(data)

    @action(detail=False, methods=['post'], url_path='actions')
    def create_action(self, request):
        serializer = ExpiryActionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            action_obj = ExpiryActionService.record_action(
                user=request.user,
                lot_id=str(serializer.validated_data['lot_id']),
                action_type=serializer.validated_data['action_type'],
                notes=serializer.validated_data.get('notes', ''),
            )
        except PermissionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            ExpiryActionHistorySerializer(action_obj).data,
            status=status.HTTP_201_CREATED,
        )

    def _action_params(self, validated_data) -> dict:
        params = {'notes': validated_data.get('notes', '')}
        if validated_data.get('target_warehouse_id'):
            params['target_warehouse_id'] = str(validated_data['target_warehouse_id'])
        if validated_data.get('quantity') is not None:
            params['quantity'] = validated_data['quantity']
        return params

    @action(detail=False, methods=['post'], url_path='actions/preview')
    def preview_action(self, request):
        serializer = ExpiryActionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            preview = ExpiryAutomationService.preview_action(
                user=request.user,
                lot_id=str(data['lot_id']),
                action_type=data['action_type'],
                **self._action_params(data),
            )
        except PermissionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(preview)

    @action(detail=False, methods=['post'], url_path='actions/execute')
    def execute_action(self, request):
        serializer = ExpiryActionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            action_obj = ExpiryAutomationService.execute_action(
                user=request.user,
                lot_id=str(data['lot_id']),
                action_type=data['action_type'],
                **self._action_params(data),
            )
        except PermissionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            ExpiryActionHistorySerializer(action_obj).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'], url_path='actions/history')
    def action_history(self, request):
        lot_id = request.query_params.get('lot_id') or None
        warehouse_id = request.query_params.get('warehouse_id') or None
        try:
            limit = int(request.query_params.get('limit', 50))
        except (TypeError, ValueError):
            limit = 50

        if warehouse_id:
            denied, _ = _resolve_warehouse_scope(request, warehouse_id)
            if isinstance(denied, Response):
                return denied

        qs = ExpiryActionService.get_action_history(
            request.user,
            lot_id=lot_id,
            warehouse_id=warehouse_id,
            limit=limit,
        )
        serializer = ExpiryActionHistorySerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='action-types')
    def action_types(self, request):
        automation_enabled = bool(
            getattr(settings, 'EXPIRY_ACTION_AUTOMATION_ENABLED', False)
        )
        return Response({
            'automation_enabled': automation_enabled,
            'types': [
                {'value': choice.value, 'label': choice.label}
                for choice in ExpiryActionType
            ],
        })

    @action(detail=False, methods=['post'], url_path='auto-return-cancel')
    def auto_return_cancel(self, request):
        serializer = ExpiryAutoReturnCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            movement = auto_return_cancel_expired_lot(
                user=request.user,
                lot_id=str(serializer.validated_data['lot_id']),
                notes=serializer.validated_data.get('notes', ''),
            )
        except PermissionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except InsufficientStockError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            StockMovementSerializer(movement).data,
            status=status.HTTP_201_CREATED,
        )
