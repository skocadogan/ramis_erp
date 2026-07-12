"""
Combined (birleşik) ürün sipariş kalemlerinin oluşturulma mantığı.

Bu testler aşağıdaki davranışı doğrular:

1. **Parent'ın kendi reçetesi varsa** → child OrderItem EKLENMEZ.
   Parent'ın reçetesi zaten tüm malzemeleri kapsıyor; child'ları ayrı
   satır olarak eklemek stok/maliyet çift sayımına yol açar.

2. **Parent'ın reçetesi yoksa** (örn. paket menü — sadece farklı
   istasyonlara yönlendirme amaçlı kombinasyonlar) → child OrderItem
   EKLENİR. Bunlar KDS routing için gereklidir; her child kendi
   istasyonuna yönlendirilir.

3. **Combined olmayan ürün** → sadece parent OrderItem, child yok.

Bu test, `test_combined_product_child_recipe_is_skipped_if_parent_has_recipe`
entegrasyon testinin tamamlayıcısıdır; burada davranış doğrudan
OrderItem katmanında sınanır.
"""

from decimal import Decimal

import pytest

from apps.branches.models import KitchenStation
from apps.menu.models import Category, CombinedProductItem, Product
from apps.recipes.models import Recipe, RecipeIngredient
from apps.inventory.models import StockItem
from apps.orders.services import OrderService


@pytest.mark.django_db
class TestCombinedOrderItems:
    """Combined ürün sipariş kalemi oluşturma mantığı."""

    def _station(self, branch, name, code):
        return KitchenStation.objects.create(branch=branch, name=name, code=code)

    def _combo_with_recipe(
        self, category, name, stock_item, qty_per_serving, servings=1
    ):
        """Parent'ın kendi reçetesi olan combined ürün."""
        product = Product.objects.create(
            category=category, name=name,
            base_price=Decimal("100.00"), is_combined=True,
        )
        recipe = Recipe.objects.create(product=product, name=f"R-{name}", servings=servings)
        RecipeIngredient.objects.create(
            recipe=recipe, stock_item=stock_item,
            quantity=Decimal(str(qty_per_serving)), unit=stock_item.unit,
        )
        return product

    def _combo_without_recipe(self, category, name, station=None):
        """Parent'ın reçetesi OLMAYAN combined ürün (sadece KDS routing için)."""
        return Product.objects.create(
            category=category, name=name,
            base_price=Decimal("100.00"), is_combined=True,
        )

    def _child(self, category, name, station=None, with_recipe=None):
        p = Product.objects.create(
            category=category, name=name,
            base_price=Decimal("30.00"),
        )
        if with_recipe:
            stock_item, qty = with_recipe
            recipe = Recipe.objects.create(product=p, name=f"R-{name}", servings=1)
            RecipeIngredient.objects.create(
                recipe=recipe, stock_item=stock_item,
                quantity=Decimal(str(qty)), unit=stock_item.unit,
            )
        return p

    # ─────────────────────────────────────────────────────────────
    # Senaryo 1: Parent'ın reçetesi VAR → child OrderItem EKLENMEZ
    # ─────────────────────────────────────────────────────────────
    def test_parent_with_recipe_no_component_items(self, branch, table, pos_user):
        """
        Parent'ın kendi reçetesi varsa, combined alt bileşenler ayrı
        OrderItem olarak EKLENMEMELI. Bu, maliyet/stok çift sayımını engeller.
        """
        kitchen = self._station(branch, "Mutfak", "k-recipe")
        cat = Category.objects.create(name="Paket", station=kitchen)

        stock = StockItem.objects.create(
            name="Peynir", sku="PY", unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("100.00"),
        )

        # Parent'ın reçetesi VAR (1 kg peynir)
        parent = self._combo_with_recipe(cat, "Kahvaltı Paketi", stock, Decimal("1.000"))

        # Child'lar (combined_items) — farklı kategorilerde
        cat_bar = Category.objects.create(name="İçecekler", station=self._station(branch, "Bar", "b-recipe"))
        tea = self._child(cat_bar, "Çay", with_recipe=(stock, Decimal("0.100")))
        cheese_plate = self._child(cat, "Peynir Tabağı", with_recipe=(stock, Decimal("1.000")))

        CombinedProductItem.objects.create(parent_product=parent, product=tea, quantity=1)
        CombinedProductItem.objects.create(parent_product=parent, product=cheese_plate, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id, table_id=table.id, order_type="TABLE",
            user=pos_user, notes="",
            items_data=[{"product_id": str(parent.id), "quantity": 1, "unit_price": Decimal("100.00")}],
            skip_station_stock_check=True,
        )

        # BUG FIX: Sadece 1 OrderItem olmalı (parent)
        assert order.items.count() == 1, (
            f"Parent'ın reçetesi varken child OrderItem oluşmamalı, "
            f"bulunan: {order.items.count()}"
        )

        # Parent dışında child olmamalı
        parents = order.items.filter(parent_item__isnull=True)
        assert parents.count() == 1
        assert parents.first().product_id == parent.id

    # ─────────────────────────────────────────────────────────────
    # Senaryo 2: Parent'ın reçetesi YOK → child OrderItem EKLENIR
    # ─────────────────────────────────────────────────────────────
    def test_parent_without_recipe_expands_component_items(self, branch, table, pos_user):
        """
        Parent'ın kendi reçetesi yoksa, combined alt bileşenler KDS routing
        için ayrı OrderItem olarak eklenir.
        """
        kitchen = self._station(branch, "Mutfak", "k-combo")
        bar = self._station(branch, "Bar", "b-combo")
        cat_kitchen = Category.objects.create(name="Yemekler", station=kitchen)
        cat_bar = Category.objects.create(name="İçecekler", station=bar)
        cat_combo = Category.objects.create(name="Menüler", station=kitchen)

        # Parent'ın reçetesi YOK
        combo = self._combo_without_recipe(cat_combo, "Menü")

        # Child'lar
        drink = self._child(cat_bar, "Kola")
        meal = self._child(cat_kitchen, "Kebap")

        CombinedProductItem.objects.create(parent_product=combo, product=drink, quantity=1)
        CombinedProductItem.objects.create(parent_product=combo, product=meal, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id, table_id=table.id, order_type="TABLE",
            user=pos_user, notes="",
            items_data=[{"product_id": str(combo.id), "quantity": 2, "unit_price": Decimal("170.00")}],
            skip_station_stock_check=True,
        )

        # 1 parent + 2 child = 3 OrderItem
        assert order.items.count() == 3
        parent = order.items.get(parent_item__isnull=True)
        components = list(order.items.filter(parent_item=parent).order_by("product__name"))
        assert len(components) == 2

        # Child'lar kendi istasyonlarına yönlendirilmiş olmalı
        by_name = {c.product.name: c for c in components}
        assert by_name["Kola"].station_id == bar.id
        assert by_name["Kebap"].station_id == kitchen.id

    # ─────────────────────────────────────────────────────────────
    # Senaryo 3: Combined olmayan ürün → child YOK
    # ─────────────────────────────────────────────────────────────
    def test_non_combined_product_creates_no_components(self, branch, table, pos_user):
        """is_combined=False olan normal ürün için child OrderItem oluşmamalı."""
        kitchen = self._station(branch, "Mutfak", "k-simple")
        cat = Category.objects.create(name="Yemekler", station=kitchen)

        product = Product.objects.create(
            category=cat, name="Çorba",
            base_price=Decimal("50.00"),
            is_combined=False,
        )
        # Ürünün reçetesi olsun
        stock = StockItem.objects.create(
            name="Sebze", sku="SZ", unit="kg",
            minimum_quantity=Decimal("0.000"),
        )
        recipe = Recipe.objects.create(product=product, name="R-Çorba", servings=1)
        RecipeIngredient.objects.create(
            recipe=recipe, stock_item=stock,
            quantity=Decimal("0.300"), unit=stock.unit,
        )

        order = OrderService.create_order(
            branch_id=branch.id, table_id=table.id, order_type="TABLE",
            user=pos_user, notes="",
            items_data=[{"product_id": str(product.id), "quantity": 1, "unit_price": Decimal("50.00")}],
            skip_station_stock_check=True,
        )

        assert order.items.count() == 1
        assert order.items.filter(parent_item__isnull=True).count() == 1

    # ─────────────────────────────────────────────────────────────
    # Senaryo 4: Birden fazla child — hepsi parent_item FK ile bağlı
    # ─────────────────────────────────────────────────────────────
    def test_multiple_children_under_single_parent_with_recipe(
        self, branch, table, pos_user
    ):
        """Parent'ın reçetesi olduğunda, child sayısı ne olursa olsun
        sadece 1 OrderItem oluşmalı (parent)."""
        kitchen = self._station(branch, "Mutfak", "k-multi")
        cat = Category.objects.create(name="Paket", station=kitchen)

        stock = StockItem.objects.create(
            name="Tüm Malzemeler", sku="ALL", unit="kg",
            minimum_quantity=Decimal("0.000"),
        )

        parent = self._combo_with_recipe(cat, "Mega Paket", stock, Decimal("5.000"))

        # 5 farklı child
        for i in range(5):
            child = self._child(cat, f"Alt-{i}")
            CombinedProductItem.objects.create(parent_product=parent, product=child, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id, table_id=table.id, order_type="TABLE",
            user=pos_user, notes="",
            items_data=[{"product_id": str(parent.id), "quantity": 1, "unit_price": Decimal("200.00")}],
            skip_station_stock_check=True,
        )

        # 5 child olmasına rağmen sadece 1 OrderItem
        assert order.items.count() == 1

    # ─────────────────────────────────────────────────────────────
    # Senaryo 5: Smart Firing — alt bileşen reçete süreleri toplanır
    # ─────────────────────────────────────────────────────────────
    def test_combined_smart_firing_sums_component_recipe_times(
        self, branch, table, pos_user, settings
    ):
        settings.ENABLE_SMART_FIRING_V2 = False
        kitchen = self._station(branch, "Mutfak", "k-sf")
        bar = self._station(branch, "Bar", "b-sf")
        cat_kitchen = Category.objects.create(name="Yemekler SF", station=kitchen)
        cat_bar = Category.objects.create(name="İçecekler SF", station=bar)
        cat_combo = Category.objects.create(name="Menüler SF", station=kitchen)

        stock = StockItem.objects.create(
            name="Stok SF", sku="SF", unit="kg", minimum_quantity=Decimal("0.000"),
        )
        combo = self._combo_without_recipe(cat_combo, "Öğle Menüsü")
        drink = self._child(
            cat_bar, "Ayran",
            with_recipe=(stock, Decimal("0.100")),
        )
        drink.recipe.prep_time_per_serving = 2
        drink.recipe.cook_time_per_serving = 0
        drink.recipe.save(update_fields=["prep_time_per_serving", "cook_time_per_serving"])
        meal = self._child(
            cat_kitchen, "Izgara",
            with_recipe=(stock, Decimal("0.200")),
        )
        meal.recipe.prep_time_per_serving = 5
        meal.recipe.cook_time_per_serving = 10
        meal.recipe.save(update_fields=["prep_time_per_serving", "cook_time_per_serving"])

        CombinedProductItem.objects.create(parent_product=combo, product=drink, quantity=1)
        CombinedProductItem.objects.create(parent_product=combo, product=meal, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id, table_id=table.id, order_type="TABLE",
            user=pos_user, notes="",
            items_data=[{"product_id": str(combo.id), "quantity": 1, "unit_price": Decimal("170.00")}],
            skip_station_stock_check=True,
        )

        parent = order.items.get(parent_item__isnull=True)
        components = {c.product.name: c for c in parent.components.all()}

        # 2 + 15 = 17 dk toplam; target = now+17
        from django.utils import timezone
        from datetime import timedelta

        target = timezone.now() + timedelta(minutes=17)
        assert parent.scheduled_start_time is not None
        assert abs((parent.scheduled_start_time - timezone.now()).total_seconds()) < 5
        assert components["Ayran"].scheduled_start_time is not None
        assert components["Izgara"].scheduled_start_time is not None
        assert abs((components["Ayran"].scheduled_start_time - (target - timedelta(minutes=2))).total_seconds()) < 5
        assert abs((components["Izgara"].scheduled_start_time - (target - timedelta(minutes=15))).total_seconds()) < 5

    def test_combined_without_recipe_components_fire_immediately(
        self, branch, table, pos_user, settings
    ):
        settings.ENABLE_SMART_FIRING_V2 = False
        kitchen = self._station(branch, "Mutfak", "k-sf2")
        cat_kitchen = Category.objects.create(name="Yemekler SF2", station=kitchen)
        cat_combo = Category.objects.create(name="Menüler SF2", station=kitchen)

        combo = self._combo_without_recipe(cat_combo, "Basit Menü")
        meal = self._child(cat_kitchen, "Salata")
        CombinedProductItem.objects.create(parent_product=combo, product=meal, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id, table_id=table.id, order_type="TABLE",
            user=pos_user, notes="",
            items_data=[{"product_id": str(combo.id), "quantity": 1, "unit_price": Decimal("100.00")}],
            skip_station_stock_check=True,
        )

        parent = order.items.get(parent_item__isnull=True)
        comp = parent.components.get()
        assert parent.scheduled_start_time is None
        assert comp.scheduled_start_time is None
        from apps.orders.smart_firing import compute_firing_state
        assert compute_firing_state(comp) == "late"

    # ─────────────────────────────────────────────────────────────
    # Senaryo 6: Smart Firing v2 — birleşik menü + istasyon buffer
    # ─────────────────────────────────────────────────────────────
    def test_combined_smart_firing_v2_sums_component_times_with_station_buffer(
        self, branch, table, pos_user, settings
    ):
        settings.ENABLE_SMART_FIRING_V2 = True
        kitchen = self._station(branch, "Mutfak", "k-sfv2")
        kitchen.smart_firing_extra_buffer_minutes = 5
        kitchen.save(update_fields=["smart_firing_extra_buffer_minutes"])
        bar = self._station(branch, "Bar", "b-sfv2")
        cat_kitchen = Category.objects.create(name="Yemekler SFv2", station=kitchen)
        cat_bar = Category.objects.create(name="İçecekler SFv2", station=bar)
        cat_combo = Category.objects.create(name="Menüler SFv2", station=kitchen)

        stock = StockItem.objects.create(
            name="Stok SFv2", sku="SFV2", unit="kg", minimum_quantity=Decimal("0.000"),
        )
        combo = self._combo_without_recipe(cat_combo, "Öğle Menüsü v2")
        drink = self._child(cat_bar, "Ayran", with_recipe=(stock, Decimal("0.100")))
        drink.recipe.prep_time_per_serving = 2
        drink.recipe.cook_time_per_serving = 0
        drink.recipe.save(update_fields=["prep_time_per_serving", "cook_time_per_serving"])
        meal = self._child(cat_kitchen, "Izgara", with_recipe=(stock, Decimal("0.200")))
        meal.recipe.prep_time_per_serving = 5
        meal.recipe.cook_time_per_serving = 10
        meal.recipe.save(update_fields=["prep_time_per_serving", "cook_time_per_serving"])

        CombinedProductItem.objects.create(parent_product=combo, product=drink, quantity=1)
        CombinedProductItem.objects.create(parent_product=combo, product=meal, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id, table_id=table.id, order_type="TABLE",
            user=pos_user, notes="",
            items_data=[{"product_id": str(combo.id), "quantity": 1, "unit_price": Decimal("170.00")}],
            skip_station_stock_check=True,
        )

        from django.utils import timezone
        from datetime import timedelta
        from apps.orders.smart_firing import effective_combined_lead_minutes

        eff, buffers = effective_combined_lead_minutes(branch.id, combo, quantity=1)
        assert eff == 22  # 2 + 15 statik + 5 mutfak extra buffer
        assert buffers.get(kitchen.id) == 5

        parent = order.items.get(parent_item__isnull=True)
        components = {c.product.name: c for c in parent.components.all()}
        target = timezone.now() + timedelta(minutes=22)

        assert parent.scheduled_start_time is not None
        assert abs((parent.scheduled_start_time - timezone.now()).total_seconds()) < 5
        assert abs((components["Ayran"].scheduled_start_time - (target - timedelta(minutes=2))).total_seconds()) < 5
        assert abs((components["Izgara"].scheduled_start_time - (target - timedelta(minutes=15))).total_seconds()) < 5

        notice = getattr(order, "_kitchen_queue_notice", None)
        assert notice is None or notice.get("show") is False
