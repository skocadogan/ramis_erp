from django.contrib import admin
from .models import Printer, PrintJob


@admin.register(Printer)
class PrinterAdmin(admin.ModelAdmin):
    list_display = ('name', 'branch', 'connection_type', 'ip_address', 'is_active')
    list_filter = ('branch', 'connection_type', 'is_active')
    search_fields = ('name', 'ip_address', 'device_path')
    fieldsets = (
        (None, {
            'fields': ('name', 'branch', 'printer_type', 'is_active')
        }),
        ('Bağlantı Ayarları', {
            'fields': ('connection_type', 'ip_address', 'port', 'device_path')
        }),
    )


@admin.register(PrintJob)
class PrintJobAdmin(admin.ModelAdmin):
    list_display = ('receipt_slug', 'printer', 'status', 'created_at', 'completed_at')
    list_filter = ('status', 'printer__branch')
    search_fields = ('receipt_slug', 'idempotency_key', 'printer__name')
    readonly_fields = ('printer', 'receipt_slug', 'context', 'status', 'error_message', 'idempotency_key', 'completed_at', 'created_at', 'updated_at')
