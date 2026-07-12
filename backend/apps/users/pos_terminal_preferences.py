"""POS terminaline bağlı etkin ekran tercihleri (garson mobil uygulaması vb.)."""

from __future__ import annotations

from apps.shifts.models import Shift, ShiftStatus
from apps.users.models import PosUiContext, UserPosScreenPreferences
from apps.users.views import DEFAULT_POS_SCREEN_PREFS, _merged_pos_prefs

_VALID_MODES = frozenset({"PRODUCT", "INGREDIENT"})


def _mode_from_merged_prefs(stored: dict | None) -> str | None:
    mode = _merged_pos_prefs(stored).get("stock_tracking_mode")
    if mode in _VALID_MODES:
        return mode
    return None


def _mode_for_user_pos_prefs(user_id) -> str | None:
    pref = UserPosScreenPreferences.objects.filter(
        user_id=user_id,
        ui_context=PosUiContext.POS,
    ).first()
    if not pref:
        return None
    return _mode_from_merged_prefs(pref.data)


def resolve_stock_tracking_mode_for_terminal(terminal_id: str, branch_id: str | None = None) -> str:
    """
    Bağlı POS terminalinin ürün takip yöntemini döner.

    Öncelik:
    1. Bu terminalde açık vardiyayı açan kullanıcının POS (context=pos) tercihi
    2. POS ekranında bu terminale atanmış kullanıcı tercihi
    3. Varsayılan PRODUCT
    """
    terminal_id = str(terminal_id)

    shift_qs = (
        Shift.objects.filter(
            status=ShiftStatus.OPEN,
            opened_at_terminal_id=terminal_id,
        )
        .select_related("opened_by")
        .order_by("-opened_at")
    )
    if branch_id:
        shift_qs = shift_qs.filter(branch_id=str(branch_id))

    shift = shift_qs.first()
    if shift and shift.opened_by_id:
        mode = _mode_for_user_pos_prefs(shift.opened_by_id)
        if mode:
            return mode

    assigned_pref = (
        UserPosScreenPreferences.objects.filter(
            ui_context=PosUiContext.POS,
            data__assigned_pos_terminal_uuid=terminal_id,
        )
        .order_by("-updated_at")
        .first()
    )
    if assigned_pref:
        mode = _mode_from_merged_prefs(assigned_pref.data)
        if mode:
            return mode

    return DEFAULT_POS_SCREEN_PREFS["stock_tracking_mode"]
