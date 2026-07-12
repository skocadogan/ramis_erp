"""Allerjen genişletme, reçete hesaplama ve stok cascade testleri."""

import pytest
from decimal import Decimal

from apps.inventory.models import Allergen, StockItem, StockUnit
from apps.menu.models import Category, Product, CombinedProductItem
from apps.menu.product_allergens import get_product_allergens, product_is_allergenic
from apps.recipes.allergen_expansion import expand_recipe_allergen_ids, get_recipe_allergens
from apps.recipes.allergen_service import recalculate_recipes_for_stock_item
from apps.recipes.services import RecipeService


@pytest.fixture
def category(db):
    return Category.objects.create(name='Ana Yemekler')


@pytest.fixture
def allergens(db):
    milk = Allergen.objects.create(
        code='ALG-MILK-01', name='İnek sütü', prevalence_pct=Decimal('2.50'), risk_score=9,
    )
    egg = Allergen.objects.create(
        code='ALG-EGG-01', name='Yumurta beyazı', prevalence_pct=Decimal('2.00'), risk_score=8,
    )
    shrimp = Allergen.objects.create(
        code='ALG-SHRIMP-01', name='Karides', prevalence_pct=Decimal('1.20'), risk_score=9,
    )
    return {'milk': milk, 'egg': egg, 'shrimp': shrimp}


@pytest.fixture
def stock_items(db, allergens):
    StockUnit.objects.get_or_create(
        short_name='g', defaults={'name': 'Gram', 'multiplier': Decimal('0.001')}
    )
    chicken = StockItem.objects.create(name='Tavuk göğüs', sku='CHK-001', unit='g')
    ketchup = StockItem.objects.create(name='Ketçap', sku='KET-001', unit='g')
    mayo = StockItem.objects.create(name='Mayonez', sku='MAY-001', unit='g')
    salt = StockItem.objects.create(name='Tuz', sku='SALT-001', unit='g')
    shrimp_sauce = StockItem.objects.create(name='Karides sosu', sku='SHR-SAUCE', unit='g')

    ketchup.allergens.add(allergens['egg'])
    mayo.allergens.add(allergens['milk'])
    shrimp_sauce.allergens.add(allergens['shrimp'])

    return {
        'chicken': chicken,
        'ketchup': ketchup,
        'mayo': mayo,
        'salt': salt,
        'shrimp_sauce': shrimp_sauce,
    }


@pytest.fixture
def soslu_tavuk_recipe(db, stock_items):
    return RecipeService.create_recipe(
        name='Soslu Tavuk Izgara',
        servings=1,
        ingredients_data=[
            {'stock_item_id': stock_items['chicken'].id, 'quantity': Decimal('100'), 'unit': 'g'},
            {'stock_item_id': stock_items['ketchup'].id, 'quantity': Decimal('10'), 'unit': 'g'},
            {'stock_item_id': stock_items['mayo'].id, 'quantity': Decimal('10'), 'unit': 'g'},
            {'stock_item_id': stock_items['salt'].id, 'quantity': Decimal('1'), 'unit': 'g'},
            {'stock_item_id': stock_items['shrimp_sauce'].id, 'quantity': Decimal('5'), 'unit': 'g'},
        ],
    )


@pytest.mark.django_db
class TestRecipeAllergens:
    def test_recipe_is_allergenic_on_create(self, soslu_tavuk_recipe, allergens):
        recipe = soslu_tavuk_recipe
        recipe.refresh_from_db()
        assert recipe.is_allergenic is True
        codes = set(recipe.allergens.values_list('code', flat=True))
        assert codes == {'ALG-EGG-01', 'ALG-MILK-01', 'ALG-SHRIMP-01'}

    def test_sub_recipe_inherits_allergens(self, db, stock_items, allergens):
        sub = RecipeService.create_recipe(
            name='Sos baz',
            servings=1,
            ingredients_data=[
                {'stock_item_id': stock_items['mayo'].id, 'quantity': Decimal('50'), 'unit': 'g'},
            ],
        )
        main = RecipeService.create_recipe(
            name='Ana yemek',
            servings=1,
            ingredients_data=[
                {'sub_recipe_id': sub.id, 'quantity': Decimal('50'), 'unit': 'g'},
            ],
        )
        main.refresh_from_db()
        assert main.is_allergenic is True
        assert allergens['milk'].id in expand_recipe_allergen_ids(main)

    def test_stock_allergen_change_cascades(self, soslu_tavuk_recipe, stock_items, allergens):
        chicken = stock_items['chicken']
        chicken.allergens.add(allergens['egg'])
        count = recalculate_recipes_for_stock_item(chicken.id)
        assert count >= 1
        soslu_tavuk_recipe.refresh_from_db()
        assert allergens['egg'].id in expand_recipe_allergen_ids(soslu_tavuk_recipe)

    def test_non_allergenic_recipe(self, db, stock_items):
        recipe = RecipeService.create_recipe(
            name='Sade tavuk',
            servings=1,
            ingredients_data=[
                {'stock_item_id': stock_items['chicken'].id, 'quantity': Decimal('100'), 'unit': 'g'},
                {'stock_item_id': stock_items['salt'].id, 'quantity': Decimal('1'), 'unit': 'g'},
            ],
        )
        recipe.refresh_from_db()
        assert recipe.is_allergenic is False
        assert list(get_recipe_allergens(recipe)) == []


@pytest.mark.django_db
class TestProductAllergens:
    def test_product_with_recipe(self, db, category, soslu_tavuk_recipe):
        product = Product.objects.create(
            category=category,
            name='Soslu Tavuk Izgara',
            base_price=Decimal('150.00'),
        )
        soslu_tavuk_recipe.product = product
        soslu_tavuk_recipe.save(update_fields=['product'])

        assert product_is_allergenic(product) is True
        allergen_names = {a.name for a in get_product_allergens(product)}
        assert 'İnek sütü' in allergen_names

    def test_product_without_recipe(self, db, category):
        product = Product.objects.create(
            category=category,
            name='Su',
            base_price=Decimal('10.00'),
        )
        assert product_is_allergenic(product) is False
        assert get_product_allergens(product) == []

    def test_combined_product_union(self, db, category, stock_items, allergens, soslu_tavuk_recipe):
        plain = Product.objects.create(
            category=category,
            name='Salata',
            base_price=Decimal('50.00'),
            is_combined=False,
        )
        RecipeService.create_recipe(
            name='Salata',
            product_id=plain.id,
            servings=1,
            ingredients_data=[
                {'stock_item_id': stock_items['chicken'].id, 'quantity': Decimal('50'), 'unit': 'g'},
            ],
        )

        combo = Product.objects.create(
            category=category,
            name='Menü',
            base_price=Decimal('200.00'),
            is_combined=True,
        )
        meal_product = Product.objects.create(
            category=category,
            name='Soslu Tavuk',
            base_price=Decimal('150.00'),
        )
        soslu_tavuk_recipe.product = meal_product
        soslu_tavuk_recipe.save(update_fields=['product'])
        CombinedProductItem.objects.create(parent_product=combo, product=meal_product, quantity=1)
        CombinedProductItem.objects.create(parent_product=combo, product=plain, quantity=1)

        assert product_is_allergenic(combo) is True
        allergen_codes = {a.code for a in get_product_allergens(combo)}
        assert 'ALG-MILK-01' in allergen_codes
