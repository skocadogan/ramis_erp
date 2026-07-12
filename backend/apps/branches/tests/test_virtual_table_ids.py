"""Sanal paket masa kimlikleri (tw-new / tw-ord)."""

pytest_plugins = ("apps.orders.tests.conftest",)

import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status

from apps.branches.models import Zone
from apps.branches.virtual_table_ids import parse_virtual_table_id
from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderStatus, OrderType
from apps.orders.services import OrderService


@pytest.mark.django_db
class TestVirtualTableIds:
    def test_parse_new_slot(self, branch):
        zone = Zone.objects.create(
            branch=branch, name="Paket", is_takeaway=True, is_active=True
        )
        vid = f"tw-new__{zone.id}"
        ref = parse_virtual_table_id(vid)
        assert ref is not None
        assert ref.kind == "new_slot"
        assert ref.zone_id == str(zone.id)

    def test_orders_list_with_new_slot_returns_empty(self, api_client, branch, pos_user):
        zone = Zone.objects.create(
            branch=branch, name="Paket", is_takeaway=True, is_active=True
        )
        api_client.force_authenticate(user=pos_user)
        url = reverse("order-list")
        resp = api_client.get(url, {"table_id": f"tw-new__{zone.id}"})
        assert resp.status_code == status.HTTP_200_OK
        data = resp.data.get("results", resp.data)
        assert data == [] or len(data) == 0

    def test_virtual_table_detail_payload_new_slot(self, branch):
        zone = Zone.objects.create(
            branch=branch, name="Paket", is_takeaway=True, is_active=True
        )
        from apps.branches.virtual_table_ids import virtual_table_detail_payload

        data = virtual_table_detail_payload(f"tw-new__{zone.id}")
        assert data is not None
        assert data["virtual_kind"] == "new_slot"
        assert data["zone"] == str(zone.id)

    def test_takeaway_order_virtual_retrieve(
        self, api_client, branch, table, pos_user
    ):
        zone = Zone.objects.create(
            branch=branch, name="Paket", is_takeaway=True, is_active=True
        )
        cat = Category.objects.create(name="Yemek")
        product = Product.objects.create(
            category=cat, name="Döner", base_price=Decimal("100.00")
        )
        order = OrderService.create_order(
            branch_id=branch.id,
            table_id=None,
            order_type=OrderType.TAKEAWAY,
            user=pos_user,
            notes="",
            items_data=[
                {
                    "product_id": str(product.id),
                    "quantity": 1,
                    "unit_price": Decimal("100.00"),
                }
            ],
            skip_station_stock_check=True,
        )
        order.takeaway_zone_id = zone.id
        order.save(update_fields=["takeaway_zone_id"])

        from apps.branches.virtual_table_ids import virtual_table_detail_payload

        data = virtual_table_detail_payload(f"tw-ord__{order.id}")
        assert data is not None
        assert data["virtual_kind"] == "takeaway_order"
        assert data["linked_order_id"] == str(order.id)
