import pytest
from decimal import Decimal
from apps.recipes.models import Recipe, RecipeIngredient
from apps.menu.models import Category, Product
from apps.inventory.models import StockItem, StockUnit


@pytest.fixture
def category(db):
    return Category.objects.create(name='Ana Yemekler')


@pytest.fixture
def product(db, category):
    return Product.objects.create(
        category=category,
        name='Adana Kebap',
        base_price=Decimal('180.00'),
    )


@pytest.fixture
def stock_items(db):
    un = StockItem.objects.create(
        name='Un', sku='UN-001', unit='kg',
        last_purchase_price=Decimal('25.00'),
    )
    et = StockItem.objects.create(
        name='Dana Eti', sku='ET-001', unit='kg',
        last_purchase_price=Decimal('350.00'),
    )
    return un, et


@pytest.fixture
def recipe(db, product):
    return Recipe.objects.create(
        product=product,
        name='Adana Kebap Reçetesi',
        servings=1,
        prep_time_minutes=20,
        cook_time_minutes=15,
    )


@pytest.mark.django_db
class TestRecipeModel:
    def test_create_recipe(self, recipe, product):
        assert recipe.name == 'Adana Kebap Reçetesi'
        assert recipe.product == product
        assert 'Adana Kebap' in str(recipe)

    def test_total_cost(self, recipe, stock_items):
        un, et = stock_items
        RecipeIngredient.objects.create(
            recipe=recipe, stock_item=et,
            quantity=Decimal('0.250'), unit='kg',
        )
        expected = Decimal('0.250') * et.last_purchase_price
        assert recipe.total_cost == expected

    def test_cost_per_serving(self, recipe, stock_items):
        un, et = stock_items
        RecipeIngredient.objects.create(
            recipe=recipe, stock_item=et,
            quantity=Decimal('0.250'), unit='kg',
        )
        assert recipe.cost_per_serving == recipe.total_cost


@pytest.mark.django_db
class TestRecipeIngredientModel:
    def test_create_ingredient(self, recipe, stock_items):
        _, et = stock_items
        ingredient = RecipeIngredient.objects.create(
            recipe=recipe, stock_item=et,
            quantity=Decimal('0.250'), unit='kg',
            notes='Orta yağlı',
        )
        assert ingredient.line_cost == Decimal('0.250') * et.last_purchase_price
        assert 'Dana Eti' in str(ingredient)

    def test_line_cost_uses_unit_conversion_g_to_kg(self, recipe, db):
        StockUnit.objects.get_or_create(
            short_name='kg', defaults={'name': 'Kilogram', 'multiplier': Decimal('1')}
        )
        StockUnit.objects.get_or_create(
            short_name='g', defaults={'name': 'Gram', 'multiplier': Decimal('0.001')}
        )
        et = StockItem.objects.create(
            name='Dana Eti',
            sku='ET-G-001',
            unit='kg',
            last_purchase_price=Decimal('350.00'),
        )
        ingredient = RecipeIngredient.objects.create(
            recipe=recipe,
            stock_item=et,
            quantity=Decimal('500'),
            unit='g',
        )
        assert ingredient.normalized_quantity == Decimal('0.500')
        assert ingredient.line_cost == Decimal('175.00')
