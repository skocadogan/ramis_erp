from datetime import datetime, time

# pyrefly: ignore [missing-import]
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.translation import gettext as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rbac.drf import RBACPermission, RBACPermissionAll
from core.branch_scope import branch_filter_qs, user_may_access_branch

from apps.shifts.models import Shift, CashierPinAssignment
from apps.shifts.serializers import (
    ShiftListSerializer,
    ShiftOpenSerializer,
    ShiftCloseSerializer,
    ShiftExpenseCreateSerializer,
    ShiftExpenseSerializer,
    ShiftCashMovementCreateSerializer,
    ShiftCashMovementSerializer,
    CashierPinAssignmentSerializer,
    CashierPinAssignmentWriteSerializer,
)
from apps.shifts.services import ShiftService, ShiftError
from apps.shifts.selectors import get_active_shift, get_shift_z_report, get_shift_cash_report


class ShiftListPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500


class ShiftViewSet(viewsets.ReadOnlyModelViewSet):
    """Vardiya listeleme ve işlemler."""

    queryset = Shift.objects.select_related(
        "branch", "opened_by", "closed_by", "opened_at_terminal"
    ).order_by("-opened_at")
    serializer_class = ShiftListSerializer
    permission_classes = [RBACPermission]
    pagination_class = ShiftListPagination

    def get_permissions(self):
        if self.action in ["open_shift", "add_expense", "add_cash_movement"]:
            self.permission_codes = ["shifts.manage_shift"]
            return [RBACPermissionAll()]
        if self.action == "update_closing_info":
            self.permission_codes = ["shifts.edit_closed_shift", "shifts.manage_shift"]
            return [RBACPermission()]
        if self.action == "close_shift":
            self.permission_codes = ["shifts.close_shift", "shifts.manage_shift"]
            return [RBACPermission()]
        if self.action in ["list", "retrieve", "active", "z_report"]:
            self.permission_codes = ["shifts.view_shift", "shifts.manage_shift"]
            return [RBACPermission()]
        self.permission_codes = ["shifts.view_shift", "shifts.manage_shift"]
        return [RBACPermission()]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = branch_filter_qs(qs, self.request, field="branch_id")
        st = self.request.query_params.get("status")
        if st in ("OPEN", "CLOSED"):
            qs = qs.filter(status=st)

        df = (self.request.query_params.get("date_from") or "").strip()
        if df:
            d = parse_date(df)
            if d:
                start = timezone.make_aware(datetime.combine(d, time.min))
                qs = qs.filter(opened_at__gte=start)

        dto = (self.request.query_params.get("date_to") or "").strip()
        if dto:
            d = parse_date(dto)
            if d:
                end = timezone.make_aware(datetime.combine(d, time.max))
                qs = qs.filter(opened_at__lte=end)

        tid = (self.request.query_params.get("opened_at_terminal") or "").strip()
        if tid:
            qs = qs.filter(opened_at_terminal_id=tid)

        return qs

    @action(detail=False, methods=["post"], url_path="open")
    def open_shift(self, request):
        ser = ShiftOpenSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        bid = str(ser.validated_data["branch_id"])
        if not user_may_access_branch(request.user, bid):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        try:
            shift = ShiftService.open_shift(
                branch_id=bid,
                user=request.user,
                opening_cash=ser.validated_data["opening_cash"],
                at_terminal_id=ser.validated_data.get("at_terminal_id"),
            )
        except ShiftError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ShiftListSerializer(shift).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="close")
    def close_shift(self, request, pk=None):
        shift = self.get_object()
        ser = ShiftCloseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            shift = ShiftService.close_shift(
                shift_id=str(shift.id),
                user=request.user,
                actual_cash=ser.validated_data["actual_cash"],
                actual_card=ser.validated_data.get("actual_card", 0),
                actual_other=ser.validated_data.get("actual_other", 0),
                notes=ser.validated_data.get("notes") or "",
            )
        except ShiftError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ShiftListSerializer(shift).data)

    @action(detail=False, methods=["get"], url_path="active")
    def active(self, request):
        branch_id = request.query_params.get("branch_id")
        terminal_id = request.query_params.get("terminal_id")
        if not branch_id:
            return Response({"detail": _("branch_id gerekli.")}, status=status.HTTP_400_BAD_REQUEST)
        if not user_may_access_branch(request.user, str(branch_id)):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        shift = get_active_shift(branch_id, terminal_id=terminal_id)
        if not shift:
            return Response(None, status=status.HTTP_200_OK)
        return Response(ShiftListSerializer(shift).data)

    @action(detail=True, methods=["get"], url_path="z-report")
    def z_report(self, request, pk=None):
        try:
            data = get_shift_z_report(str(pk))
        except Shift.DoesNotExist:
            return Response({"detail": _("Vardiya bulunamadı.")}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)

    @action(detail=True, methods=["get"], url_path="cash-report")
    def cash_report(self, request, pk=None):
        try:
            data = get_shift_cash_report(str(pk))
        except Shift.DoesNotExist:
            return Response({"detail": _("Vardiya bulunamadı.")}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)

    @action(detail=True, methods=["post"], url_path="expenses")
    def add_expense(self, request, pk=None):
        shift = self.get_object()
        ser = ShiftExpenseCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            exp = ShiftService.add_expense(
                shift_id=str(shift.id),
                description=ser.validated_data["description"],
                amount=ser.validated_data["amount"],
                user=request.user,
            )
        except ShiftError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ShiftExpenseSerializer(exp).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="cash-movements")
    def add_cash_movement(self, request, pk=None):
        shift = self.get_object()
        ser = ShiftCashMovementCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            mov = ShiftService.add_cash_movement(
                shift_id=str(shift.id),
                amount=ser.validated_data["amount"],
                movement_type=ser.validated_data["movement_type"],
                description=ser.validated_data.get("description") or "",
                user=request.user,
            )
        except ShiftError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ShiftCashMovementSerializer(mov).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="update-closing")
    def update_closing_info(self, request, pk=None):
        shift = self.get_object()
        ser = ShiftCloseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            shift = ShiftService.update_closing_info(
                shift_id=str(shift.id),
                user=request.user,
                actual_cash=ser.validated_data["actual_cash"],
                actual_card=ser.validated_data.get("actual_card", 0),
                actual_other=ser.validated_data.get("actual_other", 0),
                notes=ser.validated_data.get("notes") or "",
            )
        except ShiftError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ShiftListSerializer(shift).data)


class CashierPinAssignmentViewSet(viewsets.ModelViewSet):
    queryset = CashierPinAssignment.objects.select_related("branch", "user").prefetch_related("pos_terminals").order_by("-created_at")
    permission_classes = [RBACPermission]
    pagination_class = ShiftListPagination

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            self.permission_codes = ["shifts.view_cashier_pin", "shifts.manage_cashier_pin"]
            return [RBACPermission()]
        self.permission_codes = ["shifts.manage_cashier_pin"]
        return [RBACPermission()]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = branch_filter_qs(qs, self.request, field="branch_id")
        
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
            
        user_id = self.request.query_params.get("user_id")
        if user_id:
            qs = qs.filter(user_id=user_id)
            
        return qs

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return CashierPinAssignmentWriteSerializer
        return CashierPinAssignmentSerializer

