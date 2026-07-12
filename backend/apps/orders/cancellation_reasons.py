"""İptal / iade gerekçe kodları — Django locale (django.po) üzerinden çevrilir."""
from django.db import models
from django.utils.translation import gettext_lazy as _

CANCELLATION_REASON_CODES = (
    'MISTAKE',
    'CUSTOMER_CANCEL',
    'OUT_OF_STOCK',
    'KITCHEN_ERROR',
    'QUALITY_ISSUE',
    'OTHER',
)

SALE_VOID_REASON_CODE = 'SALE_VOID'
WAITER_CANCEL_REASON_CODE = 'WAITER_CANCEL'
SMART_TABLE_CANCEL_SOURCE = 'smart_table'
SMART_TABLE_CANCEL_AUDIT_TEXT = _('Müşteri Smart Table üzerinden iptal etti')

CANCELLATION_REASON_LABELS = {
    'MISTAKE': _('Yanlış Sipariş / Giriş Hatası'),
    'CUSTOMER_CANCEL': _('Müşteri Vazgeçti'),
    'OUT_OF_STOCK': _('Ürün Kalmadı (86)'),
    'KITCHEN_ERROR': _('Mutfak Hatası'),
    'QUALITY_ISSUE': _('Kalite / Şikayet'),
    'OTHER': _('Diğer (Açıklama Yazınız)'),
    SALE_VOID_REASON_CODE: _('Satış iptali (iade)'),
    WAITER_CANCEL_REASON_CODE: _('Garson tarafından iptal'),
}

# Eski mobil istemci camelCase kodları → kanonik kod
CANCELLATION_REASON_ALIASES = {
    'mistake': 'MISTAKE',
    'customercancel': 'CUSTOMER_CANCEL',
    'outofstock': 'OUT_OF_STOCK',
    'kitchenerror': 'KITCHEN_ERROR',
    'qualityissue': 'QUALITY_ISSUE',
    'other': 'OTHER',
}


def _canonical_reason_key(value):
    """Karşılaştırma için: outOfStock / OUT_OF_STOCK → outofstock"""
    return str(value).strip().replace('_', '').lower()


def normalize_cancellation_reason_code(code):
    """Mobil (camelCase) ve web (SCREAMING_SNAKE) kodlarını tek forma çevirir."""
    if code is None:
        return None
    raw = str(code).strip()
    if not raw:
        return None
    if raw in CANCELLATION_REASON_LABELS:
        return raw
    alias = CANCELLATION_REASON_ALIASES.get(_canonical_reason_key(raw))
    if alias:
        return alias
    upper = raw.upper()
    if upper in CANCELLATION_REASON_LABELS:
        return upper
    return raw


def _is_known_reason_code(value):
    normalized = normalize_cancellation_reason_code(value)
    return bool(normalized and normalized in CANCELLATION_REASON_LABELS)


def normalize_cancellation_reason_inputs(code=None, text=None):
    """Kayıt öncesi reason_code / reason_text alanlarını normalize eder."""
    normalized_code = normalize_cancellation_reason_code(code)
    stripped_text = str(text).strip() if text else ''

    if not normalized_code and stripped_text and _is_known_reason_code(stripped_text):
        normalized_code = normalize_cancellation_reason_code(stripped_text)
        stripped_text = ''

    if stripped_text and _is_known_reason_code(stripped_text):
        if not normalized_code:
            normalized_code = normalize_cancellation_reason_code(stripped_text)
        stripped_text = ''

    return normalized_code, stripped_text or None


def get_cancellation_reason_label(code):
    if not code:
        return ''
    normalized = normalize_cancellation_reason_code(code)
    label = CANCELLATION_REASON_LABELS.get(normalized)
    if label is not None:
        return str(label)
    return str(code)


def format_cancellation_reason_display(code=None, text=None):
    """UI ile uyumlu: önce detay metni, yoksa kodun yerelleştirilmiş karşılığı."""
    if text and str(text).strip():
        stripped = str(text).strip()
        if _is_known_reason_code(stripped):
            return get_cancellation_reason_label(stripped)
        return stripped
    if code:
        return get_cancellation_reason_label(code)
    return ''


def user_is_smart_table_actor(user) -> bool:
    """Akıllı Masa (Smart Table) rolüne sahip kullanıcı mı?"""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if not hasattr(user, 'roles'):
        return False
    return user.roles.filter(is_active=True).filter(
        models.Q(name__iexact='Smart Table') | models.Q(name__iexact='Akıllı Masa'),
    ).exists()


def resolve_cancel_source_from_request(request):
    """
    Smart Table iptallerini audit için işaretle.
    İstemci cancel_source gönderse bile yalnızca Smart Table rolü doğrulanırsa kabul edilir.
    """
    user = getattr(request, 'user', None)
    if not user_is_smart_table_actor(user):
        return None
    requested = str((getattr(request, 'data', None) or {}).get('cancel_source') or '').strip().lower()
    if requested and requested != SMART_TABLE_CANCEL_SOURCE:
        return None
    return SMART_TABLE_CANCEL_SOURCE
