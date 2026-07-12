"""FEFO lot tüketim simülasyonu ve gerçek tüketim yardımcıları."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import TYPE_CHECKING

from core.decimal_constants import ZERO_MONEY, ZERO_QTY

if TYPE_CHECKING:
    from apps.inventory.models import StockLot


@dataclass(frozen=True)
class ConsumedLotLine:
    """Tüketilen tek lot satırı (snapshot alanları dahil)."""

    lot_id: object | None
    lot_number: str
    expiry_date: object | None
    quantity: Decimal
    unit_price: Decimal

    @property
    def line_total(self) -> Decimal:
        return (self.quantity * self.unit_price).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )


@dataclass(frozen=True)
class FefoConsumptionResult:
    """FEFO tüketim sonucu."""

    lines: list[ConsumedLotLine]
    remaining: Decimal
    neg_lot_quantity: Decimal = ZERO_QTY
    neg_lot_unit_price: Decimal = ZERO_MONEY


from django.db.models import Case, F, IntegerField, Value, When
from django.db.models.functions import Now


def order_lots_fefo(lots_qs):
    """Aktif lotları FEFO sırasına göre döndürür (aktif boost öncelikli)."""
    return lots_qs.filter(quantity__gt=0, is_active=True).order_by(
        Case(
            When(fefo_priority_until__gt=Now(), then=-F('fefo_priority_boost')),
            default=Value(0),
            output_field=IntegerField(),
        ),
        'expiry_date',
        'received_at',
    )


def weighted_unit_price_from_lines(
    lines: list[ConsumedLotLine],
    total_qty: Decimal,
) -> Decimal:
    """Tüketim satırlarından ağırlıklı ortalama birim fiyat."""
    if not lines or total_qty <= 0:
        return ZERO_MONEY
    total_value = sum((line.quantity * line.unit_price for line in lines), ZERO_MONEY)
    return (total_value / total_qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _line_from_lot(lot: StockLot, quantity: Decimal) -> ConsumedLotLine:
    return ConsumedLotLine(
        lot_id=lot.id,
        lot_number=lot.lot_number or "",
        expiry_date=lot.expiry_date,
        quantity=quantity,
        unit_price=lot.unit_price or ZERO_MONEY,
    )


def simulate_fefo_consumption(
    lots: list[StockLot],
    quantity: Decimal,
    *,
    fallback_price: Decimal = ZERO_MONEY,
) -> FefoConsumptionResult:
    """Salt okunur FEFO tüketim simülasyonu (lot miktarlarını değiştirmez)."""
    remaining = quantity
    lines: list[ConsumedLotLine] = []

    for lot in lots:
        if remaining <= 0:
            break
        available = lot.quantity or ZERO_QTY
        if available <= 0:
            continue
        consume = min(available, remaining)
        lines.append(_line_from_lot(lot, consume))
        remaining -= consume

    neg_qty = ZERO_QTY
    if remaining > 0:
        neg_qty = remaining

    return FefoConsumptionResult(
        lines=lines,
        remaining=remaining,
        neg_lot_quantity=neg_qty,
        neg_lot_unit_price=fallback_price if neg_qty > 0 else ZERO_MONEY,
    )


def consume_lots_fefo(
    lots_qs,
    quantity: Decimal,
    *,
    allow_negative: bool = False,
    fallback_price: Decimal = ZERO_MONEY,
) -> FefoConsumptionResult:
    """Lot miktarlarını FEFO sırasıyla düşürür ve tüketim satırlarını döndürür."""
    remaining = quantity
    lines: list[ConsumedLotLine] = []

    for lot in order_lots_fefo(lots_qs):
        if remaining <= 0:
            break
        consume = min(lot.quantity, remaining)
        lot.quantity -= consume
        lot.save(update_fields=["quantity", "updated_at"])
        lines.append(_line_from_lot(lot, consume))
        remaining -= consume

    neg_qty = ZERO_QTY
    if remaining > 0 and allow_negative:
        neg_qty = remaining
        remaining = ZERO_QTY

    return FefoConsumptionResult(
        lines=lines,
        remaining=remaining,
        neg_lot_quantity=neg_qty,
        neg_lot_unit_price=fallback_price if neg_qty > 0 else ZERO_MONEY,
    )
