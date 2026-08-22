"""Sipariş bazlı stok rezervasyon mantığı."""

from __future__ import annotations
from core.decimal_constants import ZERO_QTY

import logging
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.inventory.models import (
    OrderItemIngredientCost,
    StockMovementType,
    StockReservation,
    StockReservationStatus,
)
from apps.inventory.services.cart_recipe_requirements import (
    add_order_item_recipe_requirements,
    pos_kitchen_and_fallback_warehouse,
)
from apps.inventory.stock_minimum import ZERO_QTY

logger = logging.getLogger("inventory")
_MONEY2 = Decimal("0.01")


def _build_cost_ledger_entries(order, movement_map, reservations) -> list[OrderItemIngredientCost]:
    entries: list[OrderItemIngredientCost] = []
    reservations_by_item = defaultdict(list)
    for reservation in reservations:
        reservations_by_item[reservation.order_item_id].append(reservation)

    for order_item_id, item_reservations in reservations_by_item.items():
        order_item = item_reservations[0].order_item
        branch_id = order_item.branch_id or order.branch_id
        for reservation in item_reservations:
            movement = movement_map.get((reservation.warehouse_id, reservation.stock_item_id))
            unit_cost = Decimal(str(getattr(movement, "unit_price", 0) or 0))
            quantity = Decimal(str(reservation.quantity or 0))
            line_cost = (quantity * unit_cost).quantize(_MONEY2, rounding=ROUND_HALF_UP)
            committed_at = getattr(movement, "created_at", None) or timezone.now()
            entries.append(
                OrderItemIngredientCost(
                    order_item_id=order_item_id,
                    product_id=order_item.product_id,
                    branch_id=branch_id,
                    stock_item_id=reservation.stock_item_id,
                    warehouse_id=reservation.warehouse_id,
                    movement_id=getattr(movement, "id", None),
                    quantity=quantity,
                    unit_cost_snapshot=unit_cost.quantize(_MONEY2, rounding=ROUND_HALF_UP),
                    line_cost_snapshot=line_cost,
                    committed_at=committed_at,
                )
            )
    return entries


class StockReservationService:
    @staticmethod
    @transaction.atomic
    def reserve_for_order(order, warehouse_id=None) -> list[StockReservation]:
        """Sipariş için gerekli hammaddeleri rezerve eder."""
        if not getattr(settings, "STOCK_RESERVATION_ENABLED", True):
            logger.info(
                "reserve_for_order_skipped order_id=%s reason=STOCK_RESERVATION_DISABLED",
                order.id,
            )
            return []

        from apps.orders.models import OrderStatus

        items = (
            order.items.exclude(status=OrderStatus.CANCELLED)
            .select_related(
                "product__recipe",
                "product__category__station__warehouse",
                "station__warehouse",
            )
            .prefetch_related(
                "product__combined_items__product__recipe",
                "product__combined_items__product__category__station__warehouse",
                "product__combined_items__product_unit",
            )
        )

        _, fallback_wh = pos_kitchen_and_fallback_warehouse(order.branch_id)
        reservations_to_create = []
        lines_without_requirements = 0

        for oi in items:
            oi_required: dict[tuple, Decimal] = defaultdict(lambda: ZERO_QTY)
            added = add_order_item_recipe_requirements(
                oi, oi_required, fallback_wh, explicit_warehouse_id=warehouse_id
            )
            if not added or not oi_required:
                lines_without_requirements += 1
                logger.warning(
                    "reserve_for_order_line_skipped order_id=%s order_item_id=%s product_id=%s "
                    "station_id=%s reason=no_recipe_or_warehouse",
                    order.id,
                    oi.id,
                    oi.product_id,
                    oi.station_id,
                )
                continue

            for (wid, sid), qty in oi_required.items():
                reservations_to_create.append(
                    StockReservation(
                        order_item=oi,
                        stock_item_id=sid,
                        warehouse_id=wid,
                        quantity=qty,
                        status=StockReservationStatus.RESERVED,
                    )
                )

        if lines_without_requirements and not reservations_to_create:
            logger.warning(
                "reserve_for_order_empty order_id=%s branch_id=%s lines_without_requirements=%d",
                order.id,
                order.branch_id,
                lines_without_requirements,
            )

        if reservations_to_create:
            created = StockReservation.objects.bulk_create(reservations_to_create)
            logger.info(
                "reserve_for_order_ok order_id=%s reservation_count=%d",
                order.id,
                len(created),
            )
            return created
        return []

    @staticmethod
    @transaction.atomic
    def commit_reservations(order, performed_by=None, allow_negative: bool = False):
        """Rezervasyonları kesinleştirir (stoktan düşer) ve rezervasyon kayıtlarını kapatır."""
        reservations = list(
            StockReservation.objects.select_for_update(nowait=True)
            .filter(
                order_item__order=order,
                status=StockReservationStatus.RESERVED,
            )
            .select_related("stock_item", "order_item", "order_item__product", "order_item__branch")
        )

        if not reservations:
            if StockReservation.objects.filter(
                order_item__order=order,
                status=StockReservationStatus.COMMITTED,
            ).exists() or OrderItemIngredientCost.objects.filter(
                order_item__order=order
            ).exists():
                logger.info(
                    "reservation_commit_idempotent_skip order_id=%s branch_id=%s",
                    order.id,
                    order.branch_id,
                )
                return []
            from apps.inventory.services.order_deduction_service import deduct_for_order

            movements = deduct_for_order(
                order, performed_by=performed_by, allow_negative=allow_negative
            )
            if not movements:
                from apps.inventory.services.cart_recipe_requirements import (
                    build_order_recipe_requirements,
                )

                if build_order_recipe_requirements(order):
                    logger.warning(
                        "commit_reservations_no_movement order_id=%s branch_id=%s "
                        "reason=required_empty_or_deduction_failed",
                        order.id,
                        order.branch_id,
                    )
            return movements

        grouped_needs: dict[tuple, Decimal] = defaultdict(Decimal)
        item_map = {}

        for res in reservations:
            key = (res.warehouse_id, res.stock_item_id)
            grouped_needs[key] += res.quantity
            item_map[res.stock_item_id] = res.stock_item

        movements = []
        from apps.inventory.services.stock_movement_service import deduct_stock

        for (wid, sid), qty in grouped_needs.items():
            movement = deduct_stock(
                warehouse_id=wid,
                stock_item_id=sid,
                quantity=qty,
                reference=f"Sipariş #{order.id} (Rezervasyondan Toplu)",
                performed_by=performed_by,
                movement_type=StockMovementType.OUT,
                allow_negative=allow_negative,
                stock_item_obj=item_map.get(sid),
            )
            movements.append(movement)
        movement_map = {
            (movement.warehouse_id, movement.stock_item_id): movement
            for movement in movements
        }
        ledger_entries = _build_cost_ledger_entries(order, movement_map, reservations)
        if ledger_entries:
            OrderItemIngredientCost.objects.bulk_create(ledger_entries)

        StockReservation.objects.filter(pk__in=[r.pk for r in reservations]).update(
            status=StockReservationStatus.COMMITTED, updated_at=timezone.now()
        )

        from apps.inventory.services.order_deduction_service import (
            _batch_check_low_stock_alerts,
        )

        _batch_check_low_stock_alerts(list(grouped_needs.keys()))
        logger.info(
            "commit_reservations_ok order_id=%s movement_count=%d",
            order.id,
            len(movements),
        )
        return movements

    @staticmethod
    @transaction.atomic
    def release_reservations(order, order_item_id=None):
        """İptal edilen siparişin veya kalemin rezervasyonlarını serbest bırakır."""
        qs = StockReservation.objects.filter(status=StockReservationStatus.RESERVED)

        if order_item_id:
            qs = qs.filter(order_item_id=order_item_id)
        else:
            qs = qs.filter(order_item__order=order)

        qs.update(status=StockReservationStatus.RELEASED)
