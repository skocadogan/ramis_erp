"""Okunur miktar metni — gereksiz ondalık sıfırları kaldırır. 
Örn: Decimal('19.000000') → '19', Decimal('1.500000') → '1.5', Decimal('2.000000') → '2'
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def format_quantity_display(
    value: Decimal | str | int | float | None,
    *,
    max_fraction_digits: int = 6,
) -> str:
    """
    Stok miktarını gösterim için biçimlendirir.

    Örnek: Decimal('19.000000') → '19', Decimal('1.500000') → '1.5'
    """
    if value is None:
        return '0'
    try:
        dec = value if isinstance(value, Decimal) else Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return str(value)
    if not dec.is_finite():
        return str(value)

    quant = Decimal('1').scaleb(-max_fraction_digits)
    normalized = dec.quantize(quant, rounding=ROUND_HALF_UP).normalize()
    text = format(normalized, 'f')
    if '.' in text:
        text = text.rstrip('0').rstrip('.')
    return text or '0'


def format_signed_quantity_display(
    value: Decimal | str | int | float | None,
    *,
    max_fraction_digits: int = 6,
) -> str:
    """İşaretli miktar: +2, -1.5"""
    if value is None:
        return '0'
    dec = value if isinstance(value, Decimal) else Decimal(str(value).strip())
    formatted = format_quantity_display(abs(dec), max_fraction_digits=max_fraction_digits)
    if dec > 0:
        return f'+{formatted}'
    if dec < 0:
        return f'-{formatted}'
    return formatted
