"""POS terminal doğrulama — sipariş tamamlama ve token uçları.

Migrasyon `0007_pos_terminal` her Branch için `code=kasa-01` varsayılan kaydı oluşturur;
üretimde admin arayüzünden ek kasalar tanımlanır.
"""

from __future__ import annotations

from django.apps import apps


def get_terminal_by_id_for_branch(branch_id, pos_terminal_id):
    """Şube + aktif kontrolü ile terminal döner; id yoksa None."""
    if not pos_terminal_id:
        return None
    PosTerminal = apps.get_model("pos_display", "PosTerminal")
    try:
        return PosTerminal.objects.get(
            pk=str(pos_terminal_id),
            branch_id=str(branch_id),
            is_active=True,
        )
    except PosTerminal.DoesNotExist:
        return None


def get_terminal_by_code_for_branch(branch_id, code: str):
    """Müşteri ekranı kanal kodu (terminal_id) için kayıt döner."""
    code = (code or "").strip()
    if not code or not branch_id:
        return None
    PosTerminal = apps.get_model("pos_display", "PosTerminal")
    try:
        return PosTerminal.objects.get(
            code=code,
            branch_id=str(branch_id),
            is_active=True,
        )
    except PosTerminal.DoesNotExist:
        return None


def get_effective_display_settings(branch_id, terminal=None):
    """Terminal için ayar satırı varsa onu, yoksa şube varsayılanını döndürür."""
    from .models import DisplaySettings

    if not branch_id:
        return None
    base = DisplaySettings.objects.filter(branch_id=str(branch_id), is_active=True)
    if terminal is not None:
        row = base.filter(pos_terminal_id=terminal.pk).first()
        if row:
            return row
    return base.filter(pos_terminal__isnull=True).first()
