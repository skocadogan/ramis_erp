import pytest
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone

from apps.branches.models import Branch
from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.prep.models import PrepSmartRule
from apps.prep.services import PrepService


@pytest.fixture
def branches(db):
    primary = Branch.objects.create(name="Merkez", code="PREP-A")
    secondary = Branch.objects.create(name="Diğer", code="PREP-B")
    return primary, secondary


@pytest.fixture
def product(db):
    category = Category.objects.create(name="Ana Yemek")
    return Product.objects.create(
        category=category,
        name="Burger",
        base_price=Decimal("120.00"),
    )


def _completed_order(branch, product, quantity: int, *, days_ago: int = 3):
    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.COMPLETED,
        total_amount=Decimal("0"),
    )
    item = OrderItem.objects.create(
        order=order,
        product=product,
        quantity=quantity,
        unit_price=Decimal("120.00"),
        total_price=Decimal("120.00") * quantity,
        status=OrderStatus.COMPLETED,
    )
    when = timezone.now() - timedelta(days=days_ago)
    Order.objects.filter(pk=order.pk).update(created_at=when, updated_at=when)
    OrderItem.objects.filter(pk=item.pk).update(created_at=when, updated_at=when)
    return order


@pytest.mark.django_db
class TestPrepSmartRulesBranchScope:
    def test_rule_discovery_uses_only_branch_sales(self, branches, product):
        primary, secondary = branches
        _completed_order(primary, product, quantity=50)
        _completed_order(secondary, product, quantity=5)

        primary_discovery = PrepService.get_rule_discovery_suggestions(str(primary.id))
        secondary_discovery = PrepService.get_rule_discovery_suggestions(str(secondary.id))

        assert len(primary_discovery) == 1
        assert primary_discovery[0]["product_id"] == product.id
        assert primary_discovery[0]["total_sold_30d"] == 50

        assert len(secondary_discovery) == 1
        assert secondary_discovery[0]["total_sold_30d"] == 5

    def test_smart_suggestions_use_only_branch_sales(self, branches, product):
        primary, secondary = branches
        _completed_order(primary, product, quantity=40)
        _completed_order(secondary, product, quantity=4)

        PrepSmartRule.objects.create(
            branch=primary,
            title="Burger köfte",
            base_product=product,
            target_item="Köfte",
            ratio=Decimal("1.0"),
            unit="adet",
        )
        PrepSmartRule.objects.create(
            branch=secondary,
            title="Burger köfte B",
            base_product=product,
            target_item="Köfte",
            ratio=Decimal("1.0"),
            unit="adet",
        )

        primary_suggestions = PrepService.calculate_smart_prep_suggestions(str(primary.id))
        secondary_suggestions = PrepService.calculate_smart_prep_suggestions(str(secondary.id))

        assert len(primary_suggestions) == 1
        assert len(secondary_suggestions) == 1
        assert primary_suggestions[0]["avg_sales"] > secondary_suggestions[0]["avg_sales"]

    def test_cancelled_orders_are_excluded(self, branches, product):
        primary, _secondary = branches
        _completed_order(primary, product, quantity=10, days_ago=1)

        cancelled = Order.objects.create(
            branch=primary,
            status=OrderStatus.CANCELLED,
            total_amount=Decimal("0"),
        )
        item = OrderItem.objects.create(
            order=cancelled,
            product=product,
            quantity=99,
            unit_price=Decimal("120.00"),
            total_price=Decimal("11880.00"),
            status=OrderStatus.CANCELLED,
        )
        when = timezone.now() - timedelta(days=1)
        Order.objects.filter(pk=cancelled.pk).update(created_at=when, updated_at=when)
        OrderItem.objects.filter(pk=item.pk).update(created_at=when, updated_at=when)

        discovery = PrepService.get_rule_discovery_suggestions(str(primary.id))
        assert len(discovery) == 1
        assert discovery[0]["total_sold_30d"] == 10
