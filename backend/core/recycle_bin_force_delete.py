"""Recycle bin — bağımlılıklarıyla birlikte zorla kalıcı silme."""

from __future__ import annotations

from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.utils.translation import gettext as _, ngettext

from core.recycle_bin_errors import _unique_objects, format_blocking_reference

MAX_FORCE_DELETE_DEPTH = 30
MAX_FORCE_DELETE_TOTAL = 500


class ForceDeleteLimitError(ValueError):
    """Zorla silme güvenlik limiti aşıldı."""


def perform_hard_delete(obj) -> None:
    """Tek kaydı kalıcı siler (BaseModel hard=True veya is_deleted modelleri)."""
    model = obj.__class__
    if hasattr(model, "is_deleted") and not hasattr(obj, "is_active"):
        obj.delete()
        return
    try:
        obj.delete(hard=True)
    except TypeError:
        obj.delete()


def force_hard_delete(
    obj,
    *,
    deleted_refs: list[str] | None = None,
    _seen: set[tuple[str, str]] | None = None,
    _depth: int = 0,
) -> list[str]:
    """
    PROTECT bağımlılıklarını önce silerek hedef kaydı kalıcı siler.
    Dönüş: silinen kayıtların insan okunur referans listesi (bağımlılar → hedef).
    """
    if deleted_refs is None:
        deleted_refs = []
    if _seen is None:
        _seen = set()

    if len(deleted_refs) >= MAX_FORCE_DELETE_TOTAL:
        raise ForceDeleteLimitError(
            _("Zorla silme limiti (%(limit)s kayıt) aşıldı.") % {"limit": MAX_FORCE_DELETE_TOTAL}
        )

    key = (obj._meta.label_lower, str(obj.pk))
    if key in _seen:
        return deleted_refs
    _seen.add(key)

    if _depth > MAX_FORCE_DELETE_DEPTH:
        raise ForceDeleteLimitError(_("Bağımlılık zinciri çok derin; zorla silme iptal edildi."))

    while True:
        try:
            perform_hard_delete(obj)
            deleted_refs.append(format_blocking_reference(obj))
            return deleted_refs
        except ProtectedError as exc:
            blockers = _unique_objects(getattr(exc, "protected_objects", ()))
            if not blockers:
                raise
            for blocker in blockers:
                force_hard_delete(
                    blocker,
                    deleted_refs=deleted_refs,
                    _seen=_seen,
                    _depth=_depth + 1,
                )
            try:
                obj.refresh_from_db()
            except obj.__class__.DoesNotExist:
                return deleted_refs


def preview_force_delete_dependencies(obj) -> list[str]:
    """Silmeden bağımlılık zincirini simüle eder (transaction rollback)."""
    with transaction.atomic():
        refs: list[str] = []
        force_hard_delete(obj, deleted_refs=refs)
        transaction.set_rollback(True)
        return refs


def format_force_delete_success_message(deleted_refs: list[str]) -> str:
    if not deleted_refs:
        return _("Kayıt kalıcı olarak silindi.")

    if len(deleted_refs) == 1:
        return _("Kayıt kalıcı olarak silindi: %(ref)s.") % {"ref": deleted_refs[0]}

    target = deleted_refs[-1]
    dependents = deleted_refs[:-1]
    deps_text = "; ".join(dependents[:10])
    remaining = len(dependents) - min(len(dependents), 10)
    if remaining > 0:
        deps_text = f"{deps_text}; " + ngettext(
            "ve %(count)s kayıt daha",
            "ve %(count)s kayıt daha",
            remaining,
        ) % {"count": remaining}

    return _(
        "Kayıt kalıcı olarak silindi: %(target)s. Birlikte silinen bağımlı kayıtlar: %(deps)s."
    ) % {"target": target, "deps": deps_text}
