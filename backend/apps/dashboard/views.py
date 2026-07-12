from django.utils.translation import gettext as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rbac.drf import RBACPermission
from core.branch_scope import resolve_dashboard_branch_ids

from .services import parse_date_range
from apps.dashboard.selectors import (
    get_dashboard_summary,
    get_revenue_chart_data,
    get_top_selling_products,
    get_category_sales_breakdown,
    get_inventory_dashboard_summary,
    get_menu_engineering_analytics,
    get_product_sales_analytics,
)


class DashboardViewSet(viewsets.ViewSet):
    permission_classes = [RBACPermission]

    def get_permissions(self):
        self.permission_codes = ["dashboard.view_dashboard"]
        return [RBACPermission()]

    def _branch_scope(self, request):
        """Şube kapsamı: (branch_ids | None, hata yanıtı | None)."""
        branch_ids, err = resolve_dashboard_branch_ids(request)
        if err == "forbidden":
            return None, Response(
                {"detail": _("Bu şube için yetkiniz yok.")},
                status=status.HTTP_403_FORBIDDEN,
            )
        return branch_ids, None

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        branch_ids, err = self._branch_scope(request)
        if err:
            return err
            
        s, e, err = parse_date_range(
            request.query_params.get("start_date"),
            request.query_params.get("end_date"),
        )
        if err:
            return Response({"detail": _("Tarih formatı YYYY-MM-DD olmalıdır.")}, status=status.HTTP_400_BAD_REQUEST)

        data = get_dashboard_summary(branch_ids=branch_ids, start_date=s, end_date=e)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="revenue-chart")
    def revenue_chart(self, request):
        branch_ids, err = self._branch_scope(request)
        if err:
            return err
            
        s, e, _ = parse_date_range(
            request.query_params.get("start_date"),
            request.query_params.get("end_date"),
        )

        data = get_revenue_chart_data(branch_ids=branch_ids, start_date=s, end_date=e)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="top-products")
    def top_products(self, request):
        branch_ids, err = self._branch_scope(request)
        if err:
            return err
        limit = int(request.query_params.get("limit", 10))
        s, e, err = parse_date_range(
            request.query_params.get("start_date"),
            request.query_params.get("end_date"),
        )
        if err:
            return Response(
                {"detail": _("start_date / end_date YYYY-MM-DD olmalıdır.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = get_top_selling_products(branch_ids=branch_ids, limit=limit, start_date=s, end_date=e)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="category-breakdown")
    def category_breakdown(self, request):
        branch_ids, err = self._branch_scope(request)
        if err:
            return err
        s, e, err = parse_date_range(
            request.query_params.get("start_date"),
            request.query_params.get("end_date"),
        )
        if err:
            return Response(
                {"detail": _("start_date / end_date YYYY-MM-DD olmalıdır.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = get_category_sales_breakdown(branch_ids=branch_ids, start_date=s, end_date=e)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="inventory")
    def inventory(self, request):
        """Depo/stok analitik özetini döndürür."""
        branch_ids, err = self._branch_scope(request)
        if err:
            return err
        top_limit = int(request.query_params.get("limit", 10))
        s, e, err = parse_date_range(
            request.query_params.get("start_date"),
            request.query_params.get("end_date"),
        )
        if err:
            return Response(
                {"detail": _("start_date / end_date YYYY-MM-DD olmalıdır.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = get_inventory_dashboard_summary(
            branch_ids=branch_ids, start_date=s, end_date=e, top_limit=top_limit
        )
        return Response(data)

    @action(detail=False, methods=["get"], url_path="product-analytics")
    def product_analytics(self, request):
        branch_ids, err = self._branch_scope(request)
        if err:
            return err
        s, e, err = parse_date_range(
            request.query_params.get("start_date"),
            request.query_params.get("end_date"),
        )
        if err:
            return Response(
                {"detail": _("start_date / end_date YYYY-MM-DD olmalıdır.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = get_product_sales_analytics(
            branch_ids=branch_ids, 
            start_date=s, 
            end_date=e,
            product_id=request.query_params.get("product_id")
        )
        return Response(data)

    @action(detail=False, methods=["get"], url_path="menu-engineering")
    def menu_engineering(self, request):
        branch_ids, err = self._branch_scope(request)
        if err:
            return err
        s, e, err = parse_date_range(
            request.query_params.get("start_date"),
            request.query_params.get("end_date"),
        )
        if err:
            return Response(
                {"detail": _("start_date / end_date YYYY-MM-DD olmalıdır.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_limit = request.query_params.get("limit")
        try:
            top_limit = max(1, min(int(raw_limit or 10), 50))
        except (TypeError, ValueError):
            return Response(
                {"detail": _("limit sayısal olmalıdır.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = get_menu_engineering_analytics(
            branch_ids=branch_ids,
            start_date=s,
            end_date=e,
            product_id=request.query_params.get("product_id"),
            category_id=request.query_params.get("category_id"),
            menu_class=request.query_params.get("menu_class"),
            top_limit=top_limit,
        )
        return Response(data)

    @action(detail=False, methods=["get"], url_path="menu-engineering-actual")
    def menu_engineering_actual(self, request):
        return self.menu_engineering(request)
