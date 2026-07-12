"""get_kds_active_orders: servis sonrası POS iptali KDS listesine dönmemeli."""

import pytest
from decimal import Decimal

from apps.orders.models import Order, OrderItem, OrderStatus
from apps.orders.selectors import get_kds_active_orders
from apps.orders.services import OrderService


@pytest.mark.django_db
class TestKdsActiveAfterDeliveredCancel:
    def _order_with_item(self, branch, table, product, item_status):
        order = Order.objects.create(
            branch=branch,
            table=table,
            status=OrderStatus.PENDING,
            total_amount=Decimal("100.00"),
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal("100.00"),
            total_price=Decimal("100.00"),
            status=item_status,
        )
        return order

    def test_delivered_then_cancelled_not_in_kds_active(self, branch, table, product):
        order = self._order_with_item(
            branch, table, product, OrderStatus.DELIVERED
        )
        assert order.id not in get_kds_active_orders(branch_id=branch.id).values_list(
            "id", flat=True
        )

        OrderService.cancel_order(order)
        order.refresh_from_db()
        assert order.status == OrderStatus.CANCELLED

        assert order.id not in get_kds_active_orders(branch_id=branch.id).values_list(
            "id", flat=True
        )

    def test_preparing_cancelled_not_in_kds_active_query(self, branch, table, product):
        """İptal sonrası API listesi boş; iptal duyurusu istemci state'inde kalır."""
        order = self._order_with_item(
            branch, table, product, OrderStatus.PREPARING
        )
        assert order.id in get_kds_active_orders(branch_id=branch.id).values_list(
            "id", flat=True
        )

        OrderService.cancel_order(order)
        assert order.id not in get_kds_active_orders(branch_id=branch.id).values_list(
            "id", flat=True
        )
