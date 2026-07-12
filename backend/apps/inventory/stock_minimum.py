"""
Minimum stok eşiği: -1 = sınırsız (kritik stok / minimum kontrollerinde dikkate alınmaz).

DRY: Tüm ORM filtreleri ve Python kontrolleri bu modüldeki sabit ve yardımcılar üzerinden yapılmalıdır.

Düşük/kritik stok kuralı: mevcut miktar minimumun **altında** olmalıdır (eşitlik dahil değil).
Minimum = 0 veya -1 (sınırsız) ise eşik uygulanmaz — otomatik eksik listesi koşulları ile uyumlu.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db.models import F, Q
from django.utils.translation import gettext_lazy as _

from core.decimal_constants import ZERO_QTY

# Stok kalemi veya depo seviyesinde: bu değer = minimum eşik yok
MINIMUM_UNLIMITED_SENTINEL = Decimal('-1')


def is_minimum_unlimited(value) -> bool:
    """True ise kritik stok, düşük stok ve POS kritik uyarıları uygulanmaz."""
    if value is None:
        return False
    try:
        return Decimal(str(value)) == MINIMUM_UNLIMITED_SENTINEL
    except (InvalidOperation, ValueError, TypeError):
        return False


def normalize_minimum_quantity(value) -> Decimal:
    """
    API / form değerini doğrular.
    -1 = sınırsız; aksi halde >= 0 olmalıdır.
    """
    if value is None:
        return ZERO_QTY
    try:
        v = value if isinstance(value, Decimal) else Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError) as e:
        raise ValueError(_('Geçersiz minimum miktar.')) from e
    if v == MINIMUM_UNLIMITED_SENTINEL:
        return MINIMUM_UNLIMITED_SENTINEL
    if v < 0:
        raise ValueError(
            _('Minimum miktar -1 (sınırsız) veya sıfırdan büyük olmalıdır.'),
        )
    return v


def _to_decimal(value) -> Decimal | None:
    if value is None:
        return None
    try:
        return value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def has_positive_minimum_threshold(minimum_quantity) -> bool:
    """
    İzlenen pozitif minimum eşik var mı?
    -1 (sınırsız) ve 0 hariç — otomatik eksik listesi önkoşulu ile aynı.
    """
    if is_minimum_unlimited(minimum_quantity):
        return False
    min_q = _to_decimal(minimum_quantity)
    if min_q is None:
        return False
    return min_q > ZERO_QTY


def is_quantity_below_minimum(quantity, minimum_quantity) -> bool:
    """
    Düşük/kritik stok: mevcut miktar minimumun altında (eşit değil).
    """
    if not has_positive_minimum_threshold(minimum_quantity):
        return False
    qty = _to_decimal(quantity)
    min_q = _to_decimal(minimum_quantity)
    if qty is None or min_q is None:
        return False
    return qty < min_q


def _q_tracked_minimum_field(field_name: str) -> Q:
    """Sınırsız (-1) ve sıfır minimum hariç pozitif eşik filtresi."""
    return Q(**{f'{field_name}__gt': MINIMUM_UNLIMITED_SENTINEL}) & Q(**{f'{field_name}__gt': ZERO_QTY})


def q_low_stock_warehouse_level():
    """
    WarehouseStockLevel: düşük/kritik sayılacak satırlar.
    quantity < minimum_quantity; sınırsız ve minimum=0 hariç.
    """
    return _q_tracked_minimum_field('minimum_quantity') & Q(quantity__lt=F('minimum_quantity'))


def q_low_stock_stock_item_vs_annotated_current():
    """
    StockItem üzerinde current_quantity annotate edilmişken:
    current_quantity < minimum_quantity (sınırsız / min=0 hariç).
    """
    return _q_tracked_minimum_field('minimum_quantity') & Q(
        current_quantity__lt=F('minimum_quantity'),
    )


def q_low_stock_vs_effective_minimum():
    """
    StockItem üzerinde effective_minimum annotate edilmişken:
    current_quantity < effective_minimum (sınırsız / min=0 hariç).
    """
    return _q_tracked_minimum_field('effective_minimum') & Q(
        current_quantity__lt=F('effective_minimum'),
    )


def quantity_at_warehouse_level(level) -> Decimal:
    """
    Depoda kayıtlı miktar; seviye yoksa 0.
    POS / transfer öncesi kontrollerde tekrarlanan `level.quantity if level else 0` mantığı.
    """
    if level is None:
        return ZERO_QTY
    return level.quantity


def minimum_quantity_for_display(level, stock_item) -> Decimal:
    """
    Minimum eşik: önce depo seviyesi, yoksa stok kalemi (POS uyarı metinleri ile uyumlu).
    """
    if level is not None:
        return level.minimum_quantity
    if stock_item is None:
        return ZERO_QTY
    return stock_item.minimum_quantity or ZERO_QTY


def effective_minimum_for_critical_alert(level, stock_item) -> Decimal | None:
    """
    POS / mutfak kritik stok uyarısı için eşik.
    Depo seviyesi varsa o; yoksa kalem minimumu.
    Herhangi birinde -1 ise None (kritik eşik yok).
    """
    if level is not None:
        if is_minimum_unlimited(level.minimum_quantity):
            return None
        return level.minimum_quantity
    if stock_item is None:
        return None
    if is_minimum_unlimited(stock_item.minimum_quantity):
        return None
    return stock_item.minimum_quantity or ZERO_QTY
