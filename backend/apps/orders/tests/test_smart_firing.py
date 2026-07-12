"""Smart Firing birim testleri — özellikle resolve_recipe_lead_minutes."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from apps.orders.smart_firing import (
    compute_firing_state,
    resolve_combined_static_lead_minutes,
    resolve_recipe_lead_minutes,
)


class TestResolveRecipeLeadMinutes:
    """resolve_recipe_lead_minutes için birim testleri (DB gerektirmez).

    Formül: lead = quantity × (prep_time_per_serving + cook_time_per_serving)

    Dönüş değeri anlamı:
      * 0 → ürüne reçete bağlı değil veya porsiyon süresi yok (hemen gönder).
      * >1 → quantity × per_serving_total.

    ``prep_time_minutes`` / ``cook_time_minutes`` bilgi amaçlıdır,
    hesaplamaya katılmaz.
    """

    def _make_mock_recipe(self, prep=0, cook=0, prep_per=0, cook_per=0):
        recipe = MagicMock()
        recipe.prep_time_minutes = prep
        recipe.cook_time_minutes = cook
        recipe.prep_time_per_serving = prep_per
        recipe.cook_time_per_serving = cook_per
        return recipe

    def _make_mock_product(self, recipe=None):
        product = MagicMock()
        product.recipe = recipe
        return product

    # ── Per-serving süre (birincil) ──────────────────────────────

    def test_per_serving_tek_porsiyon(self):
        """quantity=1 → 1 × per_serving_total."""
        recipe = self._make_mock_recipe(prep_per=3, cook_per=2)
        product = self._make_mock_product(recipe)
        # per_serving=5, qty=1 → 1*5 = 5
        assert resolve_recipe_lead_minutes(product, quantity=1) == 5

    def test_per_serving_cok_porsiyon(self):
        """quantity>1 → quantity × per_serving_total."""
        recipe = self._make_mock_recipe(prep_per=3, cook_per=2)
        product = self._make_mock_product(recipe)
        # per_serving=5, qty=5 → 5*5 = 25
        assert resolve_recipe_lead_minutes(product, quantity=5) == 25

    def test_per_serving_iki_porsiyon(self):
        """quantity=2 → 2 × per_serving_total."""
        recipe = self._make_mock_recipe(prep_per=2, cook_per=1)
        product = self._make_mock_product(recipe)
        # per_serving=3, qty=2 → 2*3 = 6
        assert resolve_recipe_lead_minutes(product, quantity=2) == 6

    def test_prep_time_minutes_cook_time_minutes_ignored(self):
        """prep_time_minutes / cook_time_minutes hesaplamaya katılmaz."""
        recipe = self._make_mock_recipe(prep=99, cook=99, prep_per=3, cook_per=2)
        product = self._make_mock_product(recipe)
        # prep=99,cook=99 IGNORED; per_serving=5, qty=3 → 3*5 = 15
        assert resolve_recipe_lead_minutes(product, quantity=3) == 15

    # ── Per-serving sıfır (fallback) ─────────────────────────────

    def test_per_serving_sifir_tek_porsiyon(self):
        """per_serving=0 → 0 (hemen gönder)."""
        recipe = self._make_mock_recipe(prep=10, cook=15, prep_per=0, cook_per=0)
        product = self._make_mock_product(recipe)
        assert resolve_recipe_lead_minutes(product, quantity=1) == 0

    def test_per_serving_sifir_cok_porsiyon(self):
        """per_serving=0, qty=5 → 0 (hemen gönder)."""
        recipe = self._make_mock_recipe(prep=10, cook=15, prep_per=0, cook_per=0)
        product = self._make_mock_product(recipe)
        assert resolve_recipe_lead_minutes(product, quantity=5) == 0

    # ── Kısmi per-serving ──────────────────────────────────────────

    def test_sadece_prep_per_serving(self):
        """Sadece prep_time_per_serving dolu, cook_per_serving=0."""
        recipe = self._make_mock_recipe(prep_per=4, cook_per=0)
        product = self._make_mock_product(recipe)
        # per_serving=4, qty=3 → 3*4 = 12
        assert resolve_recipe_lead_minutes(product, quantity=3) == 12

    def test_sadece_cook_per_serving(self):
        """Sadece cook_time_per_serving dolu, prep_per_serving=0."""
        recipe = self._make_mock_recipe(prep_per=0, cook_per=3)
        product = self._make_mock_product(recipe)
        # per_serving=3, qty=4 → 4*3 = 12
        assert resolve_recipe_lead_minutes(product, quantity=4) == 12

    # ── Edge cases ────────────────────────────────────────────────

    def test_product_recipe_yok(self):
        """Product'ta recipe yoksa 0 döner (zamanlama verisi yok)."""
        product = self._make_mock_product(recipe=None)
        assert resolve_recipe_lead_minutes(product) == 0

    def test_product_none(self):
        """Product None ise 0 döner."""
        assert resolve_recipe_lead_minutes(None) == 0

    def test_buyuk_miktar(self):
        """Yüksek quantity'de lead_time orantılı artar."""
        recipe = self._make_mock_recipe(prep_per=1, cook_per=1)
        product = self._make_mock_product(recipe)
        # per_serving=2, qty=10 → 10*2 = 20
        assert resolve_recipe_lead_minutes(product, quantity=10) == 20

    def test_varsayilan_quantity_bir(self):
        """quantity parametresi verilmezse 1 kabul edilir (geriye uyum)."""
        recipe = self._make_mock_recipe(prep_per=7, cook_per=5)
        product = self._make_mock_product(recipe)
        # per_serving=12, qty=1 → 1*12 = 12
        assert resolve_recipe_lead_minutes(product) == 12

    # ── Reçetesiz ürün senaryoları ─────────────────────────────────

    def test_recetesiz_urun_cok_porsiyon(self):
        """Reçete yok, quantity>1 → 0 (zamanlama verisi yok)."""
        product = self._make_mock_product(recipe=None)
        assert resolve_recipe_lead_minutes(product, quantity=5) == 0

    def test_recetesiz_urun_recipe_attr_sifir(self):
        """Product var, recipe attr None → 0."""
        product = MagicMock()
        product.recipe = None
        assert resolve_recipe_lead_minutes(product) == 0

    def test_recetesiz_urun_recipe_explicit_none(self):
        """Product.recipe = None → lead_time=0."""
        product = MagicMock(spec=['recipe'])
        product.recipe = None
        assert resolve_recipe_lead_minutes(product) == 0


class TestResolveCombinedStaticLeadMinutes:
    def _make_mock_recipe(self, prep_per=0, cook_per=0):
        recipe = MagicMock()
        recipe.prep_time_per_serving = prep_per
        recipe.cook_time_per_serving = cook_per
        return recipe

    def _make_component(self, name, prep_per=0, cook_per=0):
        comp = MagicMock()
        comp.name = name
        comp.recipe = self._make_mock_recipe(prep_per, cook_per) if (prep_per or cook_per) else None
        comp.category = MagicMock()
        comp.category.station = None
        return comp

    def _make_combined_item(self, product, quantity=1):
        ci = MagicMock()
        ci.product = product
        ci.quantity = quantity
        ci.product_unit_id = None
        ci.product_unit = None
        return ci

    def test_sum_of_component_recipe_times(self):
        drink = self._make_component("Kola", prep_per=2, cook_per=0)
        meal = self._make_component("Kebap", prep_per=5, cook_per=10)
        combo = MagicMock()
        combo.is_combined = True
        combo.recipe = None
        combo.combined_items.all.return_value = [
            self._make_combined_item(drink),
            self._make_combined_item(meal),
        ]
        assert resolve_combined_static_lead_minutes(combo, quantity=1) == 17

    def test_parent_recipe_takes_precedence(self):
        parent_recipe = self._make_mock_recipe(prep_per=3, cook_per=4)
        combo = MagicMock()
        combo.is_combined = True
        combo.recipe = parent_recipe
        combo.combined_items.all.return_value = []
        assert resolve_combined_static_lead_minutes(combo, quantity=2) == 14

    def test_no_recipe_components_returns_zero(self):
        drink = self._make_component("Kola")
        combo = MagicMock()
        combo.is_combined = True
        combo.recipe = None
        combo.combined_items.all.return_value = [self._make_combined_item(drink)]
        assert resolve_combined_static_lead_minutes(combo, quantity=1) == 0


class TestComputeFiringState:
    """compute_firing_state testleri."""

    def _make_item(self, status="PENDING", scheduled_start=None, firing_forced_at=None):
        item = MagicMock()
        item.status = status
        item.scheduled_start_time = scheduled_start
        item.firing_forced_at = firing_forced_at
        return item

    def test_pending_without_schedule_is_late(self):
        item = self._make_item(status="PENDING", scheduled_start=None)
        assert compute_firing_state(item) == "late"
