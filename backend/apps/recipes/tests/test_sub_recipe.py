"""Yarı mamül (alt reçete) maliyet, stok düşümü ve doğrulama testleri."""

import pytest
from core.decimal_constants import ZERO_QTY
from decimal import Decimal

from django.core.exceptions import ValidationError

from apps.menu.models import Category, Product
from apps.recipes.models import Recipe, RecipeIngredient
from apps.recipes.recipe_expansion import (
    build_stock_requirements_from_recipe,
    compute_recipe_total_cost,
    detect_recipe_cycle,
)
from apps.inventory.models import StockItem, StockUnit
from apps.inventory.services.cart_recipe_requirements import add_recipe_for_product
from apps.inventory.stock_minimum import ZERO_QTY
from collections import defaultdict


@pytest.fixture
def category(db):
    return Category.objects.create(name='Burgerler')


@pytest.fixture
def stock_items(db):
    StockUnit.objects.get_or_create(
        short_name='g', defaults={'name': 'Gram', 'multiplier': Decimal('0.001')}
    )
    StockUnit.objects.get_or_create(
        short_name='kg', defaults={'name': 'Kilogram', 'multiplier': Decimal('1')}
    )
    yogurt = StockItem.objects.create(
        name='Yoğurt', sku='YOG-001', unit='kg',
        last_purchase_price=Decimal('40.00'),
    )
    vinegar = StockItem.objects.create(
        name='Sirke', sku='VIN-001', unit='kg',
        last_purchase_price=Decimal('20.00'),
    )
    bun = StockItem.objects.create(
        name='Hamburger Ekmeği', sku='BUN-001', unit='g',
        last_purchase_price=Decimal('0.05'),
    )
    patty = StockItem.objects.create(
        name='Köfte', sku='PAT-001', unit='g',
        last_purchase_price=Decimal('0.10'),
    )
    return {'yogurt': yogurt, 'vinegar': vinegar, 'bun': bun, 'patty': patty}


@pytest.fixture
def ranch_recipe(db, stock_items):
    """100 hamburgerlik ranch sos partisi: toplam 1000 g (10 g × 100 porsiyon)."""
    recipe = Recipe.objects.create(
        name='Ranch Sos',
        servings=100,
        serving_quantity=Decimal('10'),
        serving_unit='g',
    )
    RecipeIngredient.objects.create(
        recipe=recipe,
        stock_item=stock_items['yogurt'],
        quantity=Decimal('0.500'),
        unit='kg',
    )
    RecipeIngredient.objects.create(
        recipe=recipe,
        stock_item=stock_items['vinegar'],
        quantity=Decimal('0.100'),
        unit='kg',
    )
    return recipe


@pytest.fixture
def burger_product(db, category, stock_items, ranch_recipe):
    product = Product.objects.create(
        category=category,
        name='Hamburger',
        base_price=Decimal('150.00'),
    )
    recipe = Recipe.objects.create(
        product=product,
        name='Hamburger Reçetesi',
        servings=10,
    )
    RecipeIngredient.objects.create(
        recipe=recipe,
        stock_item=stock_items['bun'],
        quantity=Decimal('80'),
        unit='g',
    )
    RecipeIngredient.objects.create(
        recipe=recipe,
        stock_item=stock_items['patty'],
        quantity=Decimal('150'),
        unit='g',
    )
    RecipeIngredient.objects.create(
        recipe=recipe,
        sub_recipe=ranch_recipe,
        quantity=Decimal('100'),
        unit='g',
    )
    return product


@pytest.mark.django_db
class TestSubRecipeCost:
    def test_sub_recipe_line_cost_scales_by_usage(self, ranch_recipe, burger_product, stock_items):
        burger_recipe = burger_product.recipe
        sub_line = burger_recipe.ingredients.get(sub_recipe=ranch_recipe)
        ranch_cost = compute_recipe_total_cost(ranch_recipe)
        # 100 g / 1000 g toplam verim × ranch maliyeti
        expected_ratio = Decimal('100') / Decimal('1000')
        assert sub_line.line_cost == (expected_ratio * ranch_cost).quantize(Decimal('0.01'))

    def test_burger_total_cost_includes_sub_recipe(self, burger_product, ranch_recipe):
        burger_recipe = burger_product.recipe
        direct = sum(
            ing.line_cost_stock()
            for ing in burger_recipe.ingredients.filter(stock_item__isnull=False)
        )
        sub_line = burger_recipe.ingredients.get(sub_recipe=ranch_recipe)
        assert burger_recipe.total_cost == direct + sub_line.line_cost


@pytest.mark.django_db
class TestSubRecipeStockDeduction:
    def test_single_burger_deducts_ranch_raw_materials(self, burger_product, stock_items):
        required = defaultdict(lambda: ZERO_QTY)
        add_recipe_for_product(burger_product, Decimal('1'), warehouse_id=1, required=required)

        yogurt_id = stock_items['yogurt'].id
        # 1 hamburger = 1/10 batch; ranch usage 100g/10 = 10g; scale 10/1000 = 0.01
        # yogurt 0.5 kg × 0.01 = 0.005 kg
        assert required[(1, yogurt_id)] == Decimal('0.005000')

        vinegar_id = stock_items['vinegar'].id
        assert required[(1, vinegar_id)] == Decimal('0.001000')

    def test_ten_burgers_full_batch(self, burger_product, stock_items):
        required = build_stock_requirements_from_recipe(
            burger_product.recipe, Decimal('10'), warehouse_id=5
        )
        yogurt_id = stock_items['yogurt'].id
        # Tam 10 porsiyon → ranch'in tamamı (100g ranch / batch)
        assert required[(5, yogurt_id)] == Decimal('0.050000')


@pytest.mark.django_db
class TestSubRecipeValidation:
    def test_cycle_detection(self, ranch_recipe, burger_product):
        burger_recipe = burger_product.recipe
        assert detect_recipe_cycle(burger_recipe.id, ranch_recipe.id) is False
        assert detect_recipe_cycle(ranch_recipe.id, burger_recipe.id) is True

    def test_self_reference_rejected(self, ranch_recipe):
        ing = RecipeIngredient(
            recipe=ranch_recipe,
            sub_recipe=ranch_recipe,
            quantity=Decimal('1'),
            unit='g',
        )
        with pytest.raises(ValidationError):
            ing.save()

    def test_xor_constraint(self, ranch_recipe, stock_items):
        ing = RecipeIngredient(
            recipe=ranch_recipe,
            stock_item=stock_items['yogurt'],
            sub_recipe=ranch_recipe,
            quantity=Decimal('1'),
            unit='g',
        )
        with pytest.raises(ValidationError):
            ing.save()
