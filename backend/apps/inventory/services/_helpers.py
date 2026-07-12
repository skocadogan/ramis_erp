"""Inventory services için ortak yardımcı fonksiyonlar ve istisnalar."""

from __future__ import annotations
from decimal import Decimal, ROUND_HALF_UP

from core.decimal_constants import ZERO_QTY
from core.quantity_format import format_quantity_display

from django.utils.translation import gettext as _

from apps.inventory.models import StockItem, StockUnit
from apps.inventory.stock_minimum import ZERO_QTY


class InsufficientStockError(Exception):
    def __init__(self, item_name: str, available: Decimal, requested: Decimal):
        self.item_name = item_name
        self.available = available
        self.requested = requested
        msg = _(
            '"%(name)s" için yetersiz stok: Mevcut %(available)s, istenen %(requested)s'
        ) % {
            "name": item_name,
            "available": format_quantity_display(available),
            "requested": format_quantity_display(requested),
        }
        super().__init__(msg)


def normalize_quantity_to_item_unit(
    stock_item: StockItem, quantity: Decimal, unit: str | None
) -> tuple[Decimal, str, str]:
    """
    Miktarı StockItem.unit birimine normalize eder.
    Dönüş: (normalized_qty, normalized_unit, conversion_note_suffix)
    """
    orig_unit = unit or stock_item.unit
    if orig_unit == stock_item.unit:
        return quantity, stock_item.unit, ""

    from_u = StockUnit.objects.filter(short_name=orig_unit).first()
    to_u = StockUnit.objects.filter(short_name=stock_item.unit).first()
    if not from_u or not to_u:
        raise ValueError(
            _("Birim dönüşümü için StockUnit bulunamadı: %(from_u)s -> %(to_u)s")
            % {"from_u": orig_unit, "to_u": stock_item.unit}
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
                "→ '%(to_unit)s' (%(to_cat)s). "
                "Ağırlık birimi hacim birimine dönüştürülemez."
            )
            % {
                "from_unit": orig_unit,
                "from_cat": from_cat,
                "to_unit": stock_item.unit,
                "to_cat": to_cat,
            }
        )

    normalized = (
        (quantity * from_u.multiplier) / to_u.multiplier
    ).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    note = (
        f" (Birim dönüştürüldü: {format_quantity_display(quantity)} {orig_unit} → "
        f"{format_quantity_display(normalized)} {stock_item.unit})"
    )
    return normalized, stock_item.unit, note


def get_default_warehouse():
    """Varsayılan depoyu getirir."""
    from apps.warehouse.models import Warehouse

    warehouse = Warehouse.objects.filter(is_default=True).first()
    if not warehouse:
        warehouse = Warehouse.objects.first()
    return warehouse
