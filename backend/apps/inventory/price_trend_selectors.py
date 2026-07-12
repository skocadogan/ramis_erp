"""Stok kalemi fiyat artışı selector'ları — IN hareketlerinden son iki alış karşılaştırması."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import F, Window
from django.db.models.functions import RowNumber
from django.utils import timezone

from apps.inventory.models import StockMovement, StockMovementType
from core.branch_scope import user_accessible_warehouse_id_strings
from core.decimal_constants import ZERO_QTY


def _movement_price_rows(
    *,
    lookback_days: int,
    category_id: str | None = None,
    branch_id: str | None = None,
    user=None,
):
    since = timezone.now() - timedelta(days=max(lookback_days, 1))
    qs = (
        StockMovement.objects.filter(
            is_active=True,
            movement_type=StockMovementType.IN,
            unit_price__gt=ZERO_QTY,
            created_at__gte=since,
        )
        .annotate(
            rn=Window(
                expression=RowNumber(),
                partition_by=[F('stock_item_id')],
                order_by=F('created_at').desc(),
            ),
        )
        .filter(rn__lte=2)
        .select_related('stock_item', 'supplier', 'warehouse')
        .order_by('stock_item_id', '-created_at')
    )

    if category_id:
        qs = qs.filter(stock_item__category_id=category_id)

    if branch_id:
        qs = qs.filter(
            warehouse__branches__id=branch_id,
            warehouse__branches__is_active=True,
        ).distinct()

    if user is not None:
        allowed = user_accessible_warehouse_id_strings(user)
        if allowed is not None:
            qs = qs.filter(warehouse_id__in=allowed)

    return qs


def get_stock_items_with_price_increases(
    *,
    min_change_pct: Decimal | float = 5,
    lookback_days: int = 90,
    category_id: str | None = None,
    branch_id: str | None = None,
    user=None,
) -> list[dict]:
    """Son iki IN hareketine göre fiyatı artan stok kalemleri."""
    min_pct = Decimal(str(min_change_pct))
    movements = _movement_price_rows(
        lookback_days=lookback_days,
        category_id=category_id,
        branch_id=branch_id,
        user=user,
    )

    last_two: dict[str, list[StockMovement]] = {}
    for mv in movements.iterator(chunk_size=500):
        item_id = str(mv.stock_item_id)
        bucket = last_two.setdefault(item_id, [])
        if len(bucket) < 2:
            bucket.append(mv)

    rows: list[dict] = []
    for item_id, pair in last_two.items():
        if len(pair) < 2:
            continue
        current_mv, previous_mv = pair[0], pair[1]
        prev_price = previous_mv.unit_price or ZERO_QTY
        curr_price = current_mv.unit_price or ZERO_QTY
        if prev_price <= ZERO_QTY or curr_price <= prev_price:
            continue
        change_pct = ((curr_price - prev_price) / prev_price) * Decimal('100')
        if change_pct < min_pct:
            continue
        item = current_mv.stock_item
        rows.append({
            'stock_item_id': item_id,
            'name': item.name,
            'sku': item.sku,
            'unit': item.unit,
            'previous_price': str(prev_price),
            'current_price': str(curr_price),
            'change_pct': str(change_pct.quantize(Decimal('0.01'))),
            'last_purchase_date': current_mv.created_at.date().isoformat(),
            'supplier_name': current_mv.supplier.name if current_mv.supplier_id else None,
        })

    rows.sort(key=lambda r: Decimal(r['change_pct']), reverse=True)
    return rows


def summarize_price_increases(rows: list[dict]) -> dict:
    if not rows:
        return {
            'item_count': 0,
            'average_change_pct': None,
        }
    total = sum(Decimal(r['change_pct']) for r in rows)
    count = len(rows)
    return {
        'item_count': count,
        'average_change_pct': str((total / Decimal(count)).quantize(Decimal('0.01'))),
    }
