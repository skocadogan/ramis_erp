from decimal import Decimal

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.translation import gettext as _

from rbac.drf import RBACPermission
from core.branch_scope import user_accessible_warehouse_id_strings

from ..purchase_recommendation_selectors import consumption_window_start
from ..serializers import (
    PurchaseOrderSerializer,
    PurchaseRecommendationCommitSerializer,
)
from ..services.purchase_recommendation_service import PurchaseRecommendationService
from .base import StandardPagination


class PurchaseRecommendationViewSet(viewsets.ViewSet):
    """Talep bazlı satın alma önerileri — ayrı endpoint (minimum stok suggest'ten bağımsız)."""

    permission_classes = [RBACPermission]
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action == 'commit':
            self.permission_codes = ['warehouse.commit_purchase_recommendation']
        else:
            self.permission_codes = ['warehouse.view_purchase_recommendation']
        return super().get_permissions()

    def _assert_warehouse_param_access(self, request, warehouse_id: str) -> Response | None:
        if not warehouse_id:
            return Response(
                {'error': _('warehouse_id zorunludur.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed = user_accessible_warehouse_id_strings(request.user)
        if allowed is not None and str(warehouse_id) not in allowed:
            return Response({'error': _('Bu depoya erişim yetkiniz yok.')}, status=status.HTTP_403_FORBIDDEN)
        return None

    def list(self, request):
        warehouse_id = request.query_params.get('warehouse_id')
        denied = self._assert_warehouse_param_access(request, warehouse_id)
        if denied:
            return denied

        weeks_raw = request.query_params.get('weeks', '4')
        try:
            weeks = int(weeks_raw)
        except (TypeError, ValueError):
            weeks = 4
        if weeks not in (4, 8):
            weeks = 4

        only_positive = request.query_params.get('only_positive', 'true').lower() != 'false'
        category_id = request.query_params.get('category_id') or None
        search = request.query_params.get('search') or None
        branch_id = request.query_params.get('branch_id') or None
        horizon_days_raw = request.query_params.get('horizon_days')
        try:
            horizon_days = int(horizon_days_raw) if horizon_days_raw else None
        except (TypeError, ValueError):
            horizon_days = None

        try:
            meta = PurchaseRecommendationService.compute_recommendations(
                warehouse_id=warehouse_id,
                user=request.user,
                weeks=weeks,
                branch_id=branch_id,
                category_id=category_id,
                search=search,
                only_positive=only_positive,
                horizon_days=horizon_days,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        paginator = StandardPagination()
        page_qs = paginator.paginate_queryset(meta['queryset'], request)
        since = consumption_window_start(meta['weeks'])
        safety_factor = Decimal(meta['safety_factor'])

        rows = PurchaseRecommendationService.serialize_page(
            items_qs=page_qs or [],
            warehouse_id=warehouse_id,
            weeks=meta['weeks'],
            safety_factor=safety_factor,
            since=since,
            horizon_days=meta['horizon_days'],
        )

        if only_positive:
            rows = [r for r in rows if Decimal(r['recommended_quantity']) > 0]

        response = paginator.get_paginated_response(rows)
        response.data['warehouse_id'] = meta['warehouse_id']
        response.data['weeks'] = meta['weeks']
        response.data['horizon_days'] = meta['horizon_days']
        response.data['safety_factor'] = meta['safety_factor']
        response.data['since'] = meta['since']
        return response

    @action(detail=False, methods=['post'], url_path='commit')
    def commit(self, request):
        serializer = PurchaseRecommendationCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        denied = self._assert_warehouse_param_access(request, str(data['warehouse_id']))
        if denied:
            return denied

        try:
            result = PurchaseRecommendationService.commit_recommendations(
                warehouse_id=str(data['warehouse_id']),
                items=data['items'],
                user=request.user,
                preferred_suppliers=data.get('preferred_suppliers'),
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'orders': PurchaseOrderSerializer(result['orders'], many=True).data,
                'created_count': result['created_count'],
                'skipped_items': result['skipped_items'],
            },
            status=status.HTTP_201_CREATED,
        )
