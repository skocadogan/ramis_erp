"""Ürün etiketleri: is_popular ve is_chef_recommendation PATCH testleri."""

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
    return Branch.objects.create(name='Test Şubesi', code='TAG')


@pytest.fixture
def category(db):
    return Category.objects.create(name='Ana Yemek', order=1)


@pytest.fixture
def product(db, category, branch):
    p = Product.objects.create(
        category=category,
        name='Test Ürün',
        base_price=Decimal('100.00'),
    )
    p.branches.add(branch)
    return p


@pytest.fixture
def menu_manager(db, branch):
    cat = PermissionCategory.objects.get_or_create(code='menu', defaults={'name': 'Menü'})[0]
    role = Role.objects.create(name='Etiket Yönetici')
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
        username='tagmanager',
        password='pw',
        email='tag@test.com',
        branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.mark.django_db
class TestProductTags:
    def test_patch_is_popular(self, product, menu_manager):
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        url = f'/api/v1/menu/products/{product.id}/'

        resp = client.patch(url, {'is_popular': True}, format='json')
        assert resp.status_code == 200
        assert resp.data['is_popular'] is True

        product.refresh_from_db()
        assert product.is_popular is True

    def test_patch_is_chef_recommendation(self, product, menu_manager):
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        url = f'/api/v1/menu/products/{product.id}/'

        resp = client.patch(url, {'is_chef_recommendation': True}, format='json')
        assert resp.status_code == 200
        assert resp.data['is_chef_recommendation'] is True

        product.refresh_from_db()
        assert product.is_chef_recommendation is True

    def test_list_includes_tag_fields(self, product, menu_manager):
        product.is_popular = True
        product.is_chef_recommendation = True
        product.save(update_fields=['is_popular', 'is_chef_recommendation'])

        client = APIClient()
        client.force_authenticate(user=menu_manager)
        resp = client.get('/api/v1/menu/products/')
        assert resp.status_code == 200
        rows = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
        row = next(p for p in rows if p['id'] == str(product.id))
        assert row['is_popular'] is True
        assert row['is_chef_recommendation'] is True
