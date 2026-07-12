"""SKT geçmiş lotlar için otomatik iptal/iade stok hareketi."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from apps.audit.services import record_audit
from apps.inventory.models import StockLot, StockMovement, StockMovementType
from apps.inventory.services import InsufficientStockError
from apps.inventory.services.expiry_action_service import _assert_lot_access
from core.decimal_constants import ZERO_QTY


@transaction.atomic
def auto_return_cancel_expired_lot(user, lot_id: str, notes: str = '') -> StockMovement:
    """Süresi geçmiş lotun tamamı için iptal veya iade stok hareketi oluşturur."""
    lot = (
        StockLot.objects.select_for_update()
        .select_related('stock_item', 'warehouse')
        .filter(id=lot_id, is_active=True, quantity__gt=0)
        .first()
    )
    if not lot:
        raise ValueError(_('Lot bulunamadı veya stokta değil.'))

    if not lot.is_expired:
        raise ValueError(_('Yalnızca süresi geçmiş lotlar için otomatik iptal/iade yapılabilir.'))

    _assert_lot_access(user, lot)

    quantity = lot.quantity
    if quantity <= ZERO_QTY:
        raise ValueError(_('Lot miktarı sıfır.'))

    from apps.warehouse.models import WarehouseStockLevel

    level = (
        WarehouseStockLevel.objects.select_for_update(nowait=True)
        .filter(
            warehouse_id=lot.warehouse_id,
            stock_item_id=lot.stock_item_id,
            is_active=True,
        )
        .first()
    )
    if not level or level.quantity < quantity:
        available = level.quantity if level else ZERO_QTY
        raise InsufficientStockError(lot.stock_item.name, available, quantity)

    level.quantity -= quantity
    level.save(update_fields=['quantity', 'updated_at'])

    lot.quantity = ZERO_QTY
    lot.save(update_fields=['quantity', 'updated_at'])

    movement_type = (
        StockMovementType.RETURN
        if lot.stock_item.is_returnable
        else StockMovementType.CANCEL
    )

    lot_label = lot.lot_number or str(lot.id)
    auto_notes = _('SKT Takibi otomatik iptal/iade — Lot: %(lot)s') % {'lot': lot_label}
    extra = (notes or '').strip()
    if extra:
        auto_notes = f'{auto_notes} | {extra}'

    movement = StockMovement.objects.create(
        stock_item=lot.stock_item,
        warehouse_id=lot.warehouse_id,
        movement_type=movement_type,
        quantity=quantity,
        unit=lot.stock_item.unit,
        unit_price=lot.unit_price or lot.stock_item.average_cost or ZERO_QTY,
        reference='EXPIRED',
        notes=auto_notes,
        performed_by=user,
    )

    record_audit(
        action='inventory.expiry_auto_return_cancel',
        target_instance=movement,
        after_json={
            'lot_id': str(lot.id),
            'stock_item_sku': lot.stock_item.sku,
            'warehouse_id': str(lot.warehouse_id),
            'movement_type': movement_type,
            'quantity': str(quantity),
            'reference': 'EXPIRED',
        },
        metadata={'expiry_date': lot.expiry_date.isoformat() if lot.expiry_date else None},
    )
    return movement
