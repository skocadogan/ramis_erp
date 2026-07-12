from django.contrib import admin

from apps.invoices.models import Invoice


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("invoice_number", "branch", "total_amount", "issued_at")
    search_fields = ("invoice_number", "customer_name", "customer_tax_id")
    list_filter = ("branch",)
