"""Birleşik ürün sipariş kalemlerini mutfak istasyonlarına açma."""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

from core.decimal_constants import ZERO_MONEY

from ..models import OrderItem, OrderStatus


def build_combined_component_order_items(
    parent_oi: OrderItem,
    product,
    *,
    target_completion_time,
    branch_id,
    stations_by_id=None,
) -> list[OrderItem]:
    """
    Birleşik ürün ana kalemi için alt ürün snapshot kalemleri üretir.
    Her alt ürün kendi kategori istasyonuna yönlendirilir.
    """
    from ..smart_firing import (
        combined_component_lead_quantity,
        product_has_actionable_recipe_timing,
        resolve_recipe_lead_minutes,
    )

    components: list[OrderItem] = []
    for ci in product.combined_items.all():
        comp_product = ci.product
        if not comp_product:
            continue

        um = Decimal(str(ci.product_unit.multiplier)) if ci.product_unit_id else Decimal('1')
        portion_mult = Decimal(str(ci.quantity)) * um
        comp_station_id = getattr(getattr(comp_product.category, 'station', None), 'id', None)

        comp_qty = combined_component_lead_quantity(int(parent_oi.quantity), ci)
        lead_time = (
            resolve_recipe_lead_minutes(comp_product, quantity=comp_qty)
            if comp_qty > 0 and product_has_actionable_recipe_timing(comp_product)
            else 0
        )

        scheduled_start = (
            target_completion_time - timedelta(minutes=lead_time)
            if lead_time > 0
            else None
        )

        components.append(
            OrderItem(
                id=uuid.uuid4(),
                order=parent_oi.order,
                product=comp_product,
                parent_item=parent_oi,
                quantity=parent_oi.quantity,
                portion_multiplier=portion_mult,
                unit_name=ci.product_unit.name if ci.product_unit_id else None,
                unit_price=ZERO_MONEY,
                total_price=ZERO_MONEY,
                status=OrderStatus.PENDING,
                scheduled_start_time=scheduled_start,
                station_id=comp_station_id,
            )
        )
    return components
