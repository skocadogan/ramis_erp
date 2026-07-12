"""Menü ürünü allerjen bilgisi — reçete ve birleşik ürün birleşimi."""


from django.core.exceptions import ObjectDoesNotExist

from apps.recipes.allergen_expansion import get_recipe_allergens


def get_product_allergens(product):
    """
    Ürünün allerjen listesini döndürür.
    Reçetesiz ürünler: boş liste.
    Birleşik ürünler: alt ürünlerin allerjen birleşimi.
    """
    if not product or not getattr(product, 'is_active', True):
        return []

    if getattr(product, 'is_combined', False):
        allergen_map = {}
        combined_items = getattr(product, '_prefetched_objects_cache', {}).get('combined_items')
        if combined_items is None:
            combined_items = product.combined_items.filter(is_active=True).select_related('product')
        for item in combined_items:
            child = item.product
            if not child or not child.is_active:
                continue
            for allergen in get_product_allergens_direct(child):
                allergen_map[allergen.id] = allergen
        return sorted(allergen_map.values(), key=lambda a: (-a.risk_score, a.name))

    return get_product_allergens_direct(product)


def get_product_allergens_direct(product) -> list:
    """Tek ürün — bağlı reçeteden allerjenler."""
    try:
        recipe = product.recipe
    except ObjectDoesNotExist:
        return []
    if not recipe or not recipe.is_active:
        return []

    prefetched = getattr(recipe, '_prefetched_objects_cache', {}).get('allergens')
    if prefetched is not None:
        return [a for a in prefetched if a.is_active]

    if recipe.is_allergenic:
        return list(get_recipe_allergens(recipe))

    return []


def product_is_allergenic(product) -> bool:
    return bool(get_product_allergens(product))
