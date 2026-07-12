import pytest
from decimal import Decimal
from apps.inventory.models import StockItem, StockMovement, Supplier


@pytest.mark.django_db
class TestStockItemModel:
    def test_create_stock_item(self):
        item = StockItem.objects.create(
            name='Un',
            sku='UN-001',
            unit='kg',
            minimum_quantity=Decimal('10.000'),
            last_purchase_price=Decimal('25.00'),
        )
        assert item.name == 'Un'
        assert str(item) == 'Un (UN-001)'

    def test_last_purchase_price(self):
        item = StockItem.objects.create(
            name='Tuz',
            sku='TZ-001',
            unit='kg',
            last_purchase_price=Decimal('5.00'),
        )
        assert item.last_purchase_price == Decimal('5.00')


@pytest.mark.django_db
class TestStockMovementModel:
    def test_create_movement(self, stock_item):
        movement = StockMovement.objects.create(
            stock_item=stock_item,
            movement_type='IN',
            quantity=Decimal('50.000'),
            reference='Tedarik #1',
        )
        assert movement.stock_item == stock_item
        assert 'IN' in str(movement)


@pytest.mark.django_db
class TestSupplierModel:
    def test_create_supplier(self):
        supplier = Supplier.objects.create(
            name='ABC Tedarik',
            contact_person='Ahmet Yılmaz',
            phone='05551234567',
        )
        assert str(supplier) == 'ABC Tedarik'
