"""Fiyat artışı selector testleri."""

from decimal import Decimal
from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch
from apps.inventory.models import StockCategory, StockItem, StockMovement, StockMovementType, Supplier
from apps.warehouse.models import Warehouse, WarehouseType
from django.contrib.auth import get_user_model

User = get_user_model()


def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={'name': name, 'category': cat})[0]


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Fiyat Test Şubesi', code='PRC')


@pytest.fixture
def warehouse(db, branch):
    wh = Warehouse.objects.create(name='Fiyat Depo', code='PRC-WH', warehouse_type=WarehouseType.MAIN)
    wh.branches.add(branch)
    return wh


@pytest.fixture
def inv_cat(db):
    return PermissionCategory.objects.get_or_create(code='inventory', defaults={'name': 'Envanter'})[0]


@pytest.fixture
def inventory_user(db, branch, inv_cat):
    role = Role.objects.create(name='Stok Görüntüleyici')
    role.permissions.add(_make_perm('inventory.view_stock_item', 'Stok Gör', inv_cat))
    user = User.objects.create_user(username='invuser', password='pw', email='inv@test.com', branch=branch)
    user.roles.add(role)
    return user


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name='Fiyat Tedarikçi')


@pytest.fixture
def stock_item(db, supplier):
    cat = StockCategory.objects.create(name='Gıda', code='GIDA-PRC')
    item = StockItem.objects.create(
        name='Zeytinyağı',
        sku='ZEY-001',
        unit='lt',
        category=cat,
        last_purchase_price=Decimal('110'),
    )
    item.suppliers.add(supplier)
    return item


@pytest.mark.django_db
class TestPriceIncreases:
    def _create_in(self, warehouse, item, supplier, price, days_ago):
        StockMovement.objects.create(
            warehouse=warehouse,
            stock_item=item,
            supplier=supplier,
            movement_type=StockMovementType.IN,
            quantity=Decimal('10'),
            unit='lt',
            unit_price=price,
            created_at=timezone.now() - timedelta(days=days_ago),
        )

    def test_lists_items_above_threshold(self, inventory_user, warehouse, stock_item, supplier):
        self._create_in(warehouse, stock_item, supplier, Decimal('100'), 30)
        self._create_in(warehouse, stock_item, supplier, Decimal('110'), 5)
        client = APIClient()
        client.force_authenticate(inventory_user)
        url = reverse('stockitem-price-increases')
        res = client.get(url, {'min_change_pct': '5'})
        assert res.status_code == status.HTTP_200_OK
        assert res.data['summary']['item_count'] == 1
        row = res.data['results'][0]
        assert row['stock_item_id'] == str(stock_item.id)
        assert row['change_pct'] == '10.00'

    def test_excludes_small_increase(self, inventory_user, warehouse, stock_item, supplier):
        self._create_in(warehouse, stock_item, supplier, Decimal('100'), 30)
        self._create_in(warehouse, stock_item, supplier, Decimal('103'), 5)
        client = APIClient()
        client.force_authenticate(inventory_user)
        url = reverse('stockitem-price-increases')
        res = client.get(url, {'min_change_pct': '5'})
        assert res.status_code == status.HTTP_200_OK
        assert res.data['summary']['item_count'] == 0
