"""SKT aksiyon handler yardımcıları."""

from __future__ import annotations

from apps.inventory.models import ExpiryActionType, StockLot
from apps.inventory.services.expiry_action_service import _assert_lot_access


def load_lot_for_action(user, lot_id: str) -> StockLot:
    lot = (
        StockLot.objects.select_related('stock_item', 'warehouse')
        .prefetch_related('warehouse__branches')
        .filter(id=lot_id, is_active=True, quantity__gt=0)
        .first()
    )
    if not lot:
        raise ValueError('Lot bulunamadı veya stokta değil.')
    _assert_lot_access(user, lot)
    return lot


def validate_action_type(action_type: str) -> None:
    if action_type not in ExpiryActionType.values:
        raise ValueError('Geçersiz aksiyon tipi.')


def lot_branch(lot: StockLot):
    return lot.warehouse.branches.filter(is_active=True).order_by('name').first()
