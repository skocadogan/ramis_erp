from django.contrib import admin
from .models import Sale, SalePayment


class SalePaymentInline(admin.TabularInline):
    model = SalePayment
    extra = 0


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ['id', 'branch', 'table_name', 'payment_method', 'total_amount', 'fiscal_printed', 'created_by', 'paid_at']
    list_filter = ['payment_method', 'branch', 'paid_at', 'fiscal_printed']
    search_fields = ['order__table__name', 'created_by__username', 'okc_serial_number', 'okc_receipt_number']
    readonly_fields = ['id', 'paid_at', 'created_at', 'updated_at', 'fiscal_printed', 'okc_serial_number', 'okc_receipt_number', 'okc_z_number', 'okc_receipt_datetime', 'fiscal_qr_code', 'fiscal_raw_response']
    inlines = [SalePaymentInline]
    
    fieldsets = (
        (None, {
            'fields': ('branch', 'order', 'shift', 'pos_terminal', 'payment_method', 'total_amount', 'paid_at', 'notes')
        }),
        ('Mali Detaylar (ÖKC / Fatura)', {
            'fields': ('fiscal_printed', 'okc_serial_number', 'okc_receipt_number', 'okc_z_number', 'okc_receipt_datetime', 'fiscal_qr_code', 'fiscal_raw_response')
        }),
        ('İndirim & İptal Bilgileri', {
            'fields': ('discount_amount', 'discount_type', 'discount_applied_by', 'return_reason_code', 'return_reason_text', 'return_flow')
        }),
    )

    def table_name(self, obj):
        return obj.order.table.name if obj.order and obj.order.table else '-'
    table_name.short_description = 'Masa'
