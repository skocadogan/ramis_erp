from django.contrib import admin
from .models import Order, OrderItem, OrderItemModifier


class OrderItemModifierInline(admin.TabularInline):
    model = OrderItemModifier
    extra = 0
    readonly_fields = ('modifier', 'price')


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('product', 'variant', 'quantity', 'unit_price', 'total_price', 'status', 'station')
    inlines = [OrderItemModifierInline]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'branch', 'table', 'status', 'order_type', 'total_amount', 'discount_amount', 'user', 'created_at')
    list_filter = ('status', 'order_type', 'branch')
    search_fields = ('id', 'user__username', 'table__table_number')
    readonly_fields = ('id', 'created_at', 'updated_at', 'discount_by')
    inlines = [OrderItemInline]
    date_hierarchy = 'created_at'


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'product', 'quantity', 'unit_price', 'total_price', 'status', 'station')
    list_filter = ('status', 'station')
    search_fields = ('product__name', 'order__id')
    readonly_fields = ('id', 'created_at', 'updated_at')
