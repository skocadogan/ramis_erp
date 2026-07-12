"""Reçete allerjen yeniden hesaplama ve stok kalemi cascade."""


from django.db import transaction

from .allergen_expansion import expand_recipe_allergen_ids
from .models import Recipe, RecipeIngredient


@transaction.atomic
def recalculate_recipe_allergens(recipe: Recipe) -> Recipe:
    """Reçetenin is_allergenic bayrağını ve allergens M2M alanını günceller."""
    allergen_ids = expand_recipe_allergen_ids(recipe)
    recipe.is_allergenic = bool(allergen_ids)
    recipe.save(update_fields=['is_allergenic', 'updated_at'])
    recipe.allergens.set(allergen_ids)
    return recipe


def recalculate_recipes_for_stock_item(stock_item_id) -> int:
    """
    Stok kalemi allerjenleri değiştiğinde doğrudan kullanan reçeteleri
    ve bu reçeteleri alt reçete olarak kullanan üst reçeteleri yeniden hesaplar.
    """
    direct_recipe_ids = set(
        RecipeIngredient.objects.filter(
            stock_item_id=stock_item_id,
            is_active=True,
        ).values_list('recipe_id', flat=True)
    )
    if not direct_recipe_ids:
        return 0

    affected: set = set()
    queue = list(direct_recipe_ids)
    while queue:
        rid = queue.pop()
        if rid in affected:
            continue
        affected.add(rid)
        parent_ids = RecipeIngredient.objects.filter(
            sub_recipe_id=rid,
            is_active=True,
        ).values_list('recipe_id', flat=True)
        for pid in parent_ids:
            if pid not in affected:
                queue.append(pid)

    count = 0
    for recipe_id in affected:
        recipe = Recipe.objects.filter(pk=recipe_id, is_active=True).first()
        if recipe:
            recalculate_recipe_allergens(recipe)
            count += 1
    return count
