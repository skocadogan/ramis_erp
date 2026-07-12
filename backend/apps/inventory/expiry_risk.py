"""SKT lot risk skoru hesaplama (salt okuma)."""

from __future__ import annotations

from decimal import Decimal

from core.decimal_constants import ZERO_MONEY, ZERO_QTY


def _days_base_score(days_until_expiry: int | None, *, is_expired: bool) -> int:
    if is_expired:
        return 100
    if days_until_expiry is None:
        return 30
    if days_until_expiry <= 0:
        return 100
    if days_until_expiry <= 1:
        return 90
    if days_until_expiry <= 3:
        return 70
    if days_until_expiry <= 7:
        return 50
    return 30


def compute_lot_risk_score(
    lot,
    *,
    recipe_usage_count: int = 0,
) -> int:
    """
    0–100 arası risk skoru; yüksek = daha acil.
    """
    qty = lot.quantity or ZERO_QTY
    unit_price = lot.unit_price or ZERO_MONEY
    try:
        stock_value = float(qty * unit_price)
    except (TypeError, ValueError):
        stock_value = 0.0

    value_factor = min(20, int(stock_value / 1000))
    recipe_factor = min(10, recipe_usage_count * 2)
    base = _days_base_score(lot.days_until_expiry, is_expired=lot.is_expired)

    return min(100, base + value_factor + recipe_factor)


def batch_recipe_usage_counts(stock_item_ids: list) -> dict[str, int]:
    """Stok kalemi başına aktif reçete kullanım sayısı."""
    if not stock_item_ids:
        return {}
    from django.db.models import Count
    from apps.recipes.models import RecipeIngredient

    agg = (
        RecipeIngredient.objects.filter(
            stock_item_id__in=stock_item_ids,
            is_active=True,
        )
        .values('stock_item_id')
        .annotate(cnt=Count('recipe_id', distinct=True))
    )
    return {str(row['stock_item_id']): row['cnt'] for row in agg}
