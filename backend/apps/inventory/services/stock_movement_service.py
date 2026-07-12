"""Temel stok hareketleri: giriş, çıkış, zayi, düzeltme, silme."""

from __future__ import annotations
from core.decimal_constants import ZERO_MONEY, ZERO_QTY
from core.quantity_format import format_signed_quantity_display

import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Sum

from apps.inventory.models import (
    StockItem,
    StockLot,
    StockMovement,
    StockMovementLot,
    StockMovementType,
    StockUnit,
)
from apps.audit.services import record_audit
from apps.inventory.stock_minimum import ZERO_QTY, is_minimum_unlimited
from apps.inventory.services.lot_consumption_service import (
    ConsumedLotLine,
    consume_lots_fefo,
    weighted_unit_price_from_lines,
)

from ._helpers import InsufficientStockError, normalize_quantity_to_item_unit

logger = logging.getLogger("inventory")


def _fefo_costing_enabled() -> bool:
    return getattr(settings, "FEFO_COSTING_ENABLED", False)


def _fallback_item_unit_price(item: StockItem) -> Decimal:
    return item.last_purchase_price or item.average_cost or ZERO_QTY


def _persist_movement_lots(movement: StockMovement, lines: list[ConsumedLotLine]) -> None:
    if not lines:
        return
    StockMovementLot.objects.bulk_create(
        [
            StockMovementLot(
                movement=movement,
                stock_lot_id=line.lot_id,
                quantity=line.quantity,
                unit_price=line.unit_price,
                lot_number=line.lot_number,
                expiry_date=line.expiry_date,
            )
            for line in lines
        ]
    )


def _consumed_lines_audit_summary(lines: list[ConsumedLotLine]) -> list[dict]:
    return [
        {
            "lot_id": str(line.lot_id) if line.lot_id else None,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
        }
        for line in lines
    ]


def _resolve_deduct_unit_price(
    item: StockItem,
    consumed_lines: list[ConsumedLotLine],
    total_qty: Decimal,
    explicit_unit_price: Decimal,
) -> Decimal:
    if consumed_lines and _fefo_costing_enabled():
        return weighted_unit_price_from_lines(consumed_lines, total_qty)
    if explicit_unit_price and explicit_unit_price > 0:
        return explicit_unit_price
    return _fallback_item_unit_price(item)


@transaction.atomic
def receive_stock(
    warehouse_id,
    stock_item_id,
    quantity: Decimal,
    reference: str = "",
    notes: str = "",
    performed_by=None,
    supplier_id=None,
    unit=None,
    unit_price=ZERO_QTY,
    lot_number: str = "",
    expiry_date=None,
) -> StockMovement:
    """Stok girişi yapar - Belirli bir depoya. FEFO için lot_number ve expiry_date opsiyonel."""
    from apps.warehouse.models import WarehouseStockLevel

    item = StockItem.objects.select_for_update(nowait=True).get(id=stock_item_id)
    normalized_qty, normalized_unit, unit_note = normalize_quantity_to_item_unit(
        item, quantity, unit
    )

    level, _ = WarehouseStockLevel.objects.select_for_update(nowait=True).get_or_create(
        warehouse_id=warehouse_id,
        stock_item_id=stock_item_id,
        defaults={
            "quantity": ZERO_QTY,
            "minimum_quantity": item.minimum_quantity or ZERO_QTY,
        },
    )

    old_level_qty = level.quantity
    new_level_qty = old_level_qty + normalized_qty

    if unit_price and unit_price > 0:
        total_old_qty = (
            WarehouseStockLevel.objects.filter(
                stock_item_id=stock_item_id, is_active=True
            )
            .aggregate(total=Sum("quantity"))
            .get("total")
            or ZERO_QTY
        )
        old_avg = item.average_cost or ZERO_QTY
        new_total_qty = total_old_qty + normalized_qty
        if new_total_qty > 0:
            item.average_cost = (
                (total_old_qty * old_avg) + (normalized_qty * unit_price)
            ) / new_total_qty
        item.last_purchase_price = unit_price
        item.save(update_fields=["last_purchase_price", "average_cost", "updated_at"])

    level.quantity = new_level_qty
    level.save(update_fields=["quantity", "updated_at"])

    StockLot.objects.create(
        stock_item=item,
        warehouse_id=warehouse_id,
        lot_number=lot_number or reference or "",
        expiry_date=expiry_date,
        quantity=normalized_qty,
        initial_quantity=normalized_qty,
        unit_price=unit_price or item.average_cost or ZERO_QTY,
    )

    movement = StockMovement.objects.create(
        stock_item=item,
        warehouse_id=warehouse_id,
        movement_type=StockMovementType.IN,
        quantity=normalized_qty,
        unit=normalized_unit,
        unit_price=unit_price,
        reference=reference,
        notes=(notes or "") + unit_note,
        performed_by=performed_by,
        supplier_id=supplier_id,
    )
    
    record_audit(
        action='stock.receive',
        target_instance=movement,
        after_json={
            "quantity": str(normalized_qty),
            "unit": (
                getattr(normalized_unit, "short_name", normalized_unit)
                if normalized_unit
                else None
            ),
            "warehouse_id": str(warehouse_id)
        }
    )
    
    return movement


@transaction.atomic
def receive_stock_lots(
    warehouse_id,
    stock_item_id,
    lines: list[ConsumedLotLine],
    reference: str = "",
    notes: str = "",
    performed_by=None,
    supplier_id=None,
    unit=None,
) -> StockMovement:
    """Transfer vb. için tüketim satırlarından çoklu lot girişi yapar."""
    from apps.warehouse.models import WarehouseStockLevel

    if not lines:
        raise ValueError("receive_stock_lots requires at least one consumption line")

    item = StockItem.objects.select_for_update(nowait=True).get(id=stock_item_id)
    total_qty = sum((line.quantity for line in lines), ZERO_QTY)

    level, _ = WarehouseStockLevel.objects.select_for_update(nowait=True).get_or_create(
        warehouse_id=warehouse_id,
        stock_item_id=stock_item_id,
        defaults={
            "quantity": ZERO_QTY,
            "minimum_quantity": item.minimum_quantity or ZERO_QTY,
        },
    )
    level.quantity += total_qty
    level.save(update_fields=["quantity", "updated_at"])

    for line in lines:
        StockLot.objects.create(
            stock_item=item,
            warehouse_id=warehouse_id,
            lot_number=line.lot_number or reference or "",
            expiry_date=line.expiry_date,
            quantity=line.quantity,
            initial_quantity=line.quantity,
            unit_price=line.unit_price or ZERO_QTY,
        )

    movement_unit_price = weighted_unit_price_from_lines(lines, total_qty)
    movement = StockMovement.objects.create(
        stock_item=item,
        warehouse_id=warehouse_id,
        movement_type=StockMovementType.IN,
        quantity=total_qty,
        unit=unit or item.unit,
        unit_price=movement_unit_price,
        reference=reference,
        notes=notes,
        performed_by=performed_by,
        supplier_id=supplier_id,
    )

    record_audit(
        action="stock.receive_lots",
        target_instance=movement,
        after_json={
            "quantity": str(total_qty),
            "warehouse_id": str(warehouse_id),
            "lot_count": len(lines),
        },
    )
    return movement


@transaction.atomic
def deduct_stock(
    warehouse_id,
    stock_item_id,
    quantity: Decimal,
    reference: str = "",
    notes: str = "",
    performed_by=None,
    supplier_id=None,
    unit=None,
    unit_price=ZERO_QTY,
    movement_type: str = StockMovementType.OUT,
    allow_negative: bool = False,
    stock_item_obj: StockItem | None = None,
    warehouse_stock_level_obj: WarehouseStockLevel | None = None,
) -> StockMovement:
    """Stok çıkışı yapar - Belirli bir depodan."""
    from apps.warehouse.models import WarehouseStockLevel

    item = stock_item_obj or StockItem.objects.get(id=stock_item_id)
    normalized_qty, normalized_unit, unit_note = normalize_quantity_to_item_unit(
        item, quantity, unit
    )

    level = warehouse_stock_level_obj
    if level is None:
        level = (
            WarehouseStockLevel.objects.select_for_update(nowait=True)
            .filter(
                warehouse_id=warehouse_id,
                stock_item_id=stock_item_id,
                is_active=True,
            )
            .first()
        )

    eff_allow_negative = allow_negative or is_minimum_unlimited(item.minimum_quantity)

    if not level:
        if eff_allow_negative:
            level = WarehouseStockLevel.objects.select_for_update(nowait=True).create(
                warehouse_id=warehouse_id,
                stock_item_id=stock_item_id,
                quantity=ZERO_QTY,
                minimum_quantity=item.minimum_quantity or ZERO_QTY,
            )
        else:
            raise InsufficientStockError(item.name, ZERO_QTY, normalized_qty)

    if not eff_allow_negative and level.quantity < normalized_qty:
        raise InsufficientStockError(item.name, level.quantity, normalized_qty)

    level.quantity -= normalized_qty
    level.save(update_fields=["quantity", "updated_at"])

    lots_qs = StockLot.objects.select_for_update(nowait=True).filter(
        warehouse_id=warehouse_id,
        stock_item_id=stock_item_id,
    )
    fallback_price = _fallback_item_unit_price(item)
    consumption = consume_lots_fefo(
        lots_qs,
        normalized_qty,
        allow_negative=eff_allow_negative,
        fallback_price=fallback_price,
    )

    if consumption.neg_lot_quantity > 0:
        StockLot.objects.create(
            stock_item=item,
            warehouse_id=warehouse_id,
            lot_number="NEG",
            expiry_date=None,
            quantity=-consumption.neg_lot_quantity,
            initial_quantity=-consumption.neg_lot_quantity,
            unit_price=consumption.neg_lot_unit_price or fallback_price,
        )

    resolved_unit_price = _resolve_deduct_unit_price(
        item,
        consumption.lines,
        normalized_qty,
        unit_price,
    )

    movement = StockMovement.objects.create(
        stock_item=item,
        warehouse_id=warehouse_id,
        movement_type=movement_type,
        quantity=normalized_qty,
        unit=normalized_unit,
        unit_price=resolved_unit_price,
        reference=reference,
        notes=(notes or "") + unit_note,
        performed_by=performed_by,
        supplier_id=supplier_id,
    )

    _persist_movement_lots(movement, consumption.lines)

    audit_after = {
        "quantity": str(normalized_qty),
        "unit": (
            getattr(normalized_unit, "short_name", normalized_unit)
            if normalized_unit
            else None
        ),
        "warehouse_id": str(warehouse_id),
    }
    if consumption.lines:
        audit_after["consumed_lots"] = _consumed_lines_audit_summary(consumption.lines)

    record_audit(
        action=f'stock.{movement_type.lower()}',
        target_instance=movement,
        after_json=audit_after,
    )

    return movement


@transaction.atomic
def waste_stock(
    warehouse_id,
    stock_item_id,
    quantity: Decimal,
    reference: str = "",
    notes: str = "",
    performed_by=None,
    supplier_id=None,
    unit=None,
    unit_price=ZERO_QTY,
) -> StockMovement:
    """Fire/Zayi girişi yapar (stok düşer).

    unit_price verilirse harekete yazılır; verilmezse (veya sıfır bırakılırsa)
    deduct_stock içinde stok kaleminin son alış / ortalama maliyetinden çözülür.
    """
    return deduct_stock(
        warehouse_id=warehouse_id,
        stock_item_id=stock_item_id,
        quantity=quantity,
        reference=reference,
        notes=notes,
        performed_by=performed_by,
        supplier_id=supplier_id,
        unit=unit,
        unit_price=unit_price,
        movement_type=StockMovementType.WASTE,
    )


@transaction.atomic
def return_stock(
    warehouse_id,
    stock_item_id,
    quantity: Decimal,
    reference: str = "",
    notes: str = "",
    performed_by=None,
    supplier_id=None,
    unit=None,
    unit_price=ZERO_QTY,
) -> StockMovement:
    """İade girişi yapar (stok düşer). Tedarikçiye iade veya müşteri iadesi."""
    return deduct_stock(
        warehouse_id=warehouse_id,
        stock_item_id=stock_item_id,
        quantity=quantity,
        reference=reference,
        notes=notes,
        performed_by=performed_by,
        supplier_id=supplier_id,
        unit=unit,
        unit_price=unit_price,
        movement_type=StockMovementType.RETURN,
    )


@transaction.atomic
def cancel_stock(
    warehouse_id,
    stock_item_id,
    quantity: Decimal,
    reference: str = "",
    notes: str = "",
    performed_by=None,
    supplier_id=None,
    unit=None,
    unit_price=ZERO_QTY,
) -> StockMovement:
    """İptal girişi yapar (stok düşer). Tedarikçi sipariş iptali veya stok iptali."""
    return deduct_stock(
        warehouse_id=warehouse_id,
        stock_item_id=stock_item_id,
        quantity=quantity,
        reference=reference,
        notes=notes,
        performed_by=performed_by,
        supplier_id=supplier_id,
        unit=unit,
        unit_price=unit_price,
        movement_type=StockMovementType.CANCEL,
    )


@transaction.atomic
def dispose_stock(
    warehouse_id,
    stock_item_id,
    quantity: Decimal,
    reference: str = "",
    notes: str = "",
    performed_by=None,
    supplier_id=None,
    unit=None,
    unit_price=ZERO_QTY,
) -> StockMovement:
    """İmha girişi yapar (stok düşer). SKT geçmiş veya bozulmuş ürünler.

    unit_price verilirse harekete yazılır; verilmezse deduct_stock içinde
    stok kaleminin son alış / ortalama maliyetinden çözülür.
    """
    return deduct_stock(
        warehouse_id=warehouse_id,
        stock_item_id=stock_item_id,
        quantity=quantity,
        reference=reference,
        notes=notes,
        performed_by=performed_by,
        supplier_id=supplier_id,
        unit=unit,
        unit_price=unit_price,
        movement_type=StockMovementType.DISPOSAL,
    )


@transaction.atomic
def adjust_stock(
    warehouse_id,
    stock_item_id,
    new_quantity: Decimal,
    notes: str = "",
    performed_by=None,
    supplier_id=None,
    unit=None,
) -> StockMovement:
    """Stok sayımı sonucu düzeltme yapar."""
    from apps.warehouse.models import WarehouseStockLevel

    item = StockItem.objects.get(id=stock_item_id)
    normalized_new_qty, _, unit_note = normalize_quantity_to_item_unit(
        item, new_quantity, unit
    )

    level = (
        WarehouseStockLevel.objects.select_for_update(nowait=True)
        .filter(
            warehouse_id=warehouse_id,
            stock_item_id=stock_item_id,
            is_active=True,
        )
        .first()
    )
    if level is None:
        level = WarehouseStockLevel.objects.create(
            warehouse_id=warehouse_id,
            stock_item_id=stock_item_id,
            quantity=ZERO_QTY,
            minimum_quantity=item.minimum_quantity or ZERO_QTY,
        )

    diff = normalized_new_qty - level.quantity
    level.quantity = normalized_new_qty
    level.save(update_fields=["quantity", "updated_at"])

    if diff > 0:
        remaining = diff
        neg_lots = StockLot.objects.filter(
            warehouse_id=warehouse_id,
            stock_item_id=stock_item_id,
            quantity__lt=0,
            is_active=True,
        ).order_by("received_at")
        for lot in neg_lots:
            if remaining <= 0:
                break
            absorb = min(remaining, abs(lot.quantity))
            lot.quantity += absorb
            lot.save(update_fields=["quantity", "updated_at"])
            remaining -= absorb
        if remaining > 0:
            StockLot.objects.create(
                stock_item=item,
                warehouse_id=warehouse_id,
                lot_number="ADJ",
                expiry_date=None,
                quantity=remaining,
                initial_quantity=remaining,
                unit_price=item.average_cost or ZERO_QTY,
            )
    elif diff < 0:
        remaining = abs(diff)
        lots = StockLot.objects.filter(
            warehouse_id=warehouse_id,
            stock_item_id=stock_item_id,
            quantity__gt=0,
            is_active=True,
        ).order_by("expiry_date", "received_at")
        for lot in lots:
            if remaining <= 0:
                break
            consume = min(lot.quantity, remaining)
            lot.quantity -= consume
            lot.save(update_fields=["quantity", "updated_at"])
            remaining -= consume

    movement = StockMovement.objects.create(
        stock_item=item,
        warehouse_id=warehouse_id,
        movement_type=StockMovementType.ADJUSTMENT,
        quantity=abs(diff),
        unit=item.unit,
        reference=f"Sayım düzeltmesi: {format_signed_quantity_display(diff)}",
        notes=(notes or "") + unit_note,
        performed_by=performed_by,
        supplier_id=supplier_id,
    )
    
    record_audit(
        action='stock.adjustment',
        target_instance=movement,
        after_json={
            "diff": str(diff),
            "new_quantity": str(normalized_new_qty),
            "warehouse_id": str(warehouse_id)
        }
    )
    
    return movement


@transaction.atomic
def delete_movement(movement_id) -> None:
    """Stok hareketini siler ve miktarı geri alır."""
    from apps.warehouse.models import WarehouseStockLevel

    movement = StockMovement.objects.select_for_update(nowait=True).get(id=movement_id)

    level = (
        WarehouseStockLevel.objects.select_for_update(nowait=True)
        .filter(
            warehouse_id=movement.warehouse_id,
            stock_item_id=movement.stock_item_id,
            is_active=True,
        )
        .first()
    )

    if level:
        if movement.movement_type == StockMovementType.IN:
            level.quantity -= movement.quantity
        elif movement.movement_type in [
            StockMovementType.OUT,
            StockMovementType.WASTE,
            StockMovementType.RETURN,
            StockMovementType.CANCEL,
            StockMovementType.DISPOSAL,
        ]:
            level.quantity += movement.quantity
        level.save(update_fields=["quantity", "updated_at"])

    if movement.movement_type == StockMovementType.IN:
        remaining = movement.quantity
        lots = StockLot.objects.filter(
            warehouse_id=movement.warehouse_id,
            stock_item_id=movement.stock_item_id,
            quantity__gt=0,
            is_active=True,
        ).order_by("-received_at")
        for lot in lots:
            if remaining <= 0:
                break
            consume = min(lot.quantity, remaining)
            lot.quantity -= consume
            lot.save(update_fields=["quantity", "updated_at"])
            remaining -= consume
    elif movement.movement_type in [
        StockMovementType.OUT,
        StockMovementType.WASTE,
        StockMovementType.TRANSFER,
        StockMovementType.RETURN,
        StockMovementType.CANCEL,
        StockMovementType.DISPOSAL,
    ]:
        lot_lines = list(
            movement.lot_consumptions.filter(is_active=True).select_related("stock_lot")
        )
        if lot_lines:
            for line in lot_lines:
                if line.stock_lot_id and line.stock_lot and line.stock_lot.is_active:
                    lot = line.stock_lot
                    lot.quantity += line.quantity
                    lot.save(update_fields=["quantity", "updated_at"])
                else:
                    StockLot.objects.create(
                        stock_item_id=movement.stock_item_id,
                        warehouse_id=movement.warehouse_id,
                        lot_number="REV",
                        expiry_date=line.expiry_date,
                        quantity=line.quantity,
                        initial_quantity=line.quantity,
                        unit_price=line.unit_price or movement.unit_price or ZERO_QTY,
                    )
        else:
            StockLot.objects.create(
                stock_item_id=movement.stock_item_id,
                warehouse_id=movement.warehouse_id,
                lot_number="REV",
                expiry_date=None,
                quantity=movement.quantity,
                initial_quantity=movement.quantity,
                unit_price=movement.unit_price or ZERO_QTY,
            )

    record_audit(
        action='stock.movement_deleted',
        target_instance=movement,
        before_json={
            "id": str(movement.id),
            "type": movement.movement_type,
            "quantity": str(movement.quantity)
        }
    )

    movement.delete()
