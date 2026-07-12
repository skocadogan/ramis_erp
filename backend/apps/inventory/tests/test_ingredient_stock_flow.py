"""INGREDIENT modu: istasyon deposu, complete_table Sale-atlama, kombine ürün."""

from decimal import Decimal

import pytest

from apps.branches.models import Branch, KitchenStation, Table, Zone
from apps.inventory.models import (
    StockItem,
    StockMovement,
    StockMovementType,
    StockReservation,
    StockReservationStatus,
)
from apps.inventory.services import InventoryService
from apps.menu.models import Category, CombinedProductItem, Product
from apps.orders.models import Order, OrderStatus
from apps.orders.services import OrderService
from apps.recipes.models import Recipe, RecipeIngredient
from apps.warehouse.models import Warehouse, WarehouseStockLevel, WarehouseType


@pytest.mark.django_db
class TestIngredientStockFlow:
    def _branch(self):
        return Branch.objects.create(name="B-ing", code="BING")

    def _user(self, branch):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        return User.objects.create_user(
            username=f"u_{branch.code}",
            email=f"{branch.code}@t.local",
            password="pw",
            branch=branch,
        )

    def _station_wh(self, branch, code="ST-WH"):
        wh = Warehouse.objects.create(
            name=f"Station {code}",
            code=code,
            warehouse_type=WarehouseType.KITCHEN,
            is_active=True,
        )
        wh.branches.add(branch)
        return wh

    def _product_with_recipe(self, category, stock_item, qty=Decimal("1"), servings=1):
        product = Product.objects.create(
            category=category,
            name=f"P-{stock_item.sku}",
            base_price=Decimal("10.00"),
        )
        recipe = Recipe.objects.create(product=product, name=f"R-{stock_item.sku}", servings=servings)
        RecipeIngredient.objects.create(
            recipe=recipe,
            stock_item=stock_item,
            quantity=qty,
            unit=stock_item.unit,
        )
        return product

    def test_create_order_reserves_and_complete_order_deducts_station_warehouse(self):
        branch = self._branch()
        user = self._user(branch)
        station_wh = self._station_wh(branch, "ST-1")
        station = KitchenStation.objects.create(
            branch=branch, name="Izgara", warehouse=station_wh
        )
        category = Category.objects.create(name="Izgara", station=station)
        zone = Zone.objects.create(branch=branch, name="Salon")
        table = Table.objects.create(zone=zone, name="T1", table_number=1)

        stock_item = StockItem.objects.create(
            name="Et",
            sku="ET-1",
            unit="kg",
            minimum_quantity=Decimal("0"),
            last_purchase_price=Decimal("1"),
        )
        InventoryService.receive_stock(
            warehouse_id=station_wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("5.000"),
            reference="init",
            performed_by=user,
            unit_price=Decimal("1"),
        )
        product = self._product_with_recipe(category, stock_item, qty=Decimal("0.500"), servings=1)

        order = OrderService.create_order(
            branch_id=str(branch.id),
            table_id=str(table.id),
            order_type="TABLE",
            user=user,
            notes="",
            items_data=[
                {
                    "product_id": str(product.id),
                    "quantity": 2,
                    "unit_price": Decimal("10.00"),
                }
            ],
            stock_tracking_mode="INGREDIENT",
            skip_station_stock_check=True,
        )

        assert order.stock_tracking_mode == "INGREDIENT"
        res = StockReservation.objects.filter(
            order_item__order=order, status=StockReservationStatus.RESERVED
        )
        assert res.count() == 1
        assert res.first().warehouse_id == station_wh.id
        assert res.first().quantity == Decimal("1.000")

        OrderService.complete_order(order, "CASH", user)

        assert StockReservation.objects.filter(
            order_item__order=order, status=StockReservationStatus.COMMITTED
        ).count() == 1
        level = WarehouseStockLevel.objects.get(warehouse=station_wh, stock_item=stock_item)
        assert level.quantity == Decimal("4.000")
        assert StockMovement.objects.filter(
            warehouse=station_wh,
            stock_item=stock_item,
            movement_type=StockMovementType.OUT,
        ).exists()

    def test_complete_table_commits_when_sale_exists_before_settle(self):
        branch = self._branch()
        user = self._user(branch)
        station_wh = self._station_wh(branch, "ST-2")
        station = KitchenStation.objects.create(branch=branch, name="S2", warehouse=station_wh)
        category = Category.objects.create(name="C2", station=station)
        zone = Zone.objects.create(branch=branch, name="Z2")
        table = Table.objects.create(zone=zone, name="T2", table_number=2)

        stock_item = StockItem.objects.create(
            name="Sut",
            sku="SUT-1",
            unit="lt",
            minimum_quantity=Decimal("0"),
            last_purchase_price=Decimal("1"),
        )
        InventoryService.receive_stock(
            warehouse_id=station_wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("3.000"),
            reference="init",
            performed_by=user,
            unit_price=Decimal("1"),
        )
        product = self._product_with_recipe(category, stock_item, qty=Decimal("1"), servings=1)

        order = OrderService.create_order(
            branch_id=str(branch.id),
            table_id=str(table.id),
            order_type="TABLE",
            user=user,
            notes="",
            items_data=[
                {"product_id": str(product.id), "quantity": 1, "unit_price": Decimal("10.00")}
            ],
            stock_tracking_mode="INGREDIENT",
            skip_station_stock_check=True,
        )
        assert StockReservation.objects.filter(
            order_item__order=order, status=StockReservationStatus.RESERVED
        ).exists()

        from apps.sales.models import Sale

        Sale.objects.create(
            order=order,
            branch=branch,
            total_amount=order.total_amount,
            payment_method="CASH",
        )

        from apps.orders.services.table_flow_service import TableFlowService

        TableFlowService.complete_table(
            table_id=table.id,
            payment_method="CASH",
            user=user,
            branch_id=str(branch.id),
        )

        assert StockReservation.objects.filter(
            order_item__order=order, status=StockReservationStatus.COMMITTED
        ).exists()
        level = WarehouseStockLevel.objects.get(warehouse=station_wh, stock_item=stock_item)
        assert level.quantity == Decimal("2.000")

    def test_combined_product_without_parent_recipe_reserves_components(self):
        branch = self._branch()
        user = self._user(branch)
        station_wh = self._station_wh(branch, "ST-3")
        station = KitchenStation.objects.create(branch=branch, name="S3", warehouse=station_wh)
        category = Category.objects.create(name="Menu", station=station)

        stock_a = StockItem.objects.create(
            name="A",
            sku="A-1",
            unit="kg",
            minimum_quantity=Decimal("0"),
            last_purchase_price=Decimal("1"),
        )
        stock_b = StockItem.objects.create(
            name="B",
            sku="B-1",
            unit="kg",
            minimum_quantity=Decimal("0"),
            last_purchase_price=Decimal("1"),
        )
        for si in (stock_a, stock_b):
            InventoryService.receive_stock(
                warehouse_id=station_wh.id,
                stock_item_id=si.id,
                quantity=Decimal("10"),
                reference="init",
                performed_by=user,
                unit_price=Decimal("1"),
            )

        child_a = self._product_with_recipe(category, stock_a)
        child_b = self._product_with_recipe(category, stock_b)
        combo = Product.objects.create(
            category=category,
            name="Combo",
            base_price=Decimal("20"),
            is_combined=True,
        )
        CombinedProductItem.objects.create(parent_product=combo, product=child_a, quantity=1)
        CombinedProductItem.objects.create(parent_product=combo, product=child_b, quantity=1)

        zone = Zone.objects.create(branch=branch, name="Z3")
        table = Table.objects.create(zone=zone, name="T3", table_number=3)

        order = OrderService.create_order(
            branch_id=str(branch.id),
            table_id=str(table.id),
            order_type="TABLE",
            user=user,
            notes="",
            items_data=[
                {"product_id": str(combo.id), "quantity": 1, "unit_price": Decimal("20.00")}
            ],
            stock_tracking_mode="INGREDIENT",
            skip_station_stock_check=True,
        )

        res = StockReservation.objects.filter(
            order_item__order=order, status=StockReservationStatus.RESERVED
        )
        assert res.count() == 2
        stock_ids = set(res.values_list("stock_item_id", flat=True))
        assert stock_a.id in stock_ids
        assert stock_b.id in stock_ids
