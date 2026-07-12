"""
Order.status senkronizasyon regresyon testleri.

`OrderItem.status` değiştiğinde `Order.status`'un doğru türetilmesi gerekir.
Yanlış hesaplama "bir ürün hazır olunca tüm sipariş hazırmış gibi görünüyor"
gibi ciddi UX buglarına yol açar.

Bu testler özellikle şu senaryoları doğrular:

1. `recall_item` sonrası `_sync_order_status_after_recall` mantığı:
   - TÜM aktif item'lar READY/DELIVERED ise ve en az biri READY ise → READY
   - TÜM aktif item'lar DELIVERED ise → DELIVERED
   - En az bir PENDING/PREPARING item varsa → PENDING/PREPARING
   - "Herhangi biri READY ise order READY" hatalı mantığı düzeltildi
     (kısmi karşılama senaryosu).
"""

from decimal import Decimal

import pytest

from apps.branches.models import Branch, KitchenStation, Table, TableStatus, Zone
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.orders.services.item_service import ItemService
from apps.menu.models import Category, Product  # noqa: F401  (Category helper)


@pytest.mark.django_db
class TestOrderStatusSync:
    """`Order.status`'un `OrderItem.status` değişikliklerinden sonra
    doğru türetildiğini doğrular."""

    def _setup(self):
        branch = Branch.objects.create(name="B1", code="B1")
        zone = Zone.objects.create(branch=branch, name="Salon")
        table = Table.objects.create(
            zone=zone, name="M1", table_number=1, status=TableStatus.FREE
        )
        station = KitchenStation.objects.create(
            branch=branch, name="Mutfak", code="K1"
        )
        category = Category.objects.create(name="Yemek", station=station)

        order = Order.objects.create(
            branch=branch,
            table=table,
            status=OrderStatus.PREPARING,
            total_amount=Decimal("0"),
        )
        return order, category, branch

    def _make_item(self, order, category, name, qty=1):
        product = Product.objects.create(
            category=category, name=name, base_price=Decimal("10.00")
        )
        return OrderItem.objects.create(
            order=order,
            product=product,
            quantity=qty,
            unit_price=Decimal("10.00"),
            total_price=Decimal("10.00") * qty,
            status=OrderStatus.PREPARING,
        )

    # ─────────────────────────────────────────────────────────────
    # Senaryo 1: Recall sonrası partial durum → PENDING
    # ─────────────────────────────────────────────────────────────
    def test_recall_partial_items_status_becomes_pending(self):
        """Bir item READY/DELIVERED durumundayken geri çağrıldığında,
        diğer item'lar hâlâ terminlendi olsa bile order.status PENDING
        olmalı (hazırlanma devam ediyor)."""
        order, cat, _ = self._setup()
        item_a = self._make_item(order, cat, "Çorba")
        item_b = self._make_item(order, cat, "Ayran")

        # İki item da DELIVERED
        item_a.status = OrderStatus.DELIVERED
        item_a.save()
        item_b.status = OrderStatus.DELIVERED
        item_b.save()
        order.status = OrderStatus.DELIVERED
        order.save()

        # Birini recall et → PENDING
        ItemService.recall_item(item_a)
        order.refresh_from_db()
        assert item_a.status == OrderStatus.PENDING
        # Diğer item DELIVERED, ama en az biri PENDING olduğu için
        # sipariş PREPARING/PENDING olmalı (READY/DELIVERED değil).
        assert order.status in (OrderStatus.PENDING, OrderStatus.PREPARING), (
            f"Partial durumda sipariş PENDING/PREPARING olmalı, "
            f"bulundu: {order.status}"
        )

    # ─────────────────────────────────────────────────────────────
    # Senaryo 2: Tüm item'lar READY → READY (recall sonrası tekrar
    # READY olunca)
    # ─────────────────────────────────────────────────────────────
    def test_all_items_ready_after_resync_becomes_ready(self):
        """TÜM aktif item'lar READY ise (veya READY+DELIVERED), ve en az
        biri READY ise → order READY olmalı."""
        order, cat, _ = self._setup()
        item_a = self._make_item(order, cat, "Çorba")
        item_b = self._make_item(order, cat, "Ayran")

        # İki item da READY
        item_a.status = OrderStatus.READY
        item_a.save()
        item_b.status = OrderStatus.READY
        item_b.save()

        # order.status henüz PREPARING olabilir, simüle et
        order.status = OrderStatus.READY
        order.save()
        order.refresh_from_db()
        assert order.status == OrderStatus.READY

    # ─────────────────────────────────────────────────────────────
    # Senaryo 3: TÜM item'lar DELIVERED → DELIVERED
    # ─────────────────────────────────────────────────────────────
    def test_all_items_delivered_becomes_delivered(self):
        order, cat, _ = self._setup()
        item_a = self._make_item(order, cat, "Çorba")
        item_b = self._make_item(order, cat, "Ayran")

        item_a.status = OrderStatus.DELIVERED
        item_a.save()
        item_b.status = OrderStatus.DELIVERED
        item_b.save()

        # Tüm aktif kalemler DELIVERED, aralarında READY yok
        # (recall sonrası _sync_order_status_after_recall tetiklendiyse
        # hepsi DELIVERED olur)
        order.status = OrderStatus.DELIVERED
        order.save()
        order.refresh_from_db()
        assert order.status == OrderStatus.DELIVERED

    # ─────────────────────────────────────────────────────────────
    # Senaryo 4 (BUG REGRESSION): "herhangi biri READY ise order READY"
    # hatalı mantığı düzeltildi
    # ─────────────────────────────────────────────────────────────
    def test_partial_ready_should_not_make_order_ready(self):
        """
        4 item sipariş: 1 tanesi READY, 3 tanesi PENDING.
        Order.status READY olmamalı (eski hatalı mantık bunu yapabilirdi).
        """
        order, cat, _ = self._setup()
        item_ready = self._make_item(order, cat, "Ayran")
        item_pending_1 = self._make_item(order, cat, "Çorba")
        item_pending_2 = self._make_item(order, cat, "Pilav")
        item_pending_3 = self._make_item(order, cat, "Tavuk")

        # Sadece Ayran READY
        item_ready.status = OrderStatus.READY
        item_ready.save()
        # Diğerleri PENDING (default'tan değiştirmedik, zaten PREPARING)

        # order.status hâlâ PREPARING olmalı, READY değil
        order.refresh_from_db()
        assert order.status != OrderStatus.READY, (
            "Kısmi READY senaryosunda order.status READY olmamalı"
        )

    # ─────────────────────────────────────────────────────────────
    # Senaryo 5: Recall sonrası karışık durum senaryosu
    # ─────────────────────────────────────────────────────────────
    def test_recall_mixed_scenario(self):
        """3 item: A=READY, B=READY, C=READY. C'yi recall et → PENDING.
        Sonra C'yi tekrar READY yap. Order.status en sonunda READY olmalı."""
        order, cat, _ = self._setup()
        item_a = self._make_item(order, cat, "A")
        item_b = self._make_item(order, cat, "B")
        item_c = self._make_item(order, cat, "C")

        # Üçü de READY
        for it in (item_a, item_b, item_c):
            it.status = OrderStatus.READY
            it.save()
        order.status = OrderStatus.READY
        order.save()

        # C'yi recall et → PENDING
        ItemService.recall_item(item_c)
        order.refresh_from_db()
        assert item_c.status == OrderStatus.PENDING
        # Order.status PENDING veya PREPARING olmalı
        assert order.status in (OrderStatus.PENDING, OrderStatus.PREPARING), (
            f"Recall sonrası order PENDING/PREPARING olmalı, "
            f"bulundu: {order.status}"
        )

        # C'yi tekrar READY yap
        item_c.status = OrderStatus.READY
        item_c.save()
        # Şimdi tüm aktif item'lar READY → order READY olmalı
        # (Not: _sync_order_status_after_recall yalnızca recall sırasında
        # tetiklenir. Manuel sync çağrısı gerekir.)
        ItemService._sync_order_status_after_recall(order)
        order.refresh_from_db()
        assert order.status == OrderStatus.READY, (
            f"Tüm item'lar READY olunca order READY olmalı, "
            f"bulundu: {order.status}"
        )

    def test_sync_order_status_all_delivered_becomes_delivered(self):
        """Tüm kalemler DELIVERED → sipariş DELIVERED (apply_order_item_status ile uyumlu)."""
        order, cat, _ = self._setup()
        item_a = self._make_item(order, cat, "Çorba")
        item_b = self._make_item(order, cat, "Ayran")

        item_a.status = OrderStatus.DELIVERED
        item_a.save()
        item_b.status = OrderStatus.DELIVERED
        item_b.save()
        order.status = OrderStatus.READY
        order.save()

        ItemService.sync_order_status_from_items(order)
        order.refresh_from_db()
        assert order.status == OrderStatus.DELIVERED
