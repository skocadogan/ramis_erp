from decimal import Decimal

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from .models import Recipe, RecipeIngredient, RecipeCategory
from apps.inventory.serializers import AllergenNestedSerializer


class RecipeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = RecipeCategory
        fields = ['id', 'name', 'code', 'parent']
        read_only_fields = ['id']


class RecipeIngredientSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True, default='')
    stock_item_sku = serializers.CharField(source='stock_item.sku', read_only=True, default='')
    stock_item_unit = serializers.CharField(source='stock_item.unit', read_only=True, default='')
    stock_item_allergens = serializers.SerializerMethodField()
    sub_recipe_name = serializers.CharField(source='sub_recipe.name', read_only=True, default='')
    ingredient_type = serializers.CharField(read_only=True)
    line_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    def get_stock_item_allergens(self, obj):
        if not obj.stock_item_id:
            return []
        # PERF: prefetch_related('stock_item__allergens') yapılmışsa
        # ORM bellekteki veriyi kullanır, ek DB sorgusu açmaz.
        allergens = obj.stock_item.allergens.filter(is_active=True).order_by('-risk_score', 'name')
        return AllergenNestedSerializer(allergens, many=True).data

    class Meta:
        model = RecipeIngredient
        fields = [
            'id', 'ingredient_type', 'stock_item', 'stock_item_name', 'stock_item_sku',
            'stock_item_unit', 'stock_item_allergens', 'sub_recipe', 'sub_recipe_name',
            'quantity', 'unit', 'notes', 'line_cost',
        ]
        read_only_fields = ['id']


class RecipeIngredientCreateSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField(required=False, allow_null=True)
    sub_recipe_id = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=6, min_value=Decimal('0.000001'))
    unit = serializers.CharField(max_length=20)
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        stock_id = attrs.get('stock_item_id')
        sub_id = attrs.get('sub_recipe_id')
        if bool(stock_id) == bool(sub_id):
            raise serializers.ValidationError(
                _('Malzeme satırı ya stok kalemi ya da alt reçete içermelidir.')
            )
        return attrs


class RecipeSerializer(serializers.ModelSerializer):
    ingredients = RecipeIngredientSerializer(many=True, read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    total_cost = serializers.SerializerMethodField()
    cost_per_serving = serializers.SerializerMethodField()
    learned_timing = serializers.SerializerMethodField()
    allergens = AllergenNestedSerializer(many=True, read_only=True)
    allergen_sources = serializers.SerializerMethodField()

    def get_allergen_sources(self, obj):
        from .allergen_expansion import get_recipe_allergen_sources
        sources = get_recipe_allergen_sources(obj)
        return [
            {
                'type': s['type'],
                'name': s['name'],
                'allergens': AllergenNestedSerializer(s['allergens'], many=True).data,
            }
            for s in sources
        ]

    def get_total_cost(self, obj):
        """
        Alt reçete içeren kayıtlarda annotation yetersiz kalır; property kullanılır.
        """
        ingredients = getattr(obj, '_prefetched_objects_cache', {}).get('ingredients')
        if ingredients is not None:
            has_sub = any(getattr(ing, 'sub_recipe_id', None) for ing in ingredients)
        else:
            has_sub = obj.ingredients.filter(sub_recipe_id__isnull=False).exists()
        if has_sub:
            return round(float(obj.total_cost), 2)
        val = getattr(obj, 'total_cost_db', None)
        if val is not None:
            return round(val, 2)
        return round(obj.total_cost, 2)

    def get_cost_per_serving(self, obj):
        servings = obj.servings or 1
        val = getattr(obj, 'total_cost_db', None)
        total = float(val) if val is not None else float(obj.total_cost)
        return round(total / servings, 2)

    def get_learned_timing(self, obj):
        """Ürün için istasyon bazlı öğrenilmiş hazırlık süreleri (Smart Firing v2).

        PERF: selectors.get_active_recipes() tarafından product__station_timing_stats
        prefetch edilir. Prefetch yoksa fallback olarak DB sorgusu yapılır.
        """
        if not obj.product_id:
            return []
        # Cache'den oku (Prefetch ile doldurulmuşsa)
        stats = getattr(obj.product, '_prefetched_timing_stats', None)
        if stats is None:
            from apps.orders.models import ProductStationTimingStats
            stats = ProductStationTimingStats.objects.filter(
                product_id=obj.product_id
            ).select_related('branch', 'station')

        return [
            {
                'branch_name': s.branch.name,
                'station_name': s.station.name,
                'ema_minutes': round(s.ema_minutes, 1),
                'sample_count': s.sample_count
            }
            for s in stats
        ]

    class Meta:
        model = Recipe
        fields = [
            'id', 'product', 'product_name', 'category', 'category_name',
            'name', 'description',
            'servings', 'serving_quantity', 'serving_unit', 
            'prep_time_minutes', 'cook_time_minutes',
            'prep_time_per_serving', 'cook_time_per_serving',
            'instructions', 'branches', 'ingredients', 'total_cost', 'cost_per_serving',
            'learned_timing', 'is_allergenic', 'allergens', 'allergen_sources',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class RecipeCreateSerializer(serializers.Serializer):
    product_id = serializers.UUIDField(required=False, allow_null=True)
    category_id = serializers.UUIDField(required=False, allow_null=True)
    name = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    servings = serializers.IntegerField(min_value=1, default=1)
    serving_quantity = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, allow_null=True)
    serving_unit = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    prep_time_minutes = serializers.IntegerField(min_value=0, default=0)
    cook_time_minutes = serializers.IntegerField(min_value=0, default=0)
    prep_time_per_serving = serializers.IntegerField(min_value=0, default=0)
    cook_time_per_serving = serializers.IntegerField(min_value=0, default=0)
    instructions = serializers.CharField(required=False, allow_blank=True, default='')
    branches = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )
    ingredients = RecipeIngredientCreateSerializer(many=True, required=False, default=[])
