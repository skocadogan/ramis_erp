"""İptal/iade kayıtları için birim fiyat çözümlemesi."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from core.decimal_constants import ZERO_QTY

from apps.inventory.models import StockItem, StockMovement, StockMovementType


def resolve_return_cancel_unit_price(
    *,
    stock_item_id,
    movement_type: str,
    unit_price=ZERO_QTY,
    purchase_order_id=None,
) -> Decimal:
    """RETURN/CANCEL hareketleri için kaydedilecek birim fiyatı belirler."""
    if movement_type not in (StockMovementType.RETURN, StockMovementType.CANCEL):
        return unit_price or ZERO_QTY

    resolved = unit_price or ZERO_QTY

    if purchase_order_id:
        from apps.warehouse.models import PurchaseOrderItem

        line = (
            PurchaseOrderItem.objects.filter(
                purchase_order_id=purchase_order_id,
                stock_item_id=stock_item_id,
                is_active=True,
            )
            .only('unit_price')
            .first()
        )
        if line and line.unit_price and line.unit_price > ZERO_QTY:
            return line.unit_price

    if resolved > ZERO_QTY:
        return resolved

    item = (
        StockItem.objects.filter(id=stock_item_id, is_active=True)
        .only('last_purchase_price', 'average_cost')
        .first()
    )
    if not item:
        return ZERO_QTY

    return item.last_purchase_price or item.average_cost or ZERO_QTY


@transaction.atomic
def record_receiving_rejection(
    *,
    warehouse_id,
    stock_item_id,
    quantity: Decimal,
    unit_price: Decimal,
    unit: str,
    supplier_id=None,
    purchase_order_id=None,
    receiving_number: str = '',
    performed_by=None,
    reason_code: str = 'SUPPLIER_ERROR',
    notes: str = '',
) -> StockMovement:
    """Mal kabulde reddedilen miktar için iptal/iade kaydı (stok etkisi yok)."""
    resolved_price = resolve_return_cancel_unit_price(
        stock_item_id=stock_item_id,
        movement_type=StockMovementType.RETURN,
        unit_price=unit_price,
        purchase_order_id=purchase_order_id,
    )

    note_parts = []
    if receiving_number:
        note_parts.append(_('Mal kabul red #%(number)s') % {'number': receiving_number})
    if purchase_order_id:
        from apps.warehouse.models import PurchaseOrder

        po = PurchaseOrder.objects.filter(id=purchase_order_id).only('order_number').first()
        if po:
            note_parts.append(_('Satın alma: %(order)s') % {'order': po.order_number})
    if notes:
        note_parts.append(notes.strip())

    return StockMovement.objects.create(
        stock_item_id=stock_item_id,
        warehouse_id=warehouse_id,
        movement_type=StockMovementType.RETURN,
        quantity=quantity,
        unit=unit,
        unit_price=resolved_price,
        reference=reason_code,
        notes=' | '.join(note_parts) if note_parts else None,
        supplier_id=supplier_id,
        performed_by=performed_by,
    )


def effective_return_cancel_unit_price(movement) -> Decimal:
    """Listeleme/rapor için görüntülenecek birim fiyat (sıfır kayıtlar için yedek)."""
    stored = movement.unit_price or ZERO_QTY
    if stored > ZERO_QTY:
        return stored
    if movement.movement_type not in (StockMovementType.RETURN, StockMovementType.CANCEL):
        return stored

    item = movement.stock_item
    if not item:
        return ZERO_QTY
    return item.last_purchase_price or item.average_cost or ZERO_QTY
