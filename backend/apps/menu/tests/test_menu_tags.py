"""Menü etiketleri: şube bazlı model, filtre ve aktivasyon testleri."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch
from apps.menu.models import Category, MenuTag, Product
from apps.menu.menu_tag_service import (
    activate_catalog_tag,
    catalog_settings_payload,
    filter_products_by_active_tag,
    should_apply_tag_filter,
)

User = get_user_model()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Etiket Şubesi', code='MTG')


@pytest.fixture
def other_branch(db):
    return Branch.objects.create(name='Diğer Şube', code='MTG2')


@pytest.fixture
def category(db):
    return Category.objects.create(name='İçecekler', order=1)


@pytest.fixture
def summer_tag(db, branch):
    return MenuTag.objects.create(name='#yaz_menusu', branch=branch)


@pytest.fixture
def product(db, category, branch):
    p = Product.objects.create(
        category=category,
        name='Limonata',
        base_price=Decimal('50.00'),
    )
    p.branches.add(branch)
    return p


@pytest.fixture
def menu_manager(db, branch):
    cat = PermissionCategory.objects.get_or_create(code='menu', defaults={'name': 'Menü'})[0]
    role = Role.objects.create(name='Menü Etiket Yönetici')
    for code, name in [
        ('menu.view_product', 'Ürün Gör'),
        ('menu.manage_product', 'Ürün Yönet'),
        ('menu.view_category', 'Kategori Gör'),
        ('menu.manage_category', 'Kategori Yönet'),
    ]:
        perm, _ = RolePermission.objects.get_or_create(
            code=code,
            defaults={'name': name, 'category': cat},
        )
        role.permissions.add(perm)
    user = User.objects.create_user(
        username='menutagmgr',
        password='pw',
        email='menutag@test.com',
        branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.mark.django_db
class TestMenuTags:
    def test_create_tag_normalizes_hash(self, summer_tag):
        assert summer_tag.name == '#yaz_menusu'

    def test_same_name_different_branches(self, branch, other_branch):
        MenuTag.objects.create(name='#yaz_menusu', branch=branch)
        tag2 = MenuTag.objects.create(name='#yaz_menusu', branch=other_branch)
        assert tag2.name == '#yaz_menusu'

    def test_product_tag_assignment(self, product, summer_tag, menu_manager):
        product.tags.add(summer_tag)
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        resp = client.get('/api/v1/menu/products/', {'apply_tag_filter': '0'})
        assert resp.status_code == 200
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        row = next(p for p in rows if p['id'] == str(product.id))
        assert len(row['tags']) == 1
        assert row['tags'][0]['name'] == '#yaz_menusu'

    def test_activate_tag_filters_products_per_branch(self, product, summer_tag, branch):
        product.tags.add(summer_tag)
        other = Product.objects.create(
            category=product.category,
            name='Kola',
            base_price=Decimal('40.00'),
        )
        activate_catalog_tag(branch_id=branch.id, tag_id=summer_tag.id)
        assert should_apply_tag_filter(branch.id) is True
        assert should_apply_tag_filter(None) is False

        qs = filter_products_by_active_tag(Product.objects.filter(is_active=True), branch.id)
        ids = set(str(i) for i in qs.values_list('id', flat=True))
        assert str(product.id) in ids
        assert str(other.id) not in ids

    def test_no_tags_means_no_filter(self, product, branch):
        assert should_apply_tag_filter(branch.id) is False
        qs = filter_products_by_active_tag(Product.objects.all(), branch.id)
        assert qs.count() == Product.objects.count()

    def test_untagged_filter(self, product, summer_tag, branch):
        tagged = product
        tagged.tags.add(summer_tag)
        untagged = Product.objects.create(
            category=product.category,
            name='Su',
            base_price=Decimal('10.00'),
        )
        activate_catalog_tag(branch_id=branch.id, filter_untagged=True)
        qs = filter_products_by_active_tag(Product.objects.filter(is_active=True), branch.id)
        ids = set(str(i) for i in qs.values_list('id', flat=True))
        assert str(untagged.id) in ids
        assert str(tagged.id) not in ids

    def test_category_tag_does_not_include_untagged_products(self, category, product, summer_tag, branch):
        """Kategori etiketi, etiketsiz alt ürünleri POS'a dahil etmemeli."""
        category.tags.add(summer_tag)
        activate_catalog_tag(branch_id=branch.id, tag_id=summer_tag.id)
        qs = filter_products_by_active_tag(Product.objects.filter(is_active=True), branch.id)
        assert not qs.filter(id=product.id).exists()

    def test_category_and_product_tag_includes_product(self, category, product, summer_tag, branch):
        category.tags.add(summer_tag)
        product.tags.add(summer_tag)
        activate_catalog_tag(branch_id=branch.id, tag_id=summer_tag.id)
        qs = filter_products_by_active_tag(Product.objects.filter(is_active=True), branch.id)
        assert qs.filter(id=product.id).exists()

    def test_activate_endpoint_requires_branch(self, product, summer_tag, menu_manager, branch):
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        resp = client.post(
            '/api/v1/menu/catalog-settings/',
            {'tag_id': str(summer_tag.id), 'branch_id': str(branch.id)},
            format='json',
        )
        assert resp.status_code == 200
        assert resp.data['active_tag_id'] == str(summer_tag.id)
        payload = catalog_settings_payload(branch.id)
        assert payload['active_tag_id'] == str(summer_tag.id)

    def test_create_tag_api(self, menu_manager, branch):
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        resp = client.post(
            '/api/v1/menu/tags/',
            {'name': 'kis_menusu', 'branch': str(branch.id)},
            format='json',
        )
        assert resp.status_code == 201
        assert resp.data['name'] == '#kis_menusu'
        assert str(resp.data['branch']) == str(branch.id)

    def test_list_tags_filtered_by_branch(self, menu_manager, branch, other_branch):
        MenuTag.objects.create(name='#a', branch=branch)
        MenuTag.objects.create(name='#b', branch=other_branch)
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        resp = client.get('/api/v1/menu/tags/', {'branch_id': str(branch.id)})
        assert resp.status_code == 200
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        assert len(rows) == 1
        assert rows[0]['name'] == '#a'

    def test_delete_tag_removes_from_product_and_category(self, menu_manager, branch, category, product, summer_tag):
        category.tags.add(summer_tag)
        product.tags.add(summer_tag)
        activate_catalog_tag(branch_id=branch.id, tag_id=summer_tag.id)
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        resp = client.delete(f'/api/v1/menu/tags/{summer_tag.id}/')
        assert resp.status_code == 204

        prod_resp = client.get('/api/v1/menu/products/', {'apply_tag_filter': '0'})
        rows = prod_resp.data['results'] if isinstance(prod_resp.data, dict) else prod_resp.data
        row = next(p for p in rows if p['id'] == str(product.id))
        assert row['tags'] == []

        cat_resp = client.get('/api/v1/menu/categories/', {'apply_tag_filter': '0'})
        cats = cat_resp.data['results'] if isinstance(cat_resp.data, dict) else cat_resp.data
        cat_row = next(c for c in cats if c['id'] == str(category.id))
        assert cat_row['tags'] == []

        payload = catalog_settings_payload(branch.id)
        assert payload['active_tag_id'] is None
