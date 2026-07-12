"""Menü ürünü kalori (kCal) alanı API testleri."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch
from apps.menu.models import Category, Product

User = get_user_model()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Kalori Şubesi', code='KCAL')


@pytest.fixture
def category(db):
    return Category.objects.create(name='Salatalar', order=1)


@pytest.fixture
def product(db, category, branch):
    p = Product.objects.create(
        category=category,
        name='Sezar Salata',
        base_price=Decimal('150.00'),
        calories=420,
    )
    p.branches.add(branch)
    return p


@pytest.fixture
def menu_manager(db, branch):
    cat = PermissionCategory.objects.get_or_create(code='menu', defaults={'name': 'Menü'})[0]
    role = Role.objects.create(name='Kalori Yönetici')
    for code, name in [
        ('menu.view_product', 'Ürün Gör'),
        ('menu.manage_product', 'Ürün Yönet'),
    ]:
        perm, _ = RolePermission.objects.get_or_create(
            code=code,
            defaults={'name': name, 'category': cat},
        )
        role.permissions.add(perm)
    user = User.objects.create_user(
        username='caloriemanager',
        password='pw',
        email='kcal@test.com',
        branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.mark.django_db
class TestProductCalories:
    def test_get_product_includes_calories(self, product, menu_manager):
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        url = f'/api/v1/menu/products/{product.id}/'

        resp = client.get(url)
        assert resp.status_code == 200
        assert resp.data['calories'] == 420

    def test_patch_calories(self, product, menu_manager):
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        url = f'/api/v1/menu/products/{product.id}/'

        resp = client.patch(url, {'calories': 350}, format='json')
        assert resp.status_code == 200
        assert resp.data['calories'] == 350

        product.refresh_from_db()
        assert product.calories == 350

    def test_patch_clear_calories(self, product, menu_manager):
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        url = f'/api/v1/menu/products/{product.id}/'

        resp = client.patch(url, {'calories': None}, format='json')
        assert resp.status_code == 200
        assert resp.data['calories'] is None

        product.refresh_from_db()
        assert product.calories is None
