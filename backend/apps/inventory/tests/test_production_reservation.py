"""
Üretim Stok Rezervasyonu (ProductionReservation) testleri.

Kapsanan senaryolar:
- ProductionReservation oluşturma ve alan doğrulama
- get_production_reserved_quantity toplam sorgulama
- Status geçişleri (ACTIVE → CONSUMED, ACTIVE → RELEASED)
- Soft delete (is_active=False)
"""

import pytest
from core.decimal_constants import ZERO_QTY
from decimal import Decimal

from django.db.models import Sum

from apps.inventory.models import (
    ProductionReservation,
    ProductionReservationStatus,
    StockItem,
)
from apps.inventory.selectors import get_production_reserved_quantity
from apps.inventory.stock_minimum import ZERO_QTY


@pytest.mark.django_db
class TestProductionReservationModel:
    """ProductionReservation model CRUD ve status geçişleri."""

    @pytest.fixture
    def setup_data(self):
        from apps.branches.models import Branch
        from apps.warehouse.models import Warehouse
        from apps.inventory.models import StockCategory
        from apps.menu.models import Product, Category as MenuCategory
        from apps.production_planning.models import (
            ProductionPlan,
            ProductionPlanLine,
        )

        branch = Branch.objects.create(name="Test Şube", code="TEST-01", is_active=True)
        warehouse = Warehouse.objects.create(
            name="Üretim Depo", code="WH-PROD", is_active=True
        )
        warehouse.branches.add(branch)

        s_cat = StockCategory.objects.create(name="Hammadde", code="RAW")
        m_cat = MenuCategory.objects.create(name="Ana Yemek")

        stock_item = StockItem.objects.create(
            name="Kıyma", sku="KY-001", unit="kg", category=s_cat, is_active=True
        )
        product = Product.objects.create(
            name="Köfte", category=m_cat, base_price=Decimal('50.00')
        )

        plan = ProductionPlan.objects.create(
            branch=branch,
            plan_date="2026-06-11",
        )
        plan_line = ProductionPlanLine.objects.create(
            plan=plan,
            product=product,
            target_quantity=10,
        )

        return {
            "warehouse": warehouse,
            "stock_item": stock_item,
            "plan_line": plan_line,
            "branch": branch,
            "product": product,
        }

    def test_create_reservation(self, setup_data):
        """ProductionReservation başarıyla oluşturulabilmeli."""
        data = setup_data
        reservation = ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("5.000000"),
            status=ProductionReservationStatus.ACTIVE,
        )

        assert reservation.pk is not None
        assert reservation.quantity == Decimal("5.000000")
        assert reservation.status == ProductionReservationStatus.ACTIVE
        assert reservation.is_active is True
        assert reservation.plan_line == data["plan_line"]
        assert reservation.stock_item == data["stock_item"]
        assert reservation.warehouse == data["warehouse"]

    def test_reservation_str(self, setup_data):
        """__str__ metodu anlamlı çıktı üretmeli."""
        data = setup_data
        reservation = ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("5.000000"),
        )
        expected = f"Aktif - {data['stock_item'].name} - 5.000000 ({data['plan_line'].id})"
        assert str(reservation) == expected

    def test_default_status_is_active(self, setup_data):
        """Yeni kaydın varsayılan status'ü ACTIVE olmalı."""
        data = setup_data
        reservation = ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("3.000000"),
        )
        assert reservation.status == ProductionReservationStatus.ACTIVE

    def test_status_transition_to_consumed(self, setup_data):
        """ACTIVE → CONSUMED geçişi yapılabilmeli."""
        data = setup_data
        reservation = ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("2.500000"),
        )
        reservation.status = ProductionReservationStatus.CONSUMED
        reservation.save(update_fields=["status", "updated_at"])

        updated = ProductionReservation.objects.get(pk=reservation.pk)
        assert updated.status == ProductionReservationStatus.CONSUMED

    def test_status_transition_to_released(self, setup_data):
        """ACTIVE → RELEASED geçişi yapılabilmeli."""
        data = setup_data
        reservation = ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("1.000000"),
        )
        reservation.status = ProductionReservationStatus.RELEASED
        reservation.save(update_fields=["status", "updated_at"])

        updated = ProductionReservation.objects.get(pk=reservation.pk)
        assert updated.status == ProductionReservationStatus.RELEASED

    def test_soft_delete(self, setup_data):
        """Soft delete sonrası is_active=False olmalı, veritabanında kalmalı."""
        data = setup_data
        reservation = ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("4.000000"),
        )
        pk = reservation.pk
        reservation.delete()

        # Veritabanında hâlâ duruyor olmalı
        deleted = ProductionReservation.objects.get(pk=pk)
        assert deleted.is_active is False

        # Varsayılan queryset'te görünmemeli
        active_qs = ProductionReservation.objects.filter(is_active=True, pk=pk)
        assert active_qs.count() == 0


@pytest.mark.django_db
class TestProductionReservationSelector:
    """get_production_reserved_quantity selector testleri."""

    @pytest.fixture
    def setup_data(self):
        from apps.branches.models import Branch
        from apps.warehouse.models import Warehouse
        from apps.inventory.models import StockCategory
        from apps.menu.models import Product, Category as MenuCategory
        from apps.production_planning.models import (
            ProductionPlan,
            ProductionPlanLine,
        )

        branch = Branch.objects.create(name="Selector Şube", code="SEL-01", is_active=True)
        warehouse = Warehouse.objects.create(
            name="Selector Depo", code="WH-SEL", is_active=True
        )
        warehouse.branches.add(branch)

        s_cat = StockCategory.objects.create(name="Malzeme", code="MAT")
        m_cat = MenuCategory.objects.create(name="Çorba")

        stock_item = StockItem.objects.create(
            name="Domates Püresi", sku="DP-001", unit="kg", category=s_cat, is_active=True
        )
        product = Product.objects.create(
            name="Domates Çorbası", category=m_cat, base_price=Decimal('30.00')
        )

        plan = ProductionPlan.objects.create(
            branch=branch,
            plan_date="2026-06-11",
        )
        plan_line = ProductionPlanLine.objects.create(
            plan=plan,
            product=product,
            target_quantity=20,
        )

        # Aynı malzeme için iki farklı plan satırı (farklı ürünler)
        product2 = Product.objects.create(
            name="Ezogelin Çorba", category=m_cat, base_price=Decimal('35.00')
        )
        plan_line2 = ProductionPlanLine.objects.create(
            plan=plan,
            product=product2,
            target_quantity=15,
        )

        return {
            "warehouse": warehouse,
            "stock_item": stock_item,
            "plan_line": plan_line,
            "plan_line2": plan_line2,
            "branch": branch,
        }

    def test_zero_when_no_reservation(self, setup_data):
        """Hiç rezervasyon yoksa ZERO_QTY dönmeli."""
        data = setup_data
        total = get_production_reserved_quantity(
            stock_item_id=data["stock_item"].id,
            warehouse_id=data["warehouse"].id,
        )
        assert total == ZERO_QTY

    def test_total_active_quantity(self, setup_data):
        """Aynı malzeme-depo için birden çok ACTIVE kaydın toplamı doğru hesaplanmalı."""
        data = setup_data
        # 3 + 7 = 10 kg rezerve
        ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("3.000000"),
            status=ProductionReservationStatus.ACTIVE,
        )
        ProductionReservation.objects.create(
            plan_line=data["plan_line2"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("7.000000"),
            status=ProductionReservationStatus.ACTIVE,
        )

        total = get_production_reserved_quantity(
            stock_item_id=data["stock_item"].id,
            warehouse_id=data["warehouse"].id,
        )
        assert total == Decimal("10.000000")

    def test_excludes_non_active_status(self, setup_data):
        """CONSUMED ve RELEASED kayıtlar toplam dışında kalmalı."""
        data = setup_data
        # ACTIVE: 5 kg
        ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("5.000000"),
            status=ProductionReservationStatus.ACTIVE,
        )
        # CONSUMED: 3 kg (sayılmamalı)
        ProductionReservation.objects.create(
            plan_line=data["plan_line2"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("3.000000"),
            status=ProductionReservationStatus.CONSUMED,
        )

        total = get_production_reserved_quantity(
            stock_item_id=data["stock_item"].id,
            warehouse_id=data["warehouse"].id,
        )
        assert total == Decimal("5.000000")

    def test_filters_by_warehouse(self, setup_data):
        """Farklı depodaki rezervasyonlar toplama dahil edilmemeli."""
        from apps.warehouse.models import Warehouse

        data = setup_data
        other_warehouse = Warehouse.objects.create(
            name="Diğer Depo", code="WH-OTH", is_active=True
        )

        ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("4.000000"),
            status=ProductionReservationStatus.ACTIVE,
        )
        ProductionReservation.objects.create(
            plan_line=data["plan_line2"],
            stock_item=data["stock_item"],
            warehouse=other_warehouse,
            quantity=Decimal("6.000000"),
            status=ProductionReservationStatus.ACTIVE,
        )

        # Sadece ana depo
        total = get_production_reserved_quantity(
            stock_item_id=data["stock_item"].id,
            warehouse_id=data["warehouse"].id,
        )
        assert total == Decimal("4.000000")

    def test_excludes_soft_deleted(self, setup_data):
        """Soft delete (is_active=False) olan kayıtlar toplama dahil edilmemeli."""
        data = setup_data
        r1 = ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("5.000000"),
            status=ProductionReservationStatus.ACTIVE,
        )
        ProductionReservation.objects.create(
            plan_line=data["plan_line2"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("5.000000"),
            status=ProductionReservationStatus.ACTIVE,
        )

        # r1'i soft delete
        r1.delete()

        total = get_production_reserved_quantity(
            stock_item_id=data["stock_item"].id,
            warehouse_id=data["warehouse"].id,
        )
        assert total == Decimal("5.000000")

    def test_unique_constraint_same_item_warehouse_planline(self, setup_data):
        """Aynı stock_item + warehouse + plan_line için ikinci ACTIVE kayıt engellenmeli."""
        data = setup_data
        ProductionReservation.objects.create(
            plan_line=data["plan_line"],
            stock_item=data["stock_item"],
            warehouse=data["warehouse"],
            quantity=Decimal("5.000000"),
            status=ProductionReservationStatus.ACTIVE,
        )

        # Aynı kombinasyon — UniqueConstraint ihlali beklenir
        import django.db.utils
        with pytest.raises(django.db.utils.IntegrityError):
            ProductionReservation.objects.create(
                plan_line=data["plan_line"],
                stock_item=data["stock_item"],
                warehouse=data["warehouse"],
                quantity=Decimal("3.000000"),
                status=ProductionReservationStatus.ACTIVE,
            )
