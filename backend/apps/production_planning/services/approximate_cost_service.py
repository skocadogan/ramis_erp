"""Üretim planı yaklaşık maliyet (FEFO) hesaplama servisi."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db import models
from django.utils.translation import gettext as _

from core.decimal_constants import ZERO_MONEY, ZERO_QTY
from apps.inventory.fefo_cost import estimate_fefo_consumption_unit_price
from apps.production_planning.models import ProductionPlan


def _resolve_kitchen_warehouse(plan: ProductionPlan):
    from apps.warehouse.models import Warehouse, WarehouseType

    kitchen_wh = Warehouse.objects.filter(
        branches__id=plan.branch_id,
        warehouse_type=WarehouseType.KITCHEN,
        is_active=True,
    ).first()
    if not kitchen_wh:
        from apps.inventory.services._helpers import get_default_warehouse

        kitchen_wh = get_default_warehouse()
    return kitchen_wh


def compute_fefo_recipe_total_cost(
    recipe,
    warehouse_id,
    *,
    price_cache: dict | None = None,
    _visited: set | None = None,
) -> Decimal:
    """Reçete toplam maliyeti — stok satırlarında FEFO birim fiyat kullanır."""
    from apps.recipes.recipe_expansion import (
        normalize_quantity_between_units,
        recipe_total_yield_normalized,
        recipe_yield_unit,
    )

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
            qty = ingredient.normalized_quantity
            if qty is None:
                qty = ingredient.quantity or ZERO_QTY
            unit_price = estimate_fefo_consumption_unit_price(
                ingredient.stock_item_id,
                warehouse_id,
                qty,
                cache=price_cache,
            )
            total += (qty * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        elif ingredient.sub_recipe_id:
            sub = ingredient.sub_recipe
            sub_total = compute_fefo_recipe_total_cost(
                sub, warehouse_id, price_cache=price_cache, _visited=_visited
            )
            total_yield = recipe_total_yield_normalized(sub)
            if total_yield <= 0:
                continue
            yield_unit = recipe_yield_unit(sub)
            used = ingredient.normalized_quantity
            if ingredient.unit and yield_unit != "porsiyon":
                try:
                    used = normalize_quantity_between_units(
                        ingredient.quantity, ingredient.unit, yield_unit
                    )
                except ValueError:
                    used = ingredient.normalized_quantity
            ratio = (used / total_yield).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            total += (ratio * sub_total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    _visited.discard(recipe.id)
    return total


def compute_fefo_cost_per_serving(recipe, warehouse_id, *, price_cache: dict | None = None) -> Decimal:
    """Reçete porsiyon başı FEFO maliyeti."""
    servings = Decimal(str(recipe.servings or 1))
    if servings <= 0:
        servings = Decimal("1")
    total = compute_fefo_recipe_total_cost(recipe, warehouse_id, price_cache=price_cache)
    if total <= 0:
        return ZERO_MONEY
    return (total / servings).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def expand_fefo_ingredients_for_line(
    recipe,
    portion_qty: Decimal,
    warehouse_id,
    *,
    price_cache: dict | None = None,
) -> list[dict]:
    """
    Plan satırı miktarı için reçeteyi stok kalemlerine düzleştirir;
    her kalemde FEFO birim fiyat ve satır toplamı döner.
    """
    from apps.recipes.recipe_expansion import build_stock_requirements_from_recipe
    from apps.inventory.models import StockItem

    if not recipe or not warehouse_id:
        return []

    required = build_stock_requirements_from_recipe(recipe, portion_qty, warehouse_id)
    if not required:
        return []

    stock_item_ids = {sid for (_, sid) in required.keys()}
    stock_items = {
        si.id: si
        for si in StockItem.objects.filter(id__in=stock_item_ids).only("id", "name", "unit")
    }

    rows: list[dict] = []
    for (_, stock_item_id), req_qty in required.items():
        stock_item = stock_items.get(stock_item_id)
        if not stock_item:
            continue
        unit_price = estimate_fefo_consumption_unit_price(
            stock_item_id, warehouse_id, req_qty, cache=price_cache
        )
        line_total = (req_qty * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        rows.append(
            {
                "stock_item_id": str(stock_item_id),
                "stock_item_name": stock_item.name,
                "unit": stock_item.unit or "",
                "quantity": req_qty,
                "unit_cost": unit_price,
                "line_total": line_total,
            }
        )

    rows.sort(key=lambda x: x["stock_item_name"])
    return rows


def calculate_approximate_cost_for_plan(
    plan_id: str,
    station_id: str | None = None,
    *,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Üretim planı satırları için FEFO bazlı yaklaşık maliyet hesaplar.
    Sayfalanmış `items` döner; `grand_total` tüm satırlar üzerinden hesaplanır.
    """
    try:
        plan = ProductionPlan.objects.filter(is_active=True).select_related("branch").get(id=plan_id)
    except ProductionPlan.DoesNotExist:
        return {"error": _("Plan bulunamadı.")}

    kitchen_wh = _resolve_kitchen_warehouse(plan)
    warehouse_id = kitchen_wh.id if kitchen_wh else None
    warehouse_name = kitchen_wh.name if kitchen_wh else _("Bilinmiyor")

    lines_qs = (
        plan.lines.filter(is_active=True)
        .select_related("product__recipe", "product__category__station", "station")
        .order_by("product__name")
    )
    if station_id:
        lines_qs = lines_qs.filter(
            models.Q(station_id=station_id) | models.Q(product__category__station_id=station_id)
        )

    price_cache: dict = {}
    all_items: list[dict] = []
    grand_total = ZERO_MONEY

    for line in lines_qs:
        recipe = getattr(line.product, "recipe", None)
        station = line.station or getattr(line.product.category, "station", None)
        station_name = station.name if station else _("Bilinmiyor")

        qty = line.target_quantity or ZERO_QTY
        unit_cost = ZERO_MONEY
        has_recipe = bool(recipe)
        ingredients: list[dict] = []
        if recipe and warehouse_id:
            unit_cost = compute_fefo_cost_per_serving(recipe, warehouse_id, price_cache=price_cache)
            ingredients = expand_fefo_ingredients_for_line(
                recipe,
                qty,
                warehouse_id,
                price_cache=price_cache,
            )

        line_total = (unit_cost * qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        grand_total += line_total

        all_items.append(
            {
                "line_id": str(line.id),
                "product_id": str(line.product_id),
                "product_name": line.product.name,
                "station_id": str(station.id) if station else None,
                "station_name": station_name,
                "quantity": qty,
                "unit_cost": unit_cost,
                "line_total": line_total,
                "has_recipe": has_recipe,
                "ingredients": ingredients,
            }
        )

    total_count = len(all_items)
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    start = (page - 1) * page_size
    end = start + page_size
    page_items = all_items[start:end]
    has_next = end < total_count

    return {
        "plan_id": str(plan.id),
        "plan_date": plan.plan_date.isoformat() if plan.plan_date else None,
        "branch_id": str(plan.branch_id),
        "branch_name": plan.branch.name if plan.branch else "",
        "warehouse_id": str(warehouse_id) if warehouse_id else None,
        "warehouse_name": warehouse_name,
        "station_id": station_id,
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "has_next": has_next,
        "next_page": page + 1 if has_next else None,
        "grand_total": grand_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "items": page_items,
    }
