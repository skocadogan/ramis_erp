"""FEFO (lot bazlı) birim maliyet hesapları."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from core.decimal_constants import ZERO_MONEY, ZERO_QTY

from apps.inventory.services.lot_consumption_service import (
    order_lots_fefo,
    simulate_fefo_consumption,
    weighted_unit_price_from_lines,
)

_FefoPriceCache = dict[tuple, Decimal]
_ConsumptionPriceCache = dict[tuple, Decimal]


def _fallback_item_unit_price(stock_item_id) -> Decimal:
    from apps.inventory.models import StockItem

    item = StockItem.objects.filter(id=stock_item_id).only(
        "last_purchase_price", "average_cost"
    ).first()
    if item:
        return item.last_purchase_price or item.average_cost or ZERO_MONEY
    return ZERO_MONEY


def get_fefo_unit_price(
    stock_item_id,
    warehouse_id,
    *,
    cache: _FefoPriceCache | None = None,
) -> Decimal:
    """
    Belirtilen depodaki stok kalemi için kalan lotların ağırlıklı ortalama birim fiyatı
    (envanter değerlemesi). Tüketim maliyeti için estimate_fefo_consumption_unit_price kullanın.
    """
    cache_key = (stock_item_id, warehouse_id)
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    from apps.inventory.models import StockLot

    lots = StockLot.objects.filter(
        stock_item_id=stock_item_id,
        warehouse_id=warehouse_id,
        is_active=True,
        quantity__gt=0,
    ).only("quantity", "unit_price")

    total_qty = ZERO_QTY
    total_value = ZERO_MONEY
    for lot in lots:
        qty = lot.quantity or ZERO_QTY
        price = lot.unit_price or ZERO_MONEY
        total_qty += qty
        total_value += qty * price

    if total_qty > 0:
        unit_price = (total_value / total_qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        unit_price = _fallback_item_unit_price(stock_item_id)

    if cache is not None:
        cache[cache_key] = unit_price
    return unit_price


def get_next_fefo_unit_price(
    stock_item_id,
    warehouse_id,
    *,
    cache: _FefoPriceCache | None = None,
) -> Decimal:
    """Sırada tüketilecek ilk aktif lotun birim fiyatı."""
    cache_key = ("next", stock_item_id, warehouse_id)
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    from apps.inventory.models import StockLot

    first_lot = order_lots_fefo(
        StockLot.objects.filter(
            stock_item_id=stock_item_id,
            warehouse_id=warehouse_id,
        )
    ).only("unit_price").first()

    if first_lot:
        unit_price = first_lot.unit_price or ZERO_MONEY
    else:
        unit_price = _fallback_item_unit_price(stock_item_id)

    if cache is not None:
        cache[cache_key] = unit_price
    return unit_price


def estimate_fefo_consumption_unit_price(
    stock_item_id,
    warehouse_id,
    quantity: Decimal,
    *,
    cache: _ConsumptionPriceCache | None = None,
) -> Decimal:
    """
    Belirli miktar tüketildiğinde FEFO sırasına göre oluşacak ağırlıklı birim maliyet
    (salt okunur simülasyon).
    """
    if quantity <= 0:
        return ZERO_MONEY

    cache_key = (stock_item_id, warehouse_id, str(quantity))
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    from apps.inventory.models import StockLot

    lots = list(
        order_lots_fefo(
            StockLot.objects.filter(
                stock_item_id=stock_item_id,
                warehouse_id=warehouse_id,
            )
        ).only("id", "lot_number", "expiry_date", "quantity", "unit_price")
    )
    fallback = _fallback_item_unit_price(stock_item_id)
    result = simulate_fefo_consumption(lots, quantity, fallback_price=fallback)

    if result.lines:
        unit_price = weighted_unit_price_from_lines(result.lines, quantity)
    elif result.neg_lot_quantity > 0:
        unit_price = result.neg_lot_unit_price or fallback
    else:
        unit_price = fallback

    if cache is not None:
        cache[cache_key] = unit_price
    return unit_price
