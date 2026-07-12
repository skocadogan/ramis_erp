from django.contrib import admin
from .models import Recipe, RecipeIngredient


class RecipeIngredientInline(admin.TabularInline):
    model = RecipeIngredient
    fk_name = 'recipe'
    extra = 1
    fields = ['stock_item', 'sub_recipe', 'quantity', 'unit', 'normalized_quantity', 'notes']
    readonly_fields = ['normalized_quantity']


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ['name', 'product', 'servings', 'prep_time_minutes', 'cook_time_minutes', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name', 'product__name']
    inlines = [RecipeIngredientInline]
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(RecipeIngredient)
class RecipeIngredientAdmin(admin.ModelAdmin):
    list_display = ['recipe', 'stock_item', 'sub_recipe', 'quantity', 'unit']
    list_filter = ['recipe']
    search_fields = ['stock_item__name', 'sub_recipe__name', 'recipe__name']
