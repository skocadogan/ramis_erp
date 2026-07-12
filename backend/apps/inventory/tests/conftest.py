import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.branches.models import Branch
from apps.inventory.models import StockItem
from apps.warehouse.models import Warehouse, WarehouseStockLevel
from rbac.models import Role, RolePermission

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Ana Şube', code='MAIN')


@pytest.fixture
def user(db, branch):
    return User.objects.create_user(
        username='testuser',
        email='test@test.com',
        password='testpass123',
        branch=branch,
    )


@pytest.fixture
def staff_user(db, branch):
    role = Role.objects.create(name='Test Staff')
    user = User.objects.create_user(
        username='staffuser',
        email='staff@test.com',
        password='testpass123',
        branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.fixture
def warehouse(db):
    return Warehouse.objects.create(
        name='Ana Depo',
        code='MAIN-WH',
        is_default=True,
    )


@pytest.fixture
def stock_level(db, warehouse, stock_item):
    return WarehouseStockLevel.objects.create(
        warehouse=warehouse,
        stock_item=stock_item,
        quantity=Decimal('100.000'),
        minimum_quantity=Decimal('10.000'),
    )


@pytest.fixture
def stock_item(db):
    return StockItem.objects.create(
        name='Un',
        sku='UN-001',
        unit='kg',
        minimum_quantity=Decimal('10.000'),
        last_purchase_price=Decimal('25.00'),
    )
