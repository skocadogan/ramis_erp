import pytest
from decimal import Decimal
from django.utils import timezone
from apps.inventory.models import StockItem, StockReservation, StockReservationStatus
from apps.inventory.services.stock_reservation_service import StockReservationService
from apps.warehouse.models import Warehouse, WarehouseStockLevel
from apps.orders.models import Order, OrderItem

@pytest.mark.django_db
class TestStockReservationService:
    @pytest.fixture
    def setup_data(self):
        from apps.branches.models import Branch
        from apps.menu.models import Product
        from apps.inventory.models import StockCategory
        
        # Temel veriler
        branch = Branch.objects.create(name="Merkez", is_active=True)
        warehouse = Warehouse.objects.create(name="Ana Depo", code="WH-001", is_active=True)
        warehouse.branches.add(branch)
        
        # Kategori, Ürün ve Reçete (Domates Söğüş -> Domates Hammadde)
        from apps.recipes.models import Recipe, RecipeIngredient
        from apps.menu.models import Category as MenuCategory
        
        m_cat = MenuCategory.objects.create(name="Salatalar")
        s_cat = StockCategory.objects.create(name="Gıda")
        
        item = StockItem.objects.create(name="Domates", category=s_cat, unit="KG", is_active=True)
        product = Product.objects.create(name="Söğüş Domates", category=m_cat, base_price=Decimal("20.00"))
        
        recipe = Recipe.objects.create(product=product, name="Domates Reçetesi")
        RecipeIngredient.objects.create(recipe=recipe, stock_item=item, quantity=1.0, unit="KG")
        
        # Fiziksel Stok (10 KG)
        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=item,
            quantity=Decimal("10.000000")
        )
        
        # Sipariş ve Kalemi
        order = Order.objects.create(branch=branch, order_type='TABLE')
        order_item = OrderItem.objects.create(
            order=order,
            product=product,
            quantity=3,
            unit_price=Decimal("10.00"),
            total_price=Decimal("30.00")
        )
        
        return warehouse, item, order, order_item

    def test_reserve_for_order_success(self, setup_data):
        warehouse, item, order, order_item = setup_data
        
        # Rezervasyon Yap (3 KG)
        reservations = StockReservationService.reserve_for_order(order, warehouse.id)
        
        assert len(reservations) == 1
        res = reservations[0]
        assert res.quantity == 3.0
        assert res.status == StockReservationStatus.RESERVED
        assert res.stock_item == item
        assert res.order_item == order_item

    def test_release_reservations(self, setup_data):
        warehouse, item, order, order_item = setup_data
        StockReservationService.reserve_for_order(order, warehouse.id)
        
        # İptal Et / Serbest Bırak
        StockReservationService.release_reservations(order)
        
        res = StockReservation.objects.get(order_item=order_item)
        assert res.status == StockReservationStatus.RELEASED

    def test_commit_reservations(self, setup_data):
        warehouse, item, order, order_item = setup_data
        StockReservationService.reserve_for_order(order, warehouse.id)
        
        # Kesinleştir (Ödeme yapıldı varsayımı)
        StockReservationService.commit_reservations(order)
        
        res = StockReservation.objects.get(order_item=order_item)
        assert res.status == StockReservationStatus.COMMITTED
