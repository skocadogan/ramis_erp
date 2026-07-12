"""StockItemService - Stok kalemi iş mantığı."""


from django.db import transaction

from apps.inventory.models import StockItem
from apps.recipes.allergen_service import recalculate_recipe_allergens
from apps.recipes.models import Recipe, RecipeIngredient


def _recalculate_recipes_after_ingredient_removal(recipe_ids: set) -> None:
    """Silinen malzeme satırlarından etkilenen reçeteleri (üst reçeteler dahil) günceller."""
    if not recipe_ids:
        return

    affected: set = set()
    queue = list(recipe_ids)
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

    for recipe_id in affected:
        recipe = Recipe.objects.filter(pk=recipe_id, is_active=True).first()
        if recipe:
            recalculate_recipe_allergens(recipe)


class StockItemService:
    """Stok kalemi iş mantığı."""

    @staticmethod
    @transaction.atomic
    def delete_stock_item(stock_item_id) -> dict:
        """Stok kalemini soft-delete eder; reçete malzemelerini de pasifleştirir."""
        item = StockItem.objects.select_for_update().get(id=stock_item_id, is_active=True)

        recipe_ids = set(
            RecipeIngredient.objects.filter(
                stock_item_id=stock_item_id,
                is_active=True,
            ).values_list('recipe_id', flat=True)
        )

        for ingredient in RecipeIngredient.objects.filter(
            stock_item_id=stock_item_id,
            is_active=True,
        ):
            ingredient.delete()

        _recalculate_recipes_after_ingredient_removal(recipe_ids)
        item.delete()

        return {'recipe_count': len(recipe_ids)}

    @staticmethod
    def get_recipe_usage_count(stock_item_id) -> int:
        return (
            RecipeIngredient.objects.filter(stock_item_id=stock_item_id, is_active=True)
            .values('recipe_id')
            .distinct()
            .count()
        )
