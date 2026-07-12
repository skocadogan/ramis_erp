import pytest
from decimal import Decimal

from django.contrib.auth import get_user_model

from apps.branches.models import Branch
from apps.credit.models import CreditAccount, CreditPolicy
from apps.orders.models import Order, OrderStatus
from apps.sales.models import PaymentMethod, Sale

User = get_user_model()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name="Kredi Şubesi", code="CRD")


@pytest.fixture
def credit_account(db, branch):
    return CreditAccount.objects.create(
        first_name="Ali",
        last_name="Veli",
        branch=branch,
        credit_policy=CreditPolicy.BLOCK,
    )


@pytest.fixture
def completed_order(db, branch):
    return Order.objects.create(
        branch=branch,
        status=OrderStatus.COMPLETED,
        total_amount=Decimal("100.00"),
    )


@pytest.fixture
def sale(db, branch, completed_order):
    return Sale.objects.create(
        order=completed_order,
        branch=branch,
        payment_method=PaymentMethod.CREDIT,
        total_amount=Decimal("100.00"),
        discount_amount=Decimal("0"),
    )
