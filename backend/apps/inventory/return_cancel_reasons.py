"""Depo stok iade/iptal neden kodları."""

from django.utils.translation import gettext_lazy as _

STOCK_RETURN_CANCEL_REASON_CODES = (
    'EXPIRED',
    'DAMAGED',
    'SUPPLIER_ERROR',
    'ORDER_CANCELLED',
    'QUALITY_ISSUE',
    'RECALL',
    'OTHER',
)

STOCK_RETURN_CANCEL_REASON_LABELS = {
    'EXPIRED': _('SKT Geçmiş'),
    'DAMAGED': _('Hasarlı / Bozuk'),
    'SUPPLIER_ERROR': _('Tedarikçi Hatası'),
    'ORDER_CANCELLED': _('Sipariş İptali'),
    'QUALITY_ISSUE': _('Kalite Sorunu'),
    'RECALL': _('Geri Çağırma'),
    'OTHER': _('Diğer'),
}


def normalize_reason_code(raw: str | None) -> str | None:
    if not raw:
        return None
    code = str(raw).strip().upper()
    if code in STOCK_RETURN_CANCEL_REASON_LABELS:
        return code
    return None


def format_reason_display(code: str | None, text: str | None = None) -> str:
    normalized = normalize_reason_code(code)
    if normalized:
        label = str(STOCK_RETURN_CANCEL_REASON_LABELS[normalized])
        extra = (text or '').strip()
        if extra and normalized == 'OTHER':
            return extra
        if extra:
            return f'{label} — {extra}'
        return label
    return (text or '').strip() or '—'
