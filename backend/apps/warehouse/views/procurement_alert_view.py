from rest_framework import status, viewsets
from rest_framework.response import Response
from django.utils.translation import gettext as _

from rbac.drf import RBACPermission
from core.branch_scope import (
    filter_queryset_by_accessible_warehouses,
    user_accessible_warehouse_id_strings,
)

from apps.warehouse.models import Warehouse
from ..procurement_alert_selectors import build_procurement_alerts_payload


class ProcurementAlertViewSet(viewsets.ViewSet):
    """Geciken satın alma siparişleri ve tedarikçi teslimat uyarıları."""

    permission_classes = [RBACPermission]

    def get_permissions(self):
        self.permission_codes = ['warehouse.view_purchase_order']
        return super().get_permissions()

    def _resolve_warehouse_ids(self, request, warehouse_id: str | None):
        allowed = user_accessible_warehouse_id_strings(request.user)
        if warehouse_id:
            if allowed is not None and str(warehouse_id) not in allowed:
                return None, Response(
                    {'error': _('Bu depoya erişim yetkiniz yok.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return [str(warehouse_id)], None

        qs = Warehouse.objects.filter(is_active=True)
        branch_id = request.query_params.get('branch_id') or None
        if branch_id:
            qs = qs.filter(branches__id=branch_id, branches__is_active=True)
        qs = filter_queryset_by_accessible_warehouses(qs, request.user, warehouse_id_field='id')
        return list(qs.values_list('id', flat=True)), None

    def list(self, request):
        warehouse_id = request.query_params.get('warehouse_id') or None
        warehouse_ids, denied = self._resolve_warehouse_ids(request, warehouse_id)
        if denied:
            return denied

        lookback_raw = request.query_params.get('lookback_days', '90')
        try:
            lookback_days = max(int(lookback_raw), 1)
        except (TypeError, ValueError):
            lookback_days = 90

        supplier_id = request.query_params.get('supplier_id') or None
        branch_id = request.query_params.get('branch_id') or None

        payload = build_procurement_alerts_payload(
            warehouse_ids=warehouse_ids,
            branch_id=branch_id,
            supplier_id=supplier_id,
            lookback_days=lookback_days,
        )
        return Response(payload)
