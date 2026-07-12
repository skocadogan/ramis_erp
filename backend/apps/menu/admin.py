from django.contrib import admin
from .models import Category, Product, ProductVariant, ModifierGroup, Modifier, ProductUnit


class ProductUnitInline(admin.TabularInline):
    model = ProductUnit
    extra = 0
    fields = ['name', 'multiplier', 'price_override', 'order']


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1


class ModifierInline(admin.TabularInline):
    model = Modifier
    extra = 1


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'order', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name']
    ordering = ['order', 'name']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'gross_price', 'tax_rate', 'base_price', 'is_active', 'is_featured', 'created_at']
    list_filter = ['category', 'is_active', 'is_featured']
    search_fields = ['name']
    inlines = [ProductUnitInline, ProductVariantInline]


@admin.register(ModifierGroup)
class ModifierGroupAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_multiple', 'is_required', 'is_active']
    list_filter = ['is_multiple', 'is_required']
    search_fields = ['name']
    filter_horizontal = ['products']
    inlines = [ModifierInline]
