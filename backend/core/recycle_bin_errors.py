"""Recycle bin kalıcı silme — ProtectedError mesajlarını kullanıcı dostu metne çevirir."""

from __future__ import annotations

from django.db.models.deletion import ProtectedError
from django.utils.translation import gettext as _, ngettext

# Kayıt tanımlayıcısı için öncelikli alanlar
_DISPLAY_FIELDS = (
    "order_number",
    "invoice_number",
    "receipt_number",
    "document_number",
    "sale_number",
    "code",
    "name",
    "title",
    "username",
)


def _model_verbose(obj) -> str:
    return str(obj._meta.verbose_name)


def _generic_label(obj) -> str:
    for field in _DISPLAY_FIELDS:
        value = getattr(obj, field, None)
        if value not in (None, ""):
            return str(value)
    if obj.pk is not None:
        return str(obj.pk)[:8].upper()
    return str(obj)


def _order_item_label(obj) -> str | None:
    if obj._meta.model_name != "orderitem":
        return None
    order = getattr(obj, "order", None)
    order_ref = None
    if order is not None:
        order_ref = getattr(order, "order_number", None) or (
            str(order.pk)[:8].upper() if order.pk else None
        )
    product_name = getattr(obj, "product_name", None)
    if not product_name:
        product = getattr(obj, "product", None)
        if product is not None:
            product_name = getattr(product, "name", None)
    if order_ref and product_name:
        return f"{order_ref} — {product_name}"
    if order_ref:
        return order_ref
    if product_name:
        return product_name
    return None


def _sale_label(obj) -> str | None:
    if obj._meta.model_name != "sale":
        return None
    order = getattr(obj, "order", None)
    if order is None:
        return None
    order_ref = getattr(order, "order_number", None) or (
        str(order.pk)[:8].upper() if order.pk else None
    )
    if order_ref:
        return _("Sipariş %(order)s") % {"order": order_ref}
    return None


def record_label(obj) -> str:
    """Tek bir engelleyici kaydın kısa tanımı."""
    specialized = _order_item_label(obj) or _sale_label(obj)
    if specialized:
        return specialized
    return _generic_label(obj)


def format_blocking_reference(obj) -> str:
    """Örn: «Satış kaydı (Sipariş #45)»"""
    return _("%(model)s kaydı (%(record)s)") % {
        "model": _model_verbose(obj),
        "record": record_label(obj),
    }


def _unique_objects(objects) -> list:
    seen: set[tuple[str, str]] = set()
    unique = []
    for obj in objects:
        key = (obj._meta.label_lower, str(obj.pk))
        if key in seen:
            continue
        seen.add(key)
        unique.append(obj)
    return unique


def describe_protected_objects(protected_objects, *, max_items: int = 5) -> list[str]:
    refs: list[str] = []
    for obj in _unique_objects(protected_objects)[:max_items]:
        refs.append(format_blocking_reference(obj))
    return refs


def format_protected_delete_error(exc: ProtectedError, *, max_items: int = 5) -> str:
    """ProtectedError → kullanıcıya gösterilecek Türkçe/çevirilebilir mesaj."""
    protected = getattr(exc, "protected_objects", None) or ()
    unique = _unique_objects(protected)
    refs = describe_protected_objects(unique, max_items=max_items)

    if not refs:
        return _("Bu kayıt başka kayıtlara bağlı olduğu için silinemiyor.")

    refs_text = "; ".join(refs)
    remaining = len(unique) - len(refs)
    if remaining > 0:
        refs_text = f"{refs_text}; " + ngettext(
            "ve %(count)s kayıt daha",
            "ve %(count)s kayıt daha",
            remaining,
        ) % {"count": remaining}

    return _("Kayıt silinemiyor. Şu kayıtlarda kullanılıyor: %(refs)s.") % {"refs": refs_text}


def format_partial_empty_bin_message(
    *,
    deleted_count: int,
    protected_count: int,
    sample_refs: list[str],
) -> str:
    base = _(
        "%(deleted)s kayıt temizlendi. %(protected)s kayıt bağımlılıkları nedeniyle silinemedi."
    ) % {"deleted": deleted_count, "protected": protected_count}
    if not sample_refs:
        return base
    samples = "; ".join(sample_refs[:5])
    return f"{base} " + _("Örnek bağımlılıklar: %(refs)s.") % {"refs": samples}
