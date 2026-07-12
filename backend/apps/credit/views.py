"""Ödenmez (müşteri kredisi) API ViewSet."""

from django.db.models import Q
from django.utils.translation import gettext as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from core.branch_scope import accessible_branch_id_strings, user_may_access_branch
from rbac.drf import RBACPermission, RBACPermissionAll

from .models import CreditAccount
from .selectors import account_transactions_qs, annotate_account_balances
from .serializers import (
    CreditAccountSerializer,
    CreditAccountUpdateSerializer,
    CreditAccountWriteSerializer,
    CreditTopupSerializer,
    CreditTransactionSerializer,
)
from .services import CreditError, CreditService


class CreditAccountPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class CreditTransactionPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500


def _credit_branch_filter_qs(qs, request):
    """Global hesaplar + kullanıcının erişebildiği şube hesapları."""
    user = request.user
    if not user.is_authenticated:
        return qs.none()

    qp_branch = (request.query_params.get("branch_id") or "").strip() or None
    allowed = accessible_branch_id_strings(user)

    if allowed is None:
        if qp_branch:
            qs = qs.filter(Q(is_global=True) | Q(branch_id=qp_branch))
    else:
        if not allowed:
            return qs.none()
        qs = qs.filter(Q(is_global=True) | Q(branch_id__in=allowed))
        if qp_branch:
            if qp_branch not in allowed:
                return qs.none()
            qs = qs.filter(Q(is_global=True) | Q(branch_id=qp_branch))

    search = (request.query_params.get("search") or "").strip()
    if search:
        qs = qs.filter(
            Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(phone__icontains=search)
            | Q(email__icontains=search)
            | Q(user__username__icontains=search)
        )
    return qs


class CreditAccountViewSet(viewsets.ModelViewSet):
    queryset = (
        CreditAccount.objects.filter(is_active=True)
        .select_related("user", "branch", "created_by")
        .order_by("first_name", "last_name")
    )
    serializer_class = CreditAccountSerializer
    permission_classes = [RBACPermission]
    pagination_class = CreditAccountPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return CreditAccountWriteSerializer
        if self.action in ("partial_update", "update"):
            return CreditAccountUpdateSerializer
        return CreditAccountSerializer

    def get_permissions(self):
        if self.action in ("create", "partial_update", "update", "destroy", "topup"):
            self.permission_codes = ["credit.manage_account"]
            return [RBACPermissionAll()]
        self.permission_codes = ["credit.view_account", "credit.manage_account"]
        return [RBACPermission()]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = _credit_branch_filter_qs(qs, self.request)
        return annotate_account_balances(qs)

    def _fresh_account_data(self, account_id):
        row = annotate_account_balances(
            CreditAccount.objects.filter(pk=account_id, is_active=True).select_related(
                "user", "branch", "created_by"
            )
        ).first()
        if not row:
            return None
        return CreditAccountSerializer(row).data

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        return Response(CreditAccountSerializer(instance).data)

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        branch = data.get("branch")
        is_global = data.get("is_global", False)
        if branch and not user_may_access_branch(request.user, str(branch.id)):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        try:
            acc = CreditService.create_account(
                first_name=data["first_name"],
                last_name=data.get("last_name") or "",
                user=data.get("user"),
                phone=data.get("phone") or "",
                email=data.get("email") or "",
                address=data.get("address") or "",
                notes=data.get("notes") or "",
                branch_id=str(branch.id) if branch else None,
                is_global=is_global,
                credit_policy=data.get("credit_policy"),
                created_by=request.user,
            )
        except CreditError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        payload = self._fresh_account_data(acc.id)
        return Response(payload, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        ser = self.get_serializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        if "branch" in data and data["branch"] is not None:
            if not user_may_access_branch(request.user, str(data["branch"].id)):
                return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        fields = {}
        for key in ("first_name", "last_name", "phone", "email", "address", "notes", "credit_policy", "is_global"):
            if key in data:
                fields[key] = data[key]
        if "user" in data:
            fields["user"] = data["user"]
        if "branch" in data:
            fields["branch_id"] = str(data["branch"].id) if data["branch"] else None
        try:
            acc = CreditService.update_account(str(instance.id), **fields)
        except CreditError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self._fresh_account_data(acc.id))

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.branch_id and not user_may_access_branch(request.user, str(instance.branch_id)):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        try:
            CreditService.delete_account(str(instance.id))
        except CreditError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="topup")
    def topup(self, request, pk=None):
        instance = self.get_object()
        ser = CreditTopupSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        branch = data.get("branch")
        branch_id = str(branch.id) if branch else (str(instance.branch_id) if instance.branch_id else None)
        if branch_id and not user_may_access_branch(request.user, branch_id):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        try:
            CreditService.topup(
                str(instance.id),
                data["amount"],
                user=request.user,
                branch_id=branch_id,
                notes=data.get("notes") or "",
            )
        except CreditError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self._fresh_account_data(instance.id))

    @action(detail=True, methods=["get"], url_path="transactions")
    def transactions(self, request, pk=None):
        instance = self.get_object()
        qs = account_transactions_qs(instance.id)
        paginator = CreditTransactionPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = CreditTransactionSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=False, methods=["get"], url_path="linked-user-ids")
    def linked_user_ids(self, request):
        """Form modal: bağlı sistem kullanıcı ID'leri (hafif uç)."""
        qs = _credit_branch_filter_qs(
            CreditAccount.objects.filter(is_active=True, user__isnull=False),
            request,
        )
        ids = [str(uid) for uid in qs.values_list("user_id", flat=True).distinct()]
        return Response({"results": ids})

    @action(detail=False, methods=["get"], url_path="pos-available")
    def pos_available(self, request):
        """POS ödeme modalı: şubede kullanılabilir aktif hesaplar."""
        branch_id = (request.query_params.get("branch_id") or "").strip()
        if not branch_id:
            return Response({"detail": _("branch_id zorunludur.")}, status=status.HTTP_400_BAD_REQUEST)
        if not user_may_access_branch(request.user, branch_id):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        qs = annotate_account_balances(
            CreditAccount.objects.filter(is_active=True)
            .filter(Q(is_global=True) | Q(branch_id=branch_id))
            .select_related("user", "branch")
            .order_by("first_name", "last_name")
        )
        return Response({"results": CreditAccountSerializer(qs, many=True).data})
