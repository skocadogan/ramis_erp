"""Birleşik ürünlerin alt kalemlerinin doğru KDS istasyonuna düşmesi."""

import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status

from apps.branches.models import KitchenStation
from apps.menu.models import Category, CombinedProductItem, Product
from apps.orders.models import OrderStatus
from apps.orders.selectors import get_kds_active_orders
from apps.orders.services import OrderService


@pytest.mark.django_db
class TestCombinedProductKdsRouting:
    def test_create_order_expands_combined_items_to_component_stations(
        self, branch, table, pos_user
    ):
        station_bar = KitchenStation.objects.create(
            branch=branch, name="Bar", code="bar-combo", color="#000"
        )
        station_kitchen = KitchenStation.objects.create(
            branch=branch, name="Mutfak", code="kitchen-combo", color="#111"
        )
        cat_bar = Category.objects.create(name="İçecekler", station=station_bar)
        cat_food = Category.objects.create(name="Yemekler", station=station_kitchen)
        cat_combo = Category.objects.create(name="Menüler", station=station_kitchen)

        drink = Product.objects.create(
            category=cat_bar, name="Kola", base_price=Decimal("30.00")
        )
        meal = Product.objects.create(
            category=cat_food, name="Kebap", base_price=Decimal("150.00")
        )
        combo = Product.objects.create(
            category=cat_combo,
            name="Menü",
            base_price=Decimal("170.00"),
            is_combined=True,
        )
        CombinedProductItem.objects.create(parent_product=combo, product=drink, quantity=1)
        CombinedProductItem.objects.create(parent_product=combo, product=meal, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id,
            table_id=table.id,
            order_type="TABLE",
            user=pos_user,
            notes="",
            items_data=[
                {
                    "product_id": str(combo.id),
                    "quantity": 2,
                    "unit_price": Decimal("170.00"),
                }
            ],
            skip_station_stock_check=True,
        )

        parent = order.items.get(parent_item__isnull=True)
        components = list(order.items.filter(parent_item=parent).order_by("product__name"))
        assert len(components) == 2
        assert parent.product_id == combo.id
        assert parent.station_id == station_kitchen.id

        by_product = {c.product.name: c for c in components}
        assert by_product["Kola"].station_id == station_bar.id
        assert by_product["Kebap"].station_id == station_kitchen.id
        assert by_product["Kola"].quantity == 2
        assert by_product["Kebap"].quantity == 2
        assert by_product["Kola"].total_price == Decimal("0")

    def test_kds_active_shows_components_on_respective_stations(
        self, api_client, branch, table, pos_user, kds_user
    ):
        station_bar = KitchenStation.objects.create(
            branch=branch, name="Bar", code="bar-kds", color="#000"
        )
        station_kitchen = KitchenStation.objects.create(
            branch=branch, name="Mutfak", code="kitchen-kds", color="#111"
        )
        cat_bar = Category.objects.create(name="İçecekler", station=station_bar)
        cat_food = Category.objects.create(name="Yemekler", station=station_kitchen)
        cat_combo = Category.objects.create(name="Menüler", station=station_kitchen)

        drink = Product.objects.create(
            category=cat_bar, name="Kola", base_price=Decimal("30.00")
        )
        meal = Product.objects.create(
            category=cat_food, name="Kebap", base_price=Decimal("150.00")
        )
        combo = Product.objects.create(
            category=cat_combo,
            name="Menü",
            base_price=Decimal("170.00"),
            is_combined=True,
        )
        CombinedProductItem.objects.create(parent_product=combo, product=drink, quantity=1)
        CombinedProductItem.objects.create(parent_product=combo, product=meal, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id,
            table_id=table.id,
            order_type="TABLE",
            user=pos_user,
            notes="",
            items_data=[
                {
                    "product_id": str(combo.id),
                    "quantity": 1,
                    "unit_price": Decimal("170.00"),
                }
            ],
            skip_station_stock_check=True,
        )

        api_client.force_authenticate(user=kds_user)
        url = reverse("order-kds-active")

        bar_resp = api_client.get(url, {"station_id": str(station_bar.id)})
        assert bar_resp.status_code == 200
        bar_names = [
            it["product_name"]
            for o in bar_resp.data
            for it in o["items"]
        ]
        assert "Kola" in bar_names
        assert "Kebap" not in bar_names
        assert "Menü" not in bar_names

        kitchen_resp = api_client.get(url, {"station_id": str(station_kitchen.id)})
        assert kitchen_resp.status_code == 200
        kitchen_names = [
            it["product_name"]
            for o in kitchen_resp.data
            for it in o["items"]
        ]
        assert "Kebap" in kitchen_names
        assert "Kola" not in kitchen_names
        assert "Menü" not in kitchen_names

        kitchen_items = [it for o in kitchen_resp.data for it in o["items"]]
        kebap_item = next(it for it in kitchen_items if it["product_name"] == "Kebap")
        assert kebap_item["is_combined_component"] is True
        assert kebap_item["combined_parent_name"] == "Menü"
        assert kebap_item["combined_parent_quantity"] == 1

        bar_items = [it for o in bar_resp.data for it in o["items"]]
        kola_item = next(it for it in bar_items if it["product_name"] == "Kola")
        assert kola_item["is_combined_component"] is True
        assert kola_item["combined_parent_name"] == "Menü"

        parent = order.items.get(parent_item__isnull=True)
        assert parent.product.name == "Menü"

    def _combo_order(self, branch, table, pos_user):
        station_bar = KitchenStation.objects.create(
            branch=branch, name="Bar", code="bar-del", color="#000"
        )
        station_kitchen = KitchenStation.objects.create(
            branch=branch, name="Mutfak", code="kitchen-del", color="#111"
        )
        cat_bar = Category.objects.create(name="İçecekler", station=station_bar)
        cat_food = Category.objects.create(name="Yemekler", station=station_kitchen)
        cat_combo = Category.objects.create(name="Menüler", station=station_kitchen)

        drink = Product.objects.create(
            category=cat_bar, name="Kola", base_price=Decimal("30.00")
        )
        meal = Product.objects.create(
            category=cat_food, name="Kebap", base_price=Decimal("150.00")
        )
        combo = Product.objects.create(
            category=cat_combo,
            name="Menü",
            base_price=Decimal("170.00"),
            is_combined=True,
        )
        CombinedProductItem.objects.create(parent_product=combo, product=drink, quantity=1)
        CombinedProductItem.objects.create(parent_product=combo, product=meal, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id,
            table_id=table.id,
            order_type="TABLE",
            user=pos_user,
            notes="",
            items_data=[
                {
                    "product_id": str(combo.id),
                    "quantity": 1,
                    "unit_price": Decimal("170.00"),
                }
            ],
            skip_station_stock_check=True,
        )
        parent = order.items.get(parent_item__isnull=True)
        components = {
            c.product.name: c
            for c in order.items.filter(parent_item=parent)
        }
        return order, parent, components, station_bar, station_kitchen

    def test_parent_delivered_cascades_components_and_leaves_kds_active(
        self, api_client, branch, table, pos_user, kds_user
    ):
        order, parent, components, station_bar, _ = self._combo_order(
            branch, table, pos_user
        )
        for comp in components.values():
            comp.status = OrderStatus.READY
            comp.save(update_fields=["status", "updated_at"])
        parent.status = OrderStatus.READY
        parent.save(update_fields=["status", "updated_at"])

        assert order.id in get_kds_active_orders(branch_id=branch.id).values_list(
            "id", flat=True
        )

        # Mutfak bildirimi / garson teslimi: ana kalem DELIVERED (KDS kullanıcısı değil POS/garson)
        api_client.force_authenticate(user=pos_user)
        url = reverse("orderitem-set-status", kwargs={"pk": parent.id})
        resp = api_client.post(url, {"status": "DELIVERED"}, format="json")
        assert resp.status_code == status.HTTP_200_OK

        parent.refresh_from_db()
        for comp in components.values():
            comp.refresh_from_db()
            assert comp.status == OrderStatus.DELIVERED
        assert parent.status == OrderStatus.DELIVERED

        assert order.id not in get_kds_active_orders(branch_id=branch.id).values_list(
            "id", flat=True
        )

        api_client.force_authenticate(user=kds_user)
        bar_resp = api_client.get(
            reverse("order-kds-active"),
            {"station_id": str(station_bar.id)},
        )
        assert bar_resp.status_code == 200
        bar_names = [
            it["product_name"] for o in bar_resp.data for it in o["items"]
        ]
        assert "Kola" not in bar_names

    def test_stale_ready_components_hidden_when_parent_already_delivered(
        self, branch, table, pos_user
    ):
        """Eski veri: ana DELIVERED, altlar READY — KDS aktif listesinde sayılmamalı."""
        order, parent, components, _, _ = self._combo_order(branch, table, pos_user)
        parent.status = OrderStatus.DELIVERED
        parent.save(update_fields=["status", "updated_at"])
        for comp in components.values():
            comp.status = OrderStatus.READY
            comp.save(update_fields=["status", "updated_at"])

        assert order.id not in get_kds_active_orders(branch_id=branch.id).values_list(
            "id", flat=True
        )
