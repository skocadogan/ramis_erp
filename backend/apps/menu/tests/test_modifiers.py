"""Seçenek grupları (modifier) servis ve API testleri."""
import pytest
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch
from apps.menu.models import Category, Modifier, ModifierGroup, Product
from apps.menu.services import MenuService, MenuValidationError

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Test Şubesi', code='MNU')


@pytest.fixture
def rbac_cat(db):
    return PermissionCategory.objects.get_or_create(code='menu', defaults={'name': 'Menü'})[0]


@pytest.fixture
def category(db):
    return Category.objects.create(name='İçecek')


@pytest.fixture
def product(db, category):
    return Product.objects.create(
        category=category,
        name='Latte',
        base_price=Decimal('80.00'),
    )


@pytest.fixture
def modifier_group(db):
    return ModifierGroup.objects.create(
        name='Sos Tercihi',
        is_required=True,
        is_multiple=False,
    )


@pytest.fixture
def optional_group(db):
    return ModifierGroup.objects.create(
        name='Ekstra',
        is_required=False,
        is_multiple=True,
    )


@pytest.fixture
def product_with_modifiers(db, product, modifier_group, optional_group):
    mod_a = Modifier.objects.create(
        group=modifier_group,
        name='Ketçap',
        price_adjustment=Decimal('0.00'),
    )
    mod_b = Modifier.objects.create(
        group=optional_group,
        name='Ek Peynir',
        price_adjustment=Decimal('15.00'),
    )
    product.modifier_groups.add(modifier_group, optional_group)
    return product, mod_a, mod_b


class TestMenuServiceResolveModifiers:
    def test_required_group_missing_raises(self, product_with_modifiers):
        product, mod_a, mod_b = product_with_modifiers
        with pytest.raises(MenuValidationError):
            MenuService.resolve_order_item_modifiers(product.id, [mod_b.id])

    def test_valid_selection_returns_ids(self, product_with_modifiers):
        product, mod_a, mod_b = product_with_modifiers
        resolved = MenuService.resolve_order_item_modifiers(product.id, [mod_a.id, mod_b.id])
        assert len(resolved) == 2

    def test_invalid_modifier_raises(self, product_with_modifiers):
        product, mod_a, mod_b = product_with_modifiers
        other = Modifier.objects.create(
            group=ModifierGroup.objects.create(name='Başka'),
            name='Yabancı',
            price_adjustment=Decimal('1.00'),
        )
        with pytest.raises(MenuValidationError):
            MenuService.resolve_order_item_modifiers(product.id, [mod_a.id, other.id])

    def test_single_select_group_rejects_multiple(self, product_with_modifiers):
        product, mod_a, mod_b = product_with_modifiers
        mod_a2 = Modifier.objects.create(
            group=mod_a.group,
            name='Mayonez',
            price_adjustment=Decimal('0.00'),
        )
        with pytest.raises(MenuValidationError):
            MenuService.resolve_order_item_modifiers(product.id, [mod_a.id, mod_a2.id])


class TestModifierGroupApi:
    @pytest.fixture
    def menu_admin_client(self, api_client, branch, rbac_cat):
        role = Role.objects.create(name='Menü Admin')
        cat = rbac_cat
        for code, name in [
            ('menu.view_modifier_group', 'Grup Gör'),
            ('menu.manage_modifier_group', 'Grup Yönet'),
            ('menu.view_modifier', 'Seçenek Gör'),
            ('menu.manage_modifier', 'Seçenek Yönet'),
            ('menu.view_product', 'Ürün Gör'),
            ('menu.manage_product', 'Ürün Yönet'),
        ]:
            perm, _ = RolePermission.objects.get_or_create(
                code=code, defaults={'name': name, 'category': cat}
            )
            role.permissions.add(perm)
        user = User.objects.create_user(username='menuadmin', password='pw', branch=branch)
        user.roles.add(role)
        api_client.force_authenticate(user=user)
        return api_client

    def test_create_modifier_group(self, menu_admin_client, product):
        url = reverse('modifiergroup-list')
        resp = menu_admin_client.post(url, {
            'name': 'Boyut',
            'is_multiple': False,
            'is_required': False,
            'product_ids': [str(product.id)],
        }, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert ModifierGroup.objects.filter(name='Boyut', is_active=True).exists()

    def test_set_product_modifier_groups(self, menu_admin_client, product, modifier_group, branch):
        product.branches.add(branch)
        url = reverse('product-set-modifier-groups', kwargs={'pk': product.id})
        resp = menu_admin_client.post(url, {'group_ids': [str(modifier_group.id)]}, format='json')
        assert resp.status_code == status.HTTP_200_OK
        assert product.modifier_groups.filter(id=modifier_group.id).exists()
