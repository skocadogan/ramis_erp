from django.contrib import admin
from .models import (
    Warehouse,
    WarehouseStockLevel,
    PurchaseOrder,
    PurchaseOrderItem,
    GoodsReceiving,
    GoodsReceivingItem,
    WarehouseTransfer,
    WarehouseTransferItem,
    StockCounting,
    StockCountingItem,
)


class WarehouseStockLevelInline(admin.TabularInline):
    model = WarehouseStockLevel
    extra = 0
    readonly_fields = ['stock_item', 'quantity', 'minimum_quantity']


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'warehouse_type', 'display_branches', 'manager', 'is_default', 'is_active']
    list_filter = ['warehouse_type', 'branches', 'is_default', 'is_active']
    search_fields = ['name', 'code']
    inlines = [WarehouseStockLevelInline]

    def display_branches(self, obj):
        return ", ".join([b.name for b in obj.branches.all()])
    display_branches.short_description = 'Şubeler'


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    readonly_fields = ['received_quantity']


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ['order_number', 'supplier', 'warehouse', 'status', 'order_date', 'total_amount']
    list_filter = ['status', 'warehouse']
    search_fields = ['order_number', 'supplier__name']
    readonly_fields = ['order_number', 'total_amount']
    inlines = [PurchaseOrderItemInline]


class GoodsReceivingItemInline(admin.TabularInline):
    model = GoodsReceivingItem
    extra = 0


@admin.register(GoodsReceiving)
class GoodsReceivingAdmin(admin.ModelAdmin):
    list_display = ['receiving_number', 'supplier', 'warehouse', 'status', 'received_date', 'total_amount']
    list_filter = ['status', 'warehouse']
    search_fields = ['receiving_number', 'supplier__name', 'invoice_number']
    readonly_fields = ['receiving_number', 'total_amount']
    inlines = [GoodsReceivingItemInline]


class WarehouseTransferItemInline(admin.TabularInline):
    model = WarehouseTransferItem
    extra = 0


@admin.register(WarehouseTransfer)
class WarehouseTransferAdmin(admin.ModelAdmin):
    list_display = ['transfer_number', 'source_warehouse', 'target_warehouse', 'status', 'transfer_date']
    list_filter = ['status']
    search_fields = ['transfer_number']
    readonly_fields = ['transfer_number']
    inlines = [WarehouseTransferItemInline]


class StockCountingItemInline(admin.TabularInline):
    model = StockCountingItem
    extra = 0
    readonly_fields = ['difference']


@admin.register(StockCounting)
class StockCountingAdmin(admin.ModelAdmin):
    list_display = ['counting_number', 'warehouse', 'status', 'counting_date', 'counted_by']
    list_filter = ['status', 'warehouse']
    search_fields = ['counting_number']
    readonly_fields = ['counting_number']
    inlines = [StockCountingItemInline]
