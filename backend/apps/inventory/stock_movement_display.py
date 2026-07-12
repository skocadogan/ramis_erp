"""Stok hareketi gösterim yardımcıları — işaretli miktar hesabı."""


import re
from decimal import Decimal, InvalidOperation

from apps.inventory.models import StockMovementType

_ADJUSTMENT_DIFF_RE = re.compile(r':\s*([+-]?\d+(?:\.\d+)?)\s*$')


def get_stock_movement_signed_quantity(movement) -> Decimal:
    """
    Hareketin stok üzerindeki net etkisini döndürür.

    ADJUSTMENT kayıtlarında ``quantity`` mutlak değer olarak tutulur; işaret
    ``reference`` alanındaki fark değerinden okunur (ör. ``Sayım düzeltmesi: -105``).
    """
    qty = movement.quantity if movement.quantity is not None else Decimal('0')
    movement_type = movement.movement_type

    if movement_type == StockMovementType.ADJUSTMENT:
        ref = (movement.reference or '').strip()
        match = _ADJUSTMENT_DIFF_RE.search(ref)
        if match:
            try:
                return Decimal(match.group(1))
            except InvalidOperation:
                pass
        return qty

    if movement_type in (StockMovementType.IN, StockMovementType.RETURN):
        return abs(qty)

    if movement_type in (
        StockMovementType.OUT,
        StockMovementType.WASTE,
        StockMovementType.CANCEL,
        StockMovementType.DISPOSAL,
    ):
        return -abs(qty)

    return qty
