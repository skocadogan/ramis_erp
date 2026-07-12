import pytest
from decimal import Decimal

from apps.inventory.models import StockItem
from apps.inventory.services import StockItemService
from apps.recipes.models import Recipe, RecipeIngredient


@pytest.mark.django_db
class TestStockItemServiceDelete:
    def test_soft_delete_stock_item_without_recipes(self, stock_item):
        StockItemService.delete_stock_item(stock_item.id)

        stock_item.refresh_from_db()
        assert stock_item.is_active is False

    def test_soft_delete_removes_recipe_ingredients(self, stock_item):
        recipe = Recipe.objects.create(name="Pizza Reçetesi")
        ingredient = RecipeIngredient.objects.create(
            recipe=recipe,
            stock_item=stock_item,
            quantity=Decimal("1.000000"),
            unit="kg",
        )

        result = StockItemService.delete_stock_item(stock_item.id)

        assert result["recipe_count"] == 1
        stock_item.refresh_from_db()
        ingredient.refresh_from_db()
        assert stock_item.is_active is False
        assert ingredient.is_active is False

    def test_get_recipe_usage_count(self, stock_item):
        recipe = Recipe.objects.create(name="Salata Reçetesi")
        RecipeIngredient.objects.create(
            recipe=recipe,
            stock_item=stock_item,
            quantity=Decimal("0.500000"),
            unit="kg",
        )

        assert StockItemService.get_recipe_usage_count(stock_item.id) == 1
