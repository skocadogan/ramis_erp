from django.db.models import QuerySet, Prefetch, Sum, F, ExpressionWrapper, DecimalField
from django.db.models.functions import Coalesce

from .models import Recipe, RecipeIngredient, RecipeCategory


def get_active_recipe_categories() -> QuerySet[RecipeCategory]:
    """Aktif reçete kategorilerini getirir."""
    return RecipeCategory.objects.filter(is_active=True).select_related('parent').order_by('name', 'id')


def get_active_recipes() -> QuerySet[Recipe]:
    """Aktif reçeteleri getirir."""
    from apps.orders.models import ProductStationTimingStats

    return (
        Recipe.objects.filter(is_active=True)
        .select_related('product', 'product__category', 'category')
        .prefetch_related(
            Prefetch(
                'ingredients',
                queryset=RecipeIngredient.objects.select_related(
                    'stock_item', 'sub_recipe',
                ).prefetch_related(
                    # PERF: allerjen N+1 önleme — her malzeme için ayrı
                    # allerjen sorgusu yerine tüm allerjenler tek seferde çekilir.
                    'stock_item__allergens',
                ),
            ),
            # PERF: ProductStationTimingStats N+1 önleme — her reçete için
            # ayrı DB sorgusu yerine tüm ürünlerin istasyon süre istatistikleri
            # tek seferde çekilir. Serializer'da get_learned_timing cache'den okur.
            Prefetch(
                'product__station_timing_stats',
                queryset=ProductStationTimingStats.objects.select_related('branch', 'station'),
                to_attr='_prefetched_timing_stats',
            ),
        )
        .order_by('name', 'id')
    )


def get_recipes_with_cost(queryset: QuerySet[Recipe]) -> QuerySet[Recipe]:
    """
    PERF-1: Reçetelere toplam_maliyet annotation ekler.

    Her reçete için ayrı DB sorgusu (N+1) yerine tek JOIN ile hesaplar.
    Serializer'da `total_cost` alanı önce bu annotation'ı kontrol etmeli;
    mevcut model property fallback olarak kalır.
    """
    return queryset.annotate(
        total_cost_db=Coalesce(
            Sum(
                ExpressionWrapper(
                    F('ingredients__normalized_quantity') * F('ingredients__stock_item__last_purchase_price'),
                    output_field=DecimalField(max_digits=14, decimal_places=4),
                )
            ),
            0,
            output_field=DecimalField(max_digits=14, decimal_places=4),
        )
    ).order_by('name', 'id')


def get_recipe_by_product(product_id) -> Recipe | None:
    """Ürüne ait reçeteyi getirir."""
    try:
        return Recipe.objects.select_related('product').prefetch_related(
            Prefetch(
                'ingredients',
                queryset=RecipeIngredient.objects.select_related('stock_item', 'sub_recipe'),
            ),
        ).get(product_id=product_id, is_active=True)
    except Recipe.DoesNotExist:
        return None


def get_recipes_without_ingredients() -> QuerySet[Recipe]:
    """Malzemesi olmayan reçeteleri getirir (eksik reçeteler)."""
    return Recipe.objects.filter(is_active=True, ingredients__isnull=True).select_related('product')


def get_recipe(recipe_id: str) -> Recipe | None:
    """ID ile reçete detaylarını malzemeleriyle birlikte getirir."""
    try:
        return Recipe.objects.select_related(
            'product', 'product__category'
        ).prefetch_related(
            Prefetch(
                'ingredients',
                queryset=RecipeIngredient.objects.select_related('stock_item', 'sub_recipe'),
            ),
        ).get(id=recipe_id, is_active=True)
    except (Recipe.DoesNotExist, ValueError):
        return None
