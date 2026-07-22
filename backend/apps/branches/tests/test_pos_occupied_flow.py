"""pos_occupied_flow — paket READY+görüldü → SETTLE."""

from decimal import Decimal

import pytest
from django.utils import timezone

from apps.branches.pos_occupied_flow import flow_for_order
from apps.orders.models import Order, OrderItem, OrderStatus, OrderType


pytest_plugins = ("apps.orders.tests.conftest",)


def _make_item(order, product, *, status, acknowledged=False):
    return OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("10.00"),
        total_price=Decimal("10.00"),
        status=status,
        waiter_acknowledged_at=timezone.now() if acknowledged else None,
    )


@pytest.mark.django_db
class TestPosOccupiedFlowTakeaway:
    def test_ready_unacked_is_kitchen(self, branch, takeaway_zone, product, pos_user):
        order = Order.objects.create(
            branch=branch,
            order_type=OrderType.TAKEAWAY,
            takeaway_zone=takeaway_zone,
            user=pos_user,
            status=OrderStatus.READY,
            order_number="T1",
        )
        _make_item(order, product, status=OrderStatus.READY)
        assert flow_for_order(order) == "KITCHEN"

    def test_ready_acked_is_settle(self, branch, takeaway_zone, product, pos_user):
        order = Order.objects.create(
            branch=branch,
            order_type=OrderType.TAKEAWAY,
            takeaway_zone=takeaway_zone,
            user=pos_user,
            status=OrderStatus.READY,
            order_number="T2",
        )
        _make_item(order, product, status=OrderStatus.READY, acknowledged=True)
        assert flow_for_order(order) == "SETTLE"

    def test_table_ready_acked_stays_kitchen(self, branch, table, product, pos_user):
        order = Order.objects.create(
            branch=branch,
            table=table,
            order_type=OrderType.TABLE,
            user=pos_user,
            status=OrderStatus.READY,
            order_number="M1",
        )
        _make_item(order, product, status=OrderStatus.READY, acknowledged=True)
        assert flow_for_order(order) == "KITCHEN"
