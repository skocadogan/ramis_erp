"""Menü ürünü yanında önerilen ürünler API testleri."""
import pytest
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from rbac.models import Role, RolePermission, PermissionCategory
from apps.menu.models import Category, Product, ProductUnit, ProductRecommendation

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def category(db):
    return Category.objects.create(name='Ana Yemek')


@pytest.fixture
def source_product(db, category):
    return Product.objects.create(
        category=category,
        name='Bonfile',
        base_price=Decimal('450.00'),
        show_on_pos=True,
    )


@pytest.fixture
def wine_product(db, category):
    p = Product.objects.create(
        category=category,
        name='Kırmızı Şarap',
        base_price=Decimal('180.00'),
        show_on_pos=True,
    )
    ProductUnit.objects.create(
        product=p,
        name='Kadeh',
        multiplier=Decimal('1'),
        price_override=Decimal('90.00'),
        order=0,
    )
    return p


@pytest.fixture
def menu_manager(db):
    cat = PermissionCategory.objects.get_or_create(code='menu', defaults={'name': 'Menü'})[0]
    role = Role.objects.create(name='MenuRecManager')
    for code, name in [
        ('menu.view_product', 'Ürün Gör'),
        ('menu.manage_product', 'Ürün Yönet'),
    ]:
        perm = RolePermission.objects.get_or_create(
            code=code,
            defaults={'name': name, 'category': cat},
        )[0]
        role.permissions.add(perm)
    user = User.objects.create_user(username='menu_rec_user', password='test-pass-123')
    user.is_superuser = True
    user.save(update_fields=['is_superuser'])
    user.roles.add(role)
    return user


@pytest.mark.django_db
class TestProductRecommendations:
    def test_sync_and_list_recommendations(self, api_client, menu_manager, source_product, wine_product):
        api_client.force_authenticate(user=menu_manager)
        url = reverse('product-recommendations', kwargs={'pk': source_product.pk})
        unit = wine_product.units.first()

        res = api_client.put(url, {
            'items': [{
                'recommended_product_id': str(wine_product.id),
                'product_unit_id': str(unit.id),
                'order': 0,
            }],
        }, format='json')
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1
        assert res.data[0]['recommended_product_name'] == 'Kırmızı Şarap'

        get_res = api_client.get(url)
        assert get_res.status_code == status.HTTP_200_OK
        assert len(get_res.data) == 1

        rec = ProductRecommendation.objects.get(source_product=source_product)
        assert rec.product_unit_id == unit.id
        assert rec.is_active is True

    def test_cannot_recommend_self(self, api_client, menu_manager, source_product):
        api_client.force_authenticate(user=menu_manager)
        url = reverse('product-recommendations', kwargs={'pk': source_product.pk})
        res = api_client.put(url, {
            'items': [{
                'recommended_product_id': str(source_product.id),
                'product_unit_id': None,
                'order': 0,
            }],
        }, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_product_serializer_includes_recommendations(self, api_client, menu_manager, source_product, wine_product):
        ProductRecommendation.objects.create(
            source_product=source_product,
            recommended_product=wine_product,
            order=0,
        )
        api_client.force_authenticate(user=menu_manager)
        url = reverse('product-detail', kwargs={'pk': source_product.pk})
        res = api_client.get(url)
        assert res.status_code == status.HTTP_200_OK
        assert res.data['has_recommendations'] is True
        assert len(res.data['recommendations']) == 1
        assert res.data['recommendations'][0]['name'] == 'Kırmızı Şarap'

    def test_soft_delete_removed_recommendation(self, api_client, menu_manager, source_product, wine_product, category):
        api_client.force_authenticate(user=menu_manager)
        url = reverse('product-recommendations', kwargs={'pk': source_product.pk})
        api_client.put(url, {
            'items': [{
                'recommended_product_id': str(wine_product.id),
                'product_unit_id': None,
                'order': 0,
            }],
        }, format='json')

        other = Product.objects.create(category=category, name='Turşu', base_price=Decimal('12.00'))
        api_client.put(url, {
            'items': [{
                'recommended_product_id': str(other.id),
                'product_unit_id': None,
                'order': 0,
            }],
        }, format='json')

        stale = ProductRecommendation.objects.get(source_product=source_product, recommended_product=wine_product)
        assert stale.is_active is False
