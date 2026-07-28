"""Ürün soft-delete reçete kapsamını bozmamalı (orphan global reçete sızıntısı)."""
from decimal import Decimal

import pytest

from apps.menu.models import Category, Product
from apps.recipes.models import Recipe


@pytest.fixture
def product_with_recipe(db):
    category = Category.objects.create(name='Test Cat')
    product = Product.objects.create(
        category=category,
        name='Test Ürün',
        base_price=Decimal('10.00'),
    )
    recipe = Recipe.objects.create(product=product, name='Test Reçete', servings=1)
    return product, recipe


@pytest.mark.django_db
def test_soft_delete_keeps_recipe_product_link(product_with_recipe):
    product, recipe = product_with_recipe
    product.delete()
    product.refresh_from_db()
    recipe.refresh_from_db()
    assert product.is_active is False
    assert recipe.product_id == product.id


@pytest.mark.django_db
def test_hard_delete_unlinks_recipe(product_with_recipe):
    product, recipe = product_with_recipe
    product_id = product.id
    product.delete(hard=True)
    recipe.refresh_from_db()
    assert not Product.objects.filter(pk=product_id).exists()
    assert recipe.product_id is None
