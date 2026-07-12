from rest_framework import serializers

from apps.invoices.models import Invoice


class InvoiceSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    sale_id = serializers.UUIDField(read_only=True)
    pdf_url = serializers.SerializerMethodField()
    pdf_status = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "sale",
            "sale_id",
            "branch",
            "branch_name",
            "invoice_number",
            "customer_name",
            "customer_tax_id",
            "customer_address",
            "subtotal",
            "tax_amount",
            "tax_rate",
            "total_amount",
            "issued_at",
            "pdf_url",
            "pdf_status",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "invoice_number",
            "subtotal",
            "tax_amount",
            "tax_rate",
            "total_amount",
            "issued_at",
            "pdf_url",
            "pdf_status",
            "created_at",
            "branch_name",
            "sale_id",
        ]

    def get_pdf_url(self, obj):
        if not obj.pdf_file:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.pdf_file.url)
        return obj.pdf_file.url

    def get_pdf_status(self, obj):
        if obj.pdf_file:
            return "ready"
        from django.utils import timezone
        age = (timezone.now() - obj.created_at).total_seconds()
        if age < 300:
            return "pending"
        return "failed"


class InvoiceCreateSerializer(serializers.Serializer):
    sale_id = serializers.UUIDField()
    customer_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    customer_tax_id = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    customer_address = serializers.CharField(required=False, allow_blank=True, default="")
