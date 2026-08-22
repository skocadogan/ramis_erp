"""
OrderService birim testleri.
Sipariş oluşturma → tamamlama → Sale oluşturma tam akışı dahil.
"""
import pytest
from decimal import Decimal

from core.decimal_constants import ZERO_MONEY
from apps.branches.models import TableStatus
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.orders.services import OrderService, OrderValidationError
from apps.production_planning.models import AvailabilityMode
from apps.sales.models import Sale
from apps.audit.models import AuditLog


@pytest.mark.django_db
class TestOrderServiceCreateOrder:
    def test_siparis_olusturur_ve_toplam_hesaplar(self, branch, takeaway_zone, product):
        items_data = [{
            'product_id': product.id,
            'quantity': 2,
            'unit_price': Decimal('180.00'),
        }]
        order = OrderService.create_order(
            branch_id=branch.id,
            table_id=None,
            order_type='TAKEAWAY',
            user=None,
            notes='',
            items_data=items_data,
        )
        assert order.total_amount == Decimal('360.00')
        assert order.status == OrderStatus.PENDING
        assert order.items.count() == 1

    def test_masa_acilir(self, branch, table, product):
        items_data = [{'product_id': product.id, 'quantity': 1, 'unit_price': Decimal('50.00')}]
        OrderService.create_order(
            branch_id=branch.id,
            table_id=table.id,
            order_type='TABLE',
            user=None,
            notes='',
            items_data=items_data,
        )
        table.refresh_from_db()
        assert table.status == TableStatus.OCCUPIED

    def test_birden_fazla_kalem(self, branch, takeaway_zone, product, category):
        from apps.menu.models import Product
        product2 = Product.objects.create(
            category=category, name='İçecek', base_price=Decimal('30.00')
        )
        items_data = [
            {'product_id': product.id,  'quantity': 1, 'unit_price': Decimal('180.00')},
            {'product_id': product2.id, 'quantity': 3, 'unit_price': Decimal('30.00')},
        ]
        order = OrderService.create_order(
            branch_id=branch.id, table_id=None, order_type='TAKEAWAY',
            user=None, notes='', items_data=items_data,
        )
        assert order.total_amount == Decimal('270.00')
        assert order.items.count() == 2


@pytest.mark.django_db
class TestOrderServiceCompleteOrder:
    def test_siparis_tamamlanir_ve_sale_kaydedilir(self, pending_order, pos_user):
        OrderService.complete_order(pending_order, 'CASH', pos_user)

        pending_order.refresh_from_db()
        assert pending_order.status == OrderStatus.COMPLETED
        assert Sale.objects.filter(order=pending_order).exists()
        sale = Sale.objects.get(order=pending_order)
        assert sale.payment_method == 'CASH'
        assert sale.total_amount == pending_order.total_amount

    def test_tamamlanmis_siparis_tekrar_tamamlanamaz(self, pending_order, pos_user):
        OrderService.complete_order(pending_order, 'CASH', pos_user)
        with pytest.raises(OrderValidationError):
            OrderService.complete_order(pending_order, 'CASH', pos_user)

    def test_gecersiz_odeme_yontemi_hata_verir(self, pending_order, pos_user):
        with pytest.raises(OrderValidationError, match='Geçersiz ödeme yöntemi'):
            OrderService.complete_order(pending_order, 'BITCOIN', pos_user)

    def test_masa_kapanir_baska_siparis_yoksa(self, pending_order, table, pos_user):
        OrderService.complete_order(pending_order, 'CARD', pos_user)
        table.refresh_from_db()
        assert table.status == TableStatus.CLEANING

    def test_kalemlerin_durumu_completed_olur(self, pending_order, pos_user):
        OrderService.complete_order(pending_order, 'CASH', pos_user)
        statuses = list(pending_order.items.values_list('status', flat=True))
        assert all(s == OrderStatus.COMPLETED for s in statuses)

    def test_stale_instance_db_durumunu_yeniden_okur(self, pending_order, pos_user):
        OrderService.complete_order(pending_order, 'CASH', pos_user)
        pending_order.status = OrderStatus.PENDING
        with pytest.raises(OrderValidationError):
            OrderService.complete_order(pending_order, 'CASH', pos_user)


@pytest.mark.django_db
class TestOrderServiceCancelOrder:
    def test_siparis_iptal_edilir(self, pending_order):
        OrderService.cancel_order(pending_order)
        pending_order.refresh_from_db()
        assert pending_order.status == OrderStatus.CANCELLED

    def test_kalemlerin_durumu_cancelled_olur(self, pending_order):
        OrderService.cancel_order(pending_order)
        statuses = list(pending_order.items.values_list('status', flat=True))
        assert all(s == OrderStatus.CANCELLED for s in statuses)

    def test_iptal_edilmis_siparis_tekrar_iptal_edilemez(self, pending_order):
        OrderService.cancel_order(pending_order)
        with pytest.raises(OrderValidationError):
            OrderService.cancel_order(pending_order)

    def test_masa_kapanir_baska_siparis_yoksa(self, pending_order, table):
        OrderService.cancel_order(pending_order)
        table.refresh_from_db()
        assert table.status == TableStatus.FREE

    def test_iptalde_audit_order_cancelled_yazilir(self, pending_order):
        OrderService.cancel_order(pending_order, reason_code="MISTAKE", reason_text="Test")
        log = AuditLog.objects.filter(action='order.cancelled', target_id=str(pending_order.id)).first()
        assert log is not None
        assert log.metadata.get('order_type') == 'TABLE'

    def test_stale_instance_db_durumunu_yeniden_okur(self, pending_order):
        OrderService.cancel_order(pending_order)
        pending_order.status = OrderStatus.PENDING
        with pytest.raises(OrderValidationError):
            OrderService.cancel_order(pending_order)


@pytest.mark.django_db
class TestTakeawayCancelAuditTrail:
    def test_takeaway_cancel_order_audit(self, branch, takeaway_zone, product):
        order = OrderService.create_order(
            branch_id=branch.id,
            table_id=None,
            order_type='TAKEAWAY',
            user=None,
            notes='',
            items_data=[{'product_id': product.id, 'quantity': 1, 'unit_price': Decimal('180.00')}],
        )
        assert order.takeaway_zone_id == takeaway_zone.id
        OrderService.cancel_order(order, reason_code='CUSTOMER_CANCEL', reason_text='Vazgeçti')
        log = AuditLog.objects.filter(action='order.cancelled', target_id=str(order.id)).first()
        assert log is not None
        assert log.metadata['order_type'] == 'TAKEAWAY'
        assert str(takeaway_zone.id) == log.metadata.get('takeaway_zone_id')

    def test_takeaway_son_kalem_iptal_audit(self, branch, takeaway_zone, product):
        order = OrderService.create_order(
            branch_id=branch.id,
            table_id=None,
            order_type='TAKEAWAY',
            user=None,
            notes='',
            items_data=[{'product_id': product.id, 'quantity': 1, 'unit_price': Decimal('50.00')}],
        )
        item = order.items.first()
        OrderService.cancel_item(item, reason_code='OTHER', reason_text='')
        logs = AuditLog.objects.filter(action='order.cancelled', target_id=str(order.id))
        assert logs.count() == 1
        meta = logs.first().metadata
        assert meta['order_type'] == 'TAKEAWAY'
        assert meta.get('via') == 'last_order_item_cancelled'
        assert str(takeaway_zone.id) == meta.get('takeaway_zone_id')
        order.refresh_from_db()
        assert order.cancel_reason_code == 'OTHER'


@pytest.mark.django_db
class TestOrderServiceCreateOrderPortionUnavailable:
    """
    Ürün kısıtına göre modunda (LIMITED/SOLD_OUT) sipariş oluşturma
    sırasında miktar yetersizse 500 Internal Server Error yerine
    400 Bad Request (OrderValidationError) dönmesi gerekir.

    Bkz. /api/v1/orders/main/ üzerinden bildirilen 500 hatası.
    """

    def _create_limited_availability(self, branch, product, mode, remaining=None):
        from apps.production_planning.models import (
            ProductDayAvailability,
        )
        from django.utils import timezone

        return ProductDayAvailability.objects.create(
            branch=branch,
            product=product,
            effective_date=timezone.localdate(),
            mode=mode,
            remaining_portions=remaining,
        )

    def test_sold_out_raises_validation_error_not_500(
        self, branch, takeaway_zone, product
    ):
        """SOLD_OUT modunda sipariş oluşturmak 500 değil, 400 dönmeli."""
        self._create_limited_availability(branch, product, AvailabilityMode.SOLD_OUT)
        items_data = [
            {"product_id": product.id, "quantity": 1, "unit_price": Decimal("10.00")},
        ]
        with pytest.raises(OrderValidationError) as exc_info:
            OrderService.create_order(
                branch_id=branch.id,
                table_id=None,
                order_type="TAKEAWAY",
                user=None,
                notes="",
                items_data=items_data,
            )
        assert "kalmad" in str(exc_info.value).lower() or product.name in str(exc_info.value)

    def test_limited_with_insufficient_remaining_raises_validation_error(
        self, branch, takeaway_zone, product
    ):
        """LIMITED modunda yeterli kalan yoksa 400 dönmeli."""
        self._create_limited_availability(branch, product, AvailabilityMode.LIMITED, remaining=Decimal("2"))
        items_data = [
            {"product_id": product.id, "quantity": 5, "unit_price": Decimal("10.00")},
        ]
        with pytest.raises(OrderValidationError) as exc_info:
            OrderService.create_order(
                branch_id=branch.id,
                table_id=None,
                order_type="TAKEAWAY",
                user=None,
                notes="",
                items_data=items_data,
            )
        # Sipariş oluşmamalı (transaction rollback)
        assert Order.objects.filter(branch=branch).count() == 0
        assert "porsiyon" in str(exc_info.value).lower() or product.name in str(exc_info.value)

    def test_sold_out_does_not_create_order_or_deduct(
        self, branch, takeaway_zone, product
    ):
        """SOLD_OUT durumunda sipariş ve porsiyon düşümü hiç oluşmamalı."""
        from apps.production_planning.models import (
            ProductDayAvailability,
            AvailabilityMode,
        )

        self._create_limited_availability(branch, product, AvailabilityMode.SOLD_OUT)
        items_data = [
            {"product_id": product.id, "quantity": 1, "unit_price": Decimal("10.00")},
        ]
        with pytest.raises(OrderValidationError):
            OrderService.create_order(
                branch_id=branch.id,
                table_id=None,
                order_type="TAKEAWAY",
                user=None,
                notes="",
                items_data=items_data,
            )
        # Order oluşmamış olmalı
        assert Order.objects.filter(branch=branch).count() == 0


@pytest.mark.django_db
class TestOrderServiceApplyDiscount:
    def test_siparis_indirimi_uygulanir(self, pending_order, pos_user):
        OrderService.apply_discount(
            order=pending_order,
            discount_type='ORDER',
            discount_amount=30.0,
            applied_by=pos_user,
        )
        pending_order.refresh_from_db()
        assert pending_order.total_amount == Decimal('150.00')
        assert pending_order.discount_amount == Decimal('30.00')
        assert pending_order.discount_type == 'ORDER'
        assert pending_order.discount_by == pos_user

    def test_indirim_tutari_sifirdan_kucuk_olamaz(self, pending_order, pos_user):
        with pytest.raises(OrderValidationError):
            OrderService.apply_discount(pending_order, 'ORDER', -10, pos_user)

    def test_tamamlanmis_siparise_indirim_uygulanamaz(self, pending_order, pos_user):
        OrderService.complete_order(pending_order, 'CASH', pos_user)
        with pytest.raises(OrderValidationError):
            OrderService.apply_discount(pending_order, 'ORDER', 10, pos_user)

    def test_indirim_kaldirilir(self, pending_order, pos_user):
        OrderService.apply_discount(pending_order, 'ORDER', 30.0, pos_user)
        OrderService.remove_discount(pending_order)
        pending_order.refresh_from_db()
        assert pending_order.discount_amount == ZERO_MONEY
        assert pending_order.discount_type is None


@pytest.mark.django_db
class TestOrderServiceCancelItem:
    def test_kalem_iptal_edilir_siparis_toplami_guncellenir(self, pending_order):
        item = pending_order.items.first()
        OrderService.cancel_item(item)

        item.refresh_from_db()
        assert item.status == OrderStatus.CANCELLED
        pending_order.refresh_from_db()
        assert pending_order.total_amount == ZERO_MONEY

    def test_son_kalem_iptal_edilince_siparis_iptal_olur(self, pending_order):
        item = pending_order.items.first()
        OrderService.cancel_item(item)
        pending_order.refresh_from_db()
        assert pending_order.status == OrderStatus.CANCELLED

    def test_tamamlanmis_kalem_iptal_edilemez(self, pending_order, pos_user):
        OrderService.complete_order(pending_order, 'CASH', pos_user)
        item = pending_order.items.first()
        item.refresh_from_db()
        with pytest.raises(OrderValidationError):
            OrderService.cancel_item(item)


@pytest.mark.django_db
class TestOrderServiceUpdateItemQuantity:
    def test_miktar_guncellenir_toplam_dogru_hesaplanir(self, pending_order):
        item = pending_order.items.first()
        item, order, _ = OrderService.update_item_quantity(item, 3)
        assert item.quantity == 3
        assert item.total_price == Decimal('540.00')   # 180 * 3
        order.refresh_from_db()
        assert order.total_amount == Decimal('540.00')

    def test_delivered_artis_yeni_pending_kalem_acar(self, pending_order):
        item = pending_order.items.first()
        item.status = OrderStatus.DELIVERED
        item.save(update_fields=['status', 'updated_at'])

        item, order, _ = OrderService.update_item_quantity(
            item, 3, resend_delta_to_kitchen=True,
        )
        item.refresh_from_db()
        assert item.quantity == 1
        assert item.status == OrderStatus.DELIVERED

        pending = order.items.filter(status=OrderStatus.PENDING, parent_item__isnull=True)
        assert pending.count() == 1
        assert pending.first().quantity == 2
        order.refresh_from_db()
        assert order.total_amount == Decimal('540.00')

    def test_delivered_birlesik_artis_pending_bilesen_acar(self, branch, table, pos_user):
        from apps.branches.models import KitchenStation
        from apps.menu.models import Category, CombinedProductItem, Product

        station_bar = KitchenStation.objects.create(
            branch=branch, name="Bar", code="bar-qty", color="#000",
        )
        station_kitchen = KitchenStation.objects.create(
            branch=branch, name="Mutfak", code="kitchen-qty", color="#111",
        )
        cat_bar = Category.objects.create(name="İçecekler", station=station_bar)
        cat_food = Category.objects.create(name="Yemekler", station=station_kitchen)
        cat_combo = Category.objects.create(name="Menüler", station=station_kitchen)

        drink = Product.objects.create(
            category=cat_bar, name="Kola", base_price=Decimal("30.00"),
        )
        meal = Product.objects.create(
            category=cat_food, name="Kebap", base_price=Decimal("150.00"),
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
        for comp in parent.components.all():
            comp.status = OrderStatus.DELIVERED
            comp.save(update_fields=['status', 'updated_at'])
        parent.status = OrderStatus.DELIVERED
        parent.save(update_fields=['status', 'updated_at'])

        parent, order, _ = OrderService.update_item_quantity(
            parent, 2, resend_delta_to_kitchen=True,
        )
        parent.refresh_from_db()
        assert parent.quantity == 2
        assert parent.status == OrderStatus.PREPARING

        pending_components = parent.components.filter(status=OrderStatus.PENDING)
        assert pending_components.count() == 2
        assert all(c.quantity == 1 for c in pending_components)

    def test_mutfaktaki_birlesik_urun_adet_degisiminde_bilesenler_guncellenir(
        self, branch, table, pos_user
    ):
        from apps.branches.models import KitchenStation
        from apps.menu.models import Category, CombinedProductItem, Product

        station_bar = KitchenStation.objects.create(
            branch=branch, name="Bar", code="bar-qty-sync", color="#000",
        )
        station_kitchen = KitchenStation.objects.create(
            branch=branch, name="Mutfak", code="kitchen-qty-sync", color="#111",
        )
        cat_bar = Category.objects.create(name="İçecekler Sync", station=station_bar)
        cat_food = Category.objects.create(name="Yemekler Sync", station=station_kitchen)
        cat_combo = Category.objects.create(name="Menüler Sync", station=station_kitchen)

        drink = Product.objects.create(
            category=cat_bar, name="Kola Sync", base_price=Decimal("30.00"),
        )
        meal = Product.objects.create(
            category=cat_food, name="Kebap Sync", base_price=Decimal("150.00"),
        )
        combo = Product.objects.create(
            category=cat_combo,
            name="Menü Sync",
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
        assert parent.components.count() == 2
        assert all(c.quantity == 1 for c in parent.components.all())

        parent, _order, _ = OrderService.update_item_quantity(parent, 3)
        parent.refresh_from_db()
        assert parent.quantity == 3
        assert all(c.quantity == 3 for c in parent.components.all())

    def test_delivered_iki_kez_artis_her_seferinde_bir_delta(self, pending_order):
        item = pending_order.items.first()
        item.quantity = 2
        item.status = OrderStatus.DELIVERED
        item.save(update_fields=['quantity', 'status', 'updated_at'])

        _item, order, _ = OrderService.update_item_quantity(
            item, 3, resend_delta_to_kitchen=True,
        )
        _item, order, _ = OrderService.update_item_quantity(
            item, 4, resend_delta_to_kitchen=True,
        )

        item.refresh_from_db()
        assert item.quantity == 2
        assert item.status == OrderStatus.DELIVERED

        from django.db.models import Sum

        pending_qty = order.items.filter(
            status=OrderStatus.PENDING,
            parent_item__isnull=True,
            product_id=item.product_id,
        ).aggregate(total=Sum('quantity'))['total']
        assert pending_qty == 2


@pytest.mark.django_db
class TestOrderServiceCompleteTable:
    def _create_table_order(self, branch, table, product, quantity, unit_price):
        items_data = [{
            'product_id': product.id,
            'quantity': quantity,
            'unit_price': unit_price,
        }]
        return OrderService.create_order(
            branch_id=branch.id,
            table_id=table.id,
            order_type='TABLE',
            user=None,
            notes='',
            items_data=items_data,
        )

    def test_masadaki_tum_siparisler_tek_odeme_ile_kapanir(self, branch, table, product, pos_user):
        order1 = self._create_table_order(branch, table, product, 1, Decimal('100.00'))
        order2 = self._create_table_order(branch, table, product, 1, Decimal('50.00'))

        order_ids = OrderService.complete_table(table.id, 'CASH', pos_user)
        assert len(order_ids) == 2

        for order in (order1, order2):
            order.refresh_from_db()
            assert order.status == OrderStatus.COMPLETED
            sale = Sale.objects.get(order=order)
            assert sale.payment_method == 'CASH'
            assert not sale.is_split_payment

        table.refresh_from_db()
        assert table.status == TableStatus.CLEANING

    def test_masadaki_coklu_siparis_bolunmus_odeme_ile_kapanir(self, branch, table, product, pos_user):
        order1 = self._create_table_order(branch, table, product, 1, Decimal('100.00'))
        order2 = self._create_table_order(branch, table, product, 1, Decimal('50.00'))

        payments = [
            {'method': 'CASH', 'amount': '90.0000'},
            {'method': 'CARD', 'amount': '60.0000'},
        ]
        order_ids = OrderService.complete_table(
            table.id,
            'CASH',
            pos_user,
            payments=payments,
        )
        assert len(order_ids) == 2

        sale1 = Sale.objects.get(order=order1)
        sale2 = Sale.objects.get(order=order2)
        assert sale1.is_split_payment
        assert sale2.is_split_payment
        assert sale1.total_amount == Decimal('100.00')
        assert sale2.total_amount == Decimal('50.00')
        assert sum(p.amount for p in sale1.payments.all()) == sale1.total_amount
        assert sum(p.amount for p in sale2.payments.all()) == sale2.total_amount

        table.refresh_from_db()
        assert table.status == TableStatus.CLEANING

    def test_masa_zaten_kapatilmissa_tekrar_complete_table_basarili_doner(self, branch, table, product, pos_user):
        order1 = self._create_table_order(branch, table, product, 1, Decimal('100.00'))
        OrderService.complete_table(table.id, 'CASH', pos_user)

        order_ids = OrderService.complete_table(table.id, 'CASH', pos_user)
        assert order_ids == []

        order1.refresh_from_db()
        assert order1.status == OrderStatus.COMPLETED
        assert Sale.objects.filter(order=order1).count() == 1

    def test_complete_table_sale_varsa_tekrar_satış_olusturmaz(self, branch, table, product, pos_user):
        order1 = self._create_table_order(branch, table, product, 1, Decimal('100.00'))
        order2 = self._create_table_order(branch, table, product, 1, Decimal('50.00'))

        OrderService.complete_order(order1, 'CASH', pos_user)

        order_ids = OrderService.complete_table(table.id, 'CASH', pos_user)
        assert order_ids == [str(order2.id)]

        order2.refresh_from_db()
        assert order2.status == OrderStatus.COMPLETED
        assert Sale.objects.filter(order=order1).count() == 1
        assert Sale.objects.filter(order=order2).count() == 1

        table.refresh_from_db()
        assert table.status == TableStatus.CLEANING
    """Rapordaki öncelik-1 senaryo: sipariş → ödeme → Sale tam akışı."""

    def test_siparis_olustur_tamamla_sale_kaydi_dogrula(self, branch, takeaway_zone, product, pos_user):
        items_data = [{'product_id': product.id, 'quantity': 2, 'unit_price': Decimal('90.00')}]
        order = OrderService.create_order(
            branch_id=branch.id, table_id=None, order_type='TAKEAWAY',
            user=pos_user, notes='', items_data=items_data,
        )
        assert order.status == OrderStatus.PENDING
        assert order.total_amount == Decimal('180.00')

        OrderService.complete_order(order, 'CARD', pos_user)
        order.refresh_from_db()
        assert order.status == OrderStatus.COMPLETED

        sale = Sale.objects.get(order=order)
        assert sale.branch == branch
        assert sale.payment_method == 'CARD'
        assert sale.total_amount == Decimal('180.00')
        assert sale.created_by == pos_user
        assert not sale.is_deleted


@pytest.mark.django_db
class TestOrderItemCancelWaste:
    def test_cancel_prepared_item_sets_waste_recorded(self, branch, product):
        """Hazırlanmış (PREPARING) bir kalem iptal edilince waste_recorded=True olmalı."""
        from apps.orders.models import OrderItem
        from apps.orders.services import OrderService

        order = Order.objects.create(
            branch=branch, status=OrderStatus.PENDING,
            total_amount=Decimal('180.00'), discount_amount=ZERO_MONEY,
            stock_tracking_mode='INGREDIENT',
        )
        item = OrderItem.objects.create(
            order=order, product=product,
            quantity=1, unit_price=Decimal('180.00'),
            total_price=Decimal('180.00'), status=OrderStatus.PREPARING,
        )
        # Henüz waste kaydedilmemiş
        assert item.waste_recorded is False

        OrderService.cancel_item(item, reason_code='PREPARATION_ERROR')
        item.refresh_from_db()
        assert item.status == OrderStatus.CANCELLED
        # waste_recorded True olmalı çünkü ürün hazırlanmıştı
        assert item.waste_recorded is True

    def test_cancel_pending_item_does_not_record_waste(self, branch, product):
        """Hazırlanmamış (PENDING) bir kalem iptal edilince waste_recorded=False kalmalı."""
        from apps.orders.models import OrderItem
        from apps.orders.services import OrderService

        order = Order.objects.create(
            branch=branch, status=OrderStatus.PENDING,
            total_amount=Decimal('100.00'), discount_amount=ZERO_MONEY,
            stock_tracking_mode='INGREDIENT',
        )
        item = OrderItem.objects.create(
            order=order, product=product,
            quantity=1, unit_price=Decimal('100.00'),
            total_price=Decimal('100.00'), status=OrderStatus.PENDING,
        )
        assert item.waste_recorded is False

        OrderService.cancel_item(item, reason_code='CUSTOMER_REQUEST')
        item.refresh_from_db()
        assert item.status == OrderStatus.CANCELLED
        # Henüz hazırlanmadığı için waste kaydı oluşmamalı
        assert item.waste_recorded is False

    def test_double_cancel_does_not_double_waste(self, branch, product):
        """Aynı hazır ürün iki kez iptal edilmeye çalışılırsa ikincisi hata vermeli."""
        from apps.orders.models import OrderItem
        from apps.orders.services import OrderService, OrderValidationError

        order = Order.objects.create(
            branch=branch, status=OrderStatus.PENDING,
            total_amount=Decimal('180.00'), discount_amount=ZERO_MONEY,
            stock_tracking_mode='INGREDIENT',
        )
        item = OrderItem.objects.create(
            order=order, product=product,
            quantity=1, unit_price=Decimal('180.00'),
            total_price=Decimal('180.00'), status=OrderStatus.PREPARING,
        )
        # İlk iptal başarılı
        OrderService.cancel_item(item, reason_code='PREPARATION_ERROR')
        item.refresh_from_db()
        assert item.waste_recorded is True

        # İkinci iptal hata vermeli (zaten CANCELLED)
        with pytest.raises(OrderValidationError, match='zaten tamamlanmış veya iptal'):
            OrderService.cancel_item(item, reason_code='OTHER')


@pytest.mark.django_db
class TestSmartTableItemCancelAudit:
    def test_smart_table_cancel_writes_audit_metadata(self, branch, table, product):
        from apps.orders.cancellation_reasons import (
            SMART_TABLE_CANCEL_AUDIT_TEXT,
            SMART_TABLE_CANCEL_SOURCE,
        )
        from apps.orders.models import OrderItem

        order = Order.objects.create(
            branch=branch,
            table=table,
            status=OrderStatus.PENDING,
            total_amount=Decimal('180.00'),
        )
        item = OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal('180.00'),
            total_price=Decimal('180.00'),
            status=OrderStatus.PENDING,
        )

        OrderService.cancel_item(
            item,
            reason_code='CUSTOMER_CANCEL',
            cancel_source=SMART_TABLE_CANCEL_SOURCE,
        )
        item.refresh_from_db()
        assert item.status == OrderStatus.CANCELLED
        assert item.cancel_reason_text == str(SMART_TABLE_CANCEL_AUDIT_TEXT)

        log = AuditLog.objects.filter(
            action='order_item.cancelled',
            target_id=str(item.id),
        ).first()
        assert log is not None
        assert log.metadata['source'] == SMART_TABLE_CANCEL_SOURCE
        assert log.metadata['reason_text'] == str(SMART_TABLE_CANCEL_AUDIT_TEXT)
        assert log.metadata['reason_code'] == 'CUSTOMER_CANCEL'

    def test_cancel_item_api_from_smart_table_user(self, api_client, smart_table_user, pending_order):
        from apps.orders.cancellation_reasons import (
            SMART_TABLE_CANCEL_AUDIT_TEXT,
            SMART_TABLE_CANCEL_SOURCE,
        )

        api_client.force_authenticate(user=smart_table_user)
        item = pending_order.items.first()
        response = api_client.post(
            f'/api/v1/orders/items/{item.id}/cancel/',
            {
                'reason_code': 'CUSTOMER_CANCEL',
                'cancel_source': SMART_TABLE_CANCEL_SOURCE,
            },
            format='json',
        )
        assert response.status_code == 200

        log = AuditLog.objects.filter(
            action='order_item.cancelled',
            target_id=str(item.id),
        ).first()
        assert log is not None
        assert log.metadata['source'] == SMART_TABLE_CANCEL_SOURCE
        assert log.metadata['reason_text'] == str(SMART_TABLE_CANCEL_AUDIT_TEXT)
        item.refresh_from_db()
        assert item.cancel_reason_text == str(SMART_TABLE_CANCEL_AUDIT_TEXT)
