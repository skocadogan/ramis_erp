import os
from datetime import datetime, time

from django.db.models import Q
from django.http import FileResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.translation import gettext as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rbac.drf import RBACPermission, RBACPermissionAll
from core.branch_scope import branch_filter_qs

from apps.invoices.models import Invoice
from apps.invoices.serializers import InvoiceSerializer, InvoiceCreateSerializer
from apps.invoices.services import InvoiceService, InvoiceError


class InvoiceListPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("branch", "sale").filter(is_active=True).order_by("-issued_at")
    serializer_class = InvoiceSerializer
    permission_classes = [RBACPermission]
    http_method_names = ["get", "post", "head", "options"]
    pagination_class = InvoiceListPagination

    def get_permissions(self):
        if self.action == "create":
            self.permission_codes = ["invoices.manage_invoice"]
            return [RBACPermissionAll()]
        if self.action == "download":
            self.permission_codes = ["invoices.view_invoice", "invoices.manage_invoice"]
            return [RBACPermission()]
        self.permission_codes = ["invoices.view_invoice", "invoices.manage_invoice"]
        return [RBACPermission()]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = branch_filter_qs(qs, self.request, field="branch_id")

        df = (self.request.query_params.get("date_from") or "").strip()
        if df:
            d = parse_date(df)
            if d:
                start = timezone.make_aware(datetime.combine(d, time.min))
                qs = qs.filter(issued_at__gte=start)

        dto = (self.request.query_params.get("date_to") or "").strip()
        if dto:
            d = parse_date(dto)
            if d:
                end = timezone.make_aware(datetime.combine(d, time.max))
                qs = qs.filter(issued_at__lte=end)

        hp = (self.request.query_params.get("has_pdf") or "").strip().lower()
        if hp in ("1", "true", "yes"):
            qs = qs.filter(pdf_file__isnull=False)
        elif hp in ("0", "false", "no"):
            qs = qs.filter(pdf_file__isnull=True)

        q = (self.request.query_params.get("search") or "").strip()
        if q:
            qs = qs.filter(Q(invoice_number__icontains=q) | Q(customer_name__icontains=q))

        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return InvoiceCreateSerializer
        return InvoiceSerializer

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            inv = InvoiceService.create_invoice(
                sale_id=str(ser.validated_data["sale_id"]),
                customer_info={
                    "customer_name": ser.validated_data.get("customer_name", ""),
                    "customer_tax_id": ser.validated_data.get("customer_tax_id", ""),
                    "customer_address": ser.validated_data.get("customer_address", ""),
                },
                user=request.user,
            )
        except InvoiceError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        out = InvoiceSerializer(inv, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        inv = self.get_object()
        if not inv.pdf_file:
            return Response({"detail": _("PDF bulunamadı.")}, status=status.HTTP_404_NOT_FOUND)
        path = inv.pdf_file.path
        if not os.path.isfile(path):
            return Response({"detail": _("PDF dosyası eksik.")}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(
            open(path, "rb"),
            as_attachment=True,
            filename=f"{inv.invoice_number}.pdf",
        )
