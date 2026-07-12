"""Yarı mamül (alt reçete) maliyet, verim ve stok genişletme yardımcıları."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import TYPE_CHECKING

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from core.decimal_constants import ZERO_MONEY, ZERO_QTY
from apps.inventory.models import StockUnit
from apps.inventory.stock_minimum import ZERO_QTY

if TYPE_CHECKING:
    from .models import Recipe, RecipeIngredient

_Q6 = Decimal("0.000001")


def normalize_quantity_between_units(
    quantity: Decimal,
    from_unit: str | None,
    to_unit: str | None,
) -> Decimal:
    """İki birim kısa adı arasında StockUnit çarpanları ile dönüşüm."""
    if not from_unit or not to_unit or from_unit == to_unit:
        return quantity
    from_u = StockUnit.objects.filter(short_name=from_unit).first()
    to_u = StockUnit.objects.filter(short_name=to_unit).first()
    if not from_u or not to_u:
        raise ValueError(
            _("Birim dönüşümü için StockUnit bulunamadı: %(from_u)s -> %(to_u)s")
            % {"from_u": from_unit, "to_u": to_unit}
        )
    from_cat = getattr(from_u, "category", None)
    to_cat = getattr(to_u, "category", None)
    if (
        from_cat
        and to_cat
        and from_cat not in ("OTHER", "")
        and to_cat not in ("OTHER", "")
        and from_cat != to_cat
    ):
        raise ValueError(
            _(
                "Birim kategorisi uyuşmazlığı: '%(from_unit)s' (%(from_cat)s) "
                "→ '%(to_unit)s' (%(to_cat)s)."
            )
            % {
                "from_unit": from_unit,
                "from_cat": from_cat,
                "to_unit": to_unit,
                "to_cat": to_cat,
            }
        )
    return ((quantity * from_u.multiplier) / to_u.multiplier).quantize(_Q6, rounding=ROUND_HALF_UP)


def recipe_total_yield_normalized(recipe: Recipe) -> Decimal:
    """
    Reçetenin toplam çıktı miktarını `serving_unit` cinsinden döndürür.
    serving_quantity × servings; birim tanımsızsa porsiyon sayısına düşer.
    """
    servings = Decimal(str(recipe.servings or 1))
    if servings <= 0:
        servings = Decimal("1")
    if recipe.serving_quantity and recipe.serving_unit:
        per = Decimal(str(recipe.serving_quantity))
        return (per * servings).quantize(_Q6, rounding=ROUND_HALF_UP)
    return servings.quantize(_Q6, rounding=ROUND_HALF_UP)


def recipe_yield_unit(recipe: Recipe) -> str:
    if recipe.serving_unit:
        return recipe.serving_unit
    return "porsiyon"


def detect_recipe_cycle(parent_recipe_id, sub_recipe_id, *, _visited: set | None = None) -> bool:
    """Alt reçete eklendiğinde döngü oluşup oluşmayacağını kontrol eder."""
    from .models import RecipeIngredient

    if parent_recipe_id == sub_recipe_id:
        return True
    if _visited is None:
        _visited = set()
    if sub_recipe_id in _visited:
        return True
    _visited.add(sub_recipe_id)
    child_ids = RecipeIngredient.objects.filter(
        recipe_id=sub_recipe_id,
        sub_recipe_id__isnull=False,
        is_active=True,
    ).values_list("sub_recipe_id", flat=True)
    for cid in child_ids:
        if cid == parent_recipe_id or detect_recipe_cycle(parent_recipe_id, cid, _visited=_visited):
            return True
    return False


def compute_sub_recipe_line_cost(ingredient: RecipeIngredient) -> Decimal:
    """Alt reçete satır maliyeti: kullanılan miktar / toplam verim × alt reçete maliyeti."""
    sub = ingredient.sub_recipe
    if not sub:
        return ZERO_MONEY
    total_yield = recipe_total_yield_normalized(sub)
    if total_yield <= 0:
        return ZERO_MONEY
    yield_unit = recipe_yield_unit(sub)
    used = ingredient.normalized_quantity
    if ingredient.unit and yield_unit != "porsiyon":
        try:
            used = normalize_quantity_between_units(ingredient.quantity, ingredient.unit, yield_unit)
        except ValueError:
            used = ingredient.normalized_quantity
    ratio = (used / total_yield).quantize(_Q6, rounding=ROUND_HALF_UP)
    return (ratio * compute_recipe_total_cost(sub)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_recipe_total_cost(recipe: Recipe, *, _visited: set | None = None) -> Decimal:
    """Reçete toplam maliyeti; alt reçeteleri özyinelemeli hesaba katar."""
    if _visited is None:
        _visited = set()
    if recipe.id in _visited:
        return ZERO_MONEY
    _visited.add(recipe.id)
    total = ZERO_MONEY
    for ingredient in recipe.ingredients.filter(is_active=True).select_related(
        "stock_item", "sub_recipe"
    ):
        if ingredient.stock_item_id:
            total += ingredient.line_cost_stock()
        elif ingredient.sub_recipe_id:
            total += compute_sub_recipe_line_cost(ingredient)
    _visited.discard(recipe.id)
    return total


def expand_recipe_to_stock_requirements(
    recipe: Recipe,
    batch_multiplier: Decimal,
    warehouse_id,
    required: dict[tuple, Decimal],
    visited: set | None = None,
) -> None:
    """
    Reçeteyi stok kalemi ihtiyaçlarına düzleştirir.
    batch_multiplier: satılan porsiyon / reçete porsiyon sayısı (line_qty / servings).
    """
    if warehouse_id is None:
        return
    if visited is None:
        visited = set()
    if recipe.id in visited:
        raise ValidationError(_("Reçete döngüsü tespit edildi: %(name)s") % {"name": recipe.name})
    visited.add(recipe.id)

    ingredients = list(
        recipe.ingredients.filter(is_active=True).select_related("stock_item", "sub_recipe")
    )
    for ingredient in ingredients:
        if ingredient.stock_item_id:
            qty = (ingredient.normalized_quantity * batch_multiplier).quantize(
                _Q6, rounding=ROUND_HALF_UP
            )
            required[(warehouse_id, ingredient.stock_item_id)] += qty
        elif ingredient.sub_recipe_id:
            sub = ingredient.sub_recipe
            total_yield = recipe_total_yield_normalized(sub)
            if total_yield <= 0:
                continue
            yield_unit = recipe_yield_unit(sub)
            used_in_batch = ingredient.normalized_quantity
            if ingredient.unit and yield_unit != "porsiyon":
                try:
                    used_in_batch = normalize_quantity_between_units(
                        ingredient.quantity, ingredient.unit, yield_unit
                    )
                except ValueError:
                    used_in_batch = ingredient.normalized_quantity
            sub_multiplier = (used_in_batch / total_yield * batch_multiplier).quantize(
                _Q6, rounding=ROUND_HALF_UP
            )
            expand_recipe_to_stock_requirements(
                sub, sub_multiplier, warehouse_id, required, visited
            )

    visited.discard(recipe.id)


def build_stock_requirements_from_recipe(
    recipe: Recipe,
    line_qty: Decimal,
    warehouse_id,
) -> dict[tuple, Decimal]:
    """Tek reçete + satış adedi için (warehouse_id, stock_item_id) → miktar sözlüğü."""
    required: dict[tuple, Decimal] = defaultdict(lambda: ZERO_QTY)
    servings = Decimal(str(recipe.servings or 1))
    if servings <= 0:
        servings = Decimal("1")
    batch_multiplier = (line_qty / servings).quantize(_Q6, rounding=ROUND_HALF_UP)
    expand_recipe_to_stock_requirements(recipe, batch_multiplier, warehouse_id, required)
    return required
