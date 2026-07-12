from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.translation import gettext as _
from rbac.drf import RBACPermission, RBACPermissionAll
from core.branch_scope import branch_filter_qs, user_may_access_branch, accessible_branch_id_strings

from apps.reservations.models import (
    DEFAULT_DUE_ALERT_INTERVAL_MINUTES,
    DEFAULT_DUE_ALERT_LEAD_MINUTES,
    Reservation,
    ReservationBranchSettings,
)
from apps.reservations.serializers import (
    ReservationSerializer,
    ReservationCreateSerializer,
    ReservationPatchSerializer,
    CancelSerializer,
    ReservationBranchSettingsSerializer,
    ReservationBranchSettingsByBranchSerializer,
)
from apps.reservations.services import ReservationService, ReservationError
from apps.reservations.reservation_alerts import clear_reservation_alert_settings_cache


def _reservation_settings_resolve_branch_id(request) -> str:
    qp = (request.query_params.get("branch_id") or "").strip()
    body = ""
    if isinstance(request.data, dict):
        raw = request.data.get("branch")
        body = str(raw).strip() if raw is not None else ""
    bid = qp or body
    if not bid and not request.user.is_superuser:
        ub = getattr(request.user, "branch_id", None)
        bid = str(ub) if ub else ""
    return bid


def _reservation_settings_branch_forbidden(request, branch_id: str) -> bool:
    if not branch_id:
        return True
    allowed = accessible_branch_id_strings(request.user)
    if allowed is None:
        return False
    return branch_id not in allowed


class ReservationBranchSettingsViewSet(viewsets.GenericViewSet):
    """
    Şube başına rezervasyon geliş bildirimi ayarı (OneToOne).
    GET/PATCH ``/reservations/branch-settings/by-branch/?branch_id=`` veya gövdede ``branch``.
    """

    permission_classes = [RBACPermission]
    queryset = ReservationBranchSettings.objects.filter(is_active=True)

    def get_permissions(self):
        if self.action == "by_branch":
            if self.request.method == "PATCH":
                self.required_permissions = {"by_branch": "reservations.manage_reservation"}
            else:
                self.required_permissions = {"by_branch": "reservations.view_reservation"}
        return [RBACPermission()]

    @action(detail=False, methods=["get", "patch"], url_path="by-branch")
    def by_branch(self, request):
        if request.method == "GET":
            branch_id = _reservation_settings_resolve_branch_id(request)
            if not branch_id:
                return Response(
                    {"detail": _("branch_id query parametresi gerekli.")},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if _reservation_settings_branch_forbidden(request, branch_id):
                return Response(status=status.HTTP_403_FORBIDDEN)

            row = ReservationBranchSettings.objects.filter(branch_id=branch_id).first()
            payload = {
                "branch": branch_id,
                "due_alert_lead_minutes": (
                    row.due_alert_lead_minutes
                    if row
                    else DEFAULT_DUE_ALERT_LEAD_MINUTES
                ),
                "due_alert_interval_minutes": (
                    row.due_alert_interval_minutes
                    if row
                    else DEFAULT_DUE_ALERT_INTERVAL_MINUTES
                ),
            }
            if row:
                payload["id"] = str(row.id)
                payload["updated_at"] = row.updated_at
            return Response(payload)

        ser = ReservationBranchSettingsByBranchSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        branch_id = str(ser.validated_data["branch"])
        if _reservation_settings_branch_forbidden(request, branch_id):
            return Response(status=status.HTTP_403_FORBIDDEN)

        obj = ReservationService.upsert_branch_settings(
            branch_id,
            due_alert_lead_minutes=ser.validated_data["due_alert_lead_minutes"],
            due_alert_interval_minutes=ser.validated_data["due_alert_interval_minutes"],
        )
        clear_reservation_alert_settings_cache()
        return Response(ReservationBranchSettingsSerializer(obj).data)


class ReservationViewSet(viewsets.ModelViewSet):
    queryset = (
        Reservation.objects.filter(is_active=True)
        .select_related("branch", "table", "table__zone", "created_by")
        .order_by("-scheduled_date", "-scheduled_time")
    )
    permission_classes = [RBACPermission]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return ReservationCreateSerializer
        if self.action in ("partial_update", "update"):
            return ReservationPatchSerializer
        return ReservationSerializer

    def get_permissions(self):
        if self.action == "create":
            self.permission_codes = ["reservations.manage_reservation"]
            return [RBACPermissionAll()]
        if self.action in ("partial_update", "update", "confirm", "seat", "cancel", "no_show"):
            self.permission_codes = ["reservations.manage_reservation"]
            return [RBACPermissionAll()]
        self.permission_codes = ["reservations.view_reservation", "reservations.manage_reservation"]
        return [RBACPermission()]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = branch_filter_qs(qs, self.request, field="branch_id")
        p = self.request.query_params
        d = p.get("scheduled_date")
        if d:
            qs = qs.filter(scheduled_date=d)
        st = p.get("status")
        if st:
            qs = qs.filter(status=st)
        return qs

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        bid = str(data["branch"].id)
        if not user_may_access_branch(request.user, bid):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        try:
            r = ReservationService.create_reservation(
                branch_id=bid,
                customer_name=data["customer_name"],
                party_size=data["party_size"],
                scheduled_date=data["scheduled_date"],
                scheduled_time=data["scheduled_time"],
                user=request.user,
                table_id=str(data["table"].id) if data.get("table") else None,
                customer_phone=data.get("customer_phone") or "",
                customer_email=data.get("customer_email") or "",
                duration_minutes=data.get("duration_minutes") or 120,
                notes=data.get("notes") or "",
            )
        except ReservationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ReservationSerializer(r).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        ser = self.get_serializer(instance, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        kwargs_map = {}
        if "table" in data:
            kwargs_map["table_id"] = str(data["table"].id) if data["table"] else None
        for key in (
            "customer_name",
            "customer_phone",
            "customer_email",
            "party_size",
            "scheduled_date",
            "scheduled_time",
            "duration_minutes",
            "notes",
        ):
            if key in data:
                kwargs_map[key] = data[key]
        try:
            r = ReservationService.update_reservation(str(instance.id), **kwargs_map)
        except ReservationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ReservationSerializer(r).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        bid = str(instance.branch_id)
        if not user_may_access_branch(request.user, bid):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        ReservationService.delete_reservation(str(instance.id))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, pk=None):
        try:
            r = ReservationService.confirm(str(pk))
        except ReservationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ReservationSerializer(r).data)

    @action(detail=True, methods=["post"], url_path="seat")
    def seat(self, request, pk=None):
        try:
            r = ReservationService.seat(str(pk))
        except ReservationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ReservationSerializer(r).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        ser = CancelSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            r = ReservationService.cancel(str(pk), reason=ser.validated_data.get("reason") or "")
        except ReservationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ReservationSerializer(r).data)

    @action(detail=True, methods=["post"], url_path="no-show")
    def no_show(self, request, pk=None):
        try:
            r = ReservationService.mark_no_show(str(pk))
        except ReservationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ReservationSerializer(r).data)
