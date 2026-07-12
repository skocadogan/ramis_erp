from django.contrib import admin
from .models import StockItem, StockMovement, Supplier


@admin.register(StockItem)
class StockItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'sku', 'unit', 'minimum_quantity', 'last_purchase_price', 'is_active']
    list_filter = ['unit', 'is_active']
    search_fields = ['name', 'sku', 'barcode']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ['stock_item', 'movement_type', 'quantity', 'warehouse', 'reference', 'performed_by', 'created_at']
    list_filter = ['movement_type', 'warehouse', 'created_at']
    search_fields = ['stock_item__name', 'reference']
    readonly_fields = ['id', 'created_at']


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['name', 'contact_person', 'phone', 'email', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name', 'contact_person']
    filter_horizontal = ['stock_items']
