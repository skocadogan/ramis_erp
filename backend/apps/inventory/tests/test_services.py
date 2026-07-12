import pytest
from decimal import Decimal
from django.test import override_settings
from apps.inventory.models import StockItem, StockMovementType, StockLot, StockMovementLot
from apps.inventory.services import InventoryService, InsufficientStockError
from apps.warehouse.models import Warehouse, WarehouseStockLevel
from apps.inventory.models import StockUnit


@pytest.fixture
def warehouse(db):
    return Warehouse.objects.create(
        name='Ana Depo',
        code='MAIN-WH',
        is_default=True,
    )


@pytest.fixture
def stock_level(db, warehouse, stock_item):
    """Depoda başlangıç stok seviyesi: 100 birim."""
    return WarehouseStockLevel.objects.create(
        warehouse=warehouse,
        stock_item=stock_item,
        quantity=Decimal('100.000'),
        minimum_quantity=Decimal('10.000'),
    )


@pytest.mark.django_db
class TestInventoryService:
    def test_receive_stock_unit_conversion(self, warehouse, user):
        StockUnit.objects.get_or_create(short_name="kg", defaults={"name": "Kilogram", "multiplier": Decimal("1")})
        StockUnit.objects.get_or_create(short_name="g", defaults={"name": "Gram", "multiplier": Decimal("0.001")})

        item = StockItem.objects.create(
            name="Pirinç",
            sku="PRNC-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("1.00"),
        )

        InventoryService.receive_stock(
            warehouse_id=warehouse.id,
            stock_item_id=item.id,
            quantity=Decimal("500.000"),
            unit="g",
            reference="GR",
            performed_by=user,
            unit_price=Decimal("10.00"),
        )

        level = WarehouseStockLevel.objects.get(warehouse=warehouse, stock_item=item)
        assert level.quantity == Decimal("0.500")

    def test_receive_stock(self, warehouse, stock_item, user):
        movement = InventoryService.receive_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('50.000'),
            reference='Tedarik #1',
            performed_by=user,
        )
        level = WarehouseStockLevel.objects.get(warehouse=warehouse, stock_item=stock_item)
        assert level.quantity == Decimal('50.000')
        assert movement.movement_type == StockMovementType.IN

    def test_deduct_stock(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.deduct_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('30.000'),
            reference='Sipariş #1',
            performed_by=user,
        )
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('70.000')
        assert movement.movement_type == StockMovementType.OUT

    def test_deduct_stock_creates_movement_lots(self, warehouse, stock_item, stock_level, user):
        StockLot.objects.create(
            stock_item=stock_item,
            warehouse=warehouse,
            lot_number="LOT-A",
            quantity=Decimal("50.000"),
            initial_quantity=Decimal("50.000"),
            unit_price=Decimal("28.00"),
        )
        StockLot.objects.create(
            stock_item=stock_item,
            warehouse=warehouse,
            lot_number="LOT-B",
            quantity=Decimal("50.000"),
            initial_quantity=Decimal("50.000"),
            unit_price=Decimal("40.00"),
        )
        movement = InventoryService.deduct_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("30.000"),
            reference="Sipariş #2",
            performed_by=user,
        )
        lots = StockMovementLot.objects.filter(movement=movement)
        assert lots.count() == 1
        assert lots.first().quantity == Decimal("30.000")
        assert lots.first().unit_price == Decimal("28.00")

    @override_settings(FEFO_COSTING_ENABLED=True)
    def test_deduct_stock_fefo_unit_price_when_enabled(
        self, warehouse, stock_item, stock_level, user
    ):
        stock_item.last_purchase_price = Decimal("99.00")
        stock_item.save(update_fields=["last_purchase_price"])
        StockLot.objects.create(
            stock_item=stock_item,
            warehouse=warehouse,
            lot_number="LOT-A",
            quantity=Decimal("50.000"),
            initial_quantity=Decimal("50.000"),
            unit_price=Decimal("28.00"),
        )
        movement = InventoryService.deduct_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("10.000"),
            performed_by=user,
            unit_price=Decimal("99.00"),
        )
        assert movement.unit_price == Decimal("28.00")

    def test_deduct_stock_insufficient(self, warehouse, stock_item, stock_level):
        with pytest.raises(InsufficientStockError):
            InventoryService.deduct_stock(
                warehouse_id=warehouse.id,
                stock_item_id=stock_item.id,
                quantity=Decimal('200.000'),
            )

    def test_adjust_stock(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.adjust_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            new_quantity=Decimal('99.500'),
            notes='Sayım düzeltmesi',
            performed_by=user,
        )
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('99.500')
        assert movement.movement_type == StockMovementType.ADJUSTMENT
        assert movement.quantity == Decimal('0.500')
        assert movement.signed_quantity == Decimal('-0.500')

    def test_adjust_stock_positive_diff_signed_quantity(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.adjust_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            new_quantity=Decimal('110.000'),
            notes='Sayım artışı',
            performed_by=user,
        )
        assert movement.quantity == Decimal('10.000')
        assert movement.signed_quantity == Decimal('10.000')
        assert movement.reference == 'Sayım düzeltmesi: +10'

    def test_adjust_stock_from_negative(self, warehouse, stock_item, stock_level, user):
        stock_level.quantity = Decimal('-5.000')
        stock_level.save(update_fields=['quantity'])
        StockLot.objects.create(
            stock_item=stock_item,
            warehouse=warehouse,
            lot_number='NEG',
            quantity=Decimal('-5.000'),
            initial_quantity=Decimal('-5.000'),
        )

        movement = InventoryService.adjust_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            new_quantity=Decimal('10.000'),
            notes='Negatif stok düzeltmesi',
            performed_by=user,
        )
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('10.000')
        assert movement.movement_type == StockMovementType.ADJUSTMENT
        assert movement.quantity == Decimal('15.000')

    def test_waste_stock(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.waste_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('5.000'),
            notes='Fire kaydı',
            performed_by=user,
        )
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('95.000')
        assert movement.movement_type == StockMovementType.WASTE

    def test_return_stock(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.return_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('10.000'),
            notes='Tedarikçiye iade',
            performed_by=user,
        )
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('90.000')
        assert movement.movement_type == StockMovementType.RETURN

    def test_dispose_stock(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.dispose_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('3.000'),
            notes='SKT geçmiş ürün imhası',
            performed_by=user,
        )
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('97.000')
        assert movement.movement_type == StockMovementType.DISPOSAL

    def test_delete_return_movement_reverses_stock(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.return_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('5.000'),
            performed_by=user,
        )
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('95.000')

        InventoryService.delete_movement(movement.id)
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('100.000')
