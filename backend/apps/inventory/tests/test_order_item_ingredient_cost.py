from decimal import Decimal

import pytest

from apps.branches.models import KitchenStation
from apps.inventory.models import OrderItemIngredientCost, StockMovement
from apps.inventory.services.stock_reservation_service import StockReservationService
from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.recipes.models import Recipe, RecipeIngredient
from apps.warehouse.models import WarehouseStockLevel, WarehouseType


@pytest.mark.django_db
class TestOrderItemIngredientCostLedger:
    def test_commit_reservations_writes_cost_snapshot_entries(self, branch, user, warehouse, stock_item):
        warehouse.warehouse_type = WarehouseType.KITCHEN
        warehouse.save(update_fields=["warehouse_type", "updated_at"])
        warehouse.branches.add(branch)

        station = KitchenStation.objects.create(
            branch=branch,
            name="Ana Mutfak",
            code="main-kitchen",
            warehouse=warehouse,
        )
        category = Category.objects.create(name="Kebap", station=station)
        product = Product.objects.create(
            category=category,
            name="Adana Kebap",
            base_price=Decimal("20.00"),
        )
        product.branches.add(branch)

        recipe = Recipe.objects.create(product=product, name="Adana Reçete", servings=1)
        recipe.branches.add(branch)
        RecipeIngredient.objects.create(
            recipe=recipe,
            stock_item=stock_item,
            quantity=Decimal("1.000000"),
            normalized_quantity=Decimal("1.000000"),
            unit=stock_item.unit,
        )

        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=stock_item,
            quantity=Decimal("10.000000"),
            minimum_quantity=Decimal("1.000000"),
        )

        order = Order.objects.create(
            branch=branch,
            status=OrderStatus.PENDING,
            total_amount=Decimal("40.00"),
            stock_tracking_mode="INGREDIENT",
        )
        order_item = OrderItem.objects.create(
            order=order,
            branch=branch,
            product=product,
            quantity=2,
            unit_price=Decimal("20.00"),
            total_price=Decimal("40.00"),
            status=OrderStatus.PENDING,
            station=station,
        )

        reservations = StockReservationService.reserve_for_order(order)
        assert len(reservations) == 1

        movements = StockReservationService.commit_reservations(order, performed_by=user)
        assert len(movements) == 1

        ledger_entries = OrderItemIngredientCost.objects.filter(order_item=order_item)
        assert ledger_entries.count() == 1

        entry = ledger_entries.get()
        movement = StockMovement.objects.get(id=entry.movement_id)
        assert entry.product_id == product.id
        assert entry.branch_id == branch.id
        assert entry.stock_item_id == stock_item.id
        assert entry.warehouse_id == warehouse.id
        assert entry.quantity == Decimal("2.000")
        assert entry.unit_cost_snapshot == Decimal("25.00")
        assert entry.line_cost_snapshot == Decimal("50.00")
        assert movement.unit_price == Decimal("25.00")

        second_movements = StockReservationService.commit_reservations(order, performed_by=user)
        assert second_movements == []
        assert OrderItemIngredientCost.objects.filter(order_item=order_item).count() == 1
        assert StockMovement.objects.filter(reference__contains=f"Sipariş #{order.id}").count() == 1
