import pytest
from decimal import Decimal
from rest_framework.test import APIClient

from core.decimal_constants import ZERO_MONEY
from django.contrib.auth import get_user_model

from apps.branches.models import Branch
from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderStatus
from apps.sales.models import Sale, PaymentMethod
from apps.warehouse.models import Warehouse

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Satış Şubesi', code='SAL')


@pytest.fixture
def warehouse(db, branch):
    return Warehouse.objects.create(
        name='Satış Deposu', code='SAL-WH',
        warehouse_type='MAIN', is_default=True,
    )


@pytest.fixture
def other_branch(db):
    return Branch.objects.create(name='Diğer Şube', code='SAL2')


@pytest.fixture
def category(db):
    return Category.objects.create(name='Test Kategori')


@pytest.fixture
def product(db, category):
    return Product.objects.create(
        category=category, name='Test Ürün', base_price=Decimal('100.00')
    )


@pytest.fixture
def completed_order(db, branch):
    return Order.objects.create(
        branch=branch, status=OrderStatus.COMPLETED,
        total_amount=Decimal('200.00'), discount_amount=ZERO_MONEY,
    )


@pytest.fixture
def sale(db, branch, warehouse, completed_order):
    warehouse.branches.add(branch)
    return Sale.objects.create(
        order=completed_order,
        branch=branch,
        payment_method=PaymentMethod.CASH,
        total_amount=Decimal('200.00'),
        discount_amount=ZERO_MONEY,
    )


@pytest.fixture
def sale_with_discount(db, branch):
    order = Order.objects.create(
        branch=branch, status=OrderStatus.COMPLETED,
        total_amount=Decimal('150.00'), discount_amount=Decimal('50.00'),
    )
    return Sale.objects.create(
        order=order,
        branch=branch,
        payment_method=PaymentMethod.CARD,
        total_amount=Decimal('150.00'),
        discount_amount=Decimal('50.00'),
    )
