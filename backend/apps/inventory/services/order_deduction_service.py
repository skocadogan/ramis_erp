"""Sipariş stok düşümü ve kritik stok uyarıları."""

from core.decimal_constants import ZERO_QTY

import logging
from collections import defaultdict
from datetime import timedelta
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone as tz

from decimal import Decimal

from apps.inventory.models import StockItem, StockMovement, StockMovementType
from apps.inventory.stock_minimum import ZERO_QTY, is_minimum_unlimited, quantity_at_warehouse_level
from apps.warehouse.models import WarehouseStockLevel, WarehouseType

from ._helpers import InsufficientStockError
from .cart_recipe_requirements import build_cart_recipe_requirements, pos_kitchen_and_fallback_warehouse
from .stock_movement_service import deduct_stock

logger = logging.getLogger("inventory")


def _order_parent_line_items_data(order) -> list[dict[str, Any]]:
    from apps.orders.models import OrderStatus

    rows = []
    for oi in (
        order.items.filter(parent_item__isnull=True)
        .exclude(status=OrderStatus.CANCELLED)
        .only("product_id", "quantity")
    ):
        rows.append(
            {
                "product_id": oi.product_id,
                "quantity": oi.quantity,
            }
        )
    return rows


def _order_validate_multi_warehouse(
    required_by_warehouse: dict[tuple, Decimal],
    allow_negative: bool,
) -> dict[tuple[int, int], WarehouseStockLevel]:
    """(warehouse_id, stock_item_id) sözlüğü: depo başına toplu kilitleme."""
    locked_levels: dict[tuple[int, int], WarehouseStockLevel] = {}
    if allow_negative:
        return locked_levels

    by_wh: dict[int, set[int]] = defaultdict(set)
    for (wid, sid) in required_by_warehouse:
        by_wh[wid].add(sid)

    for wh_id, stock_ids in by_wh.items():
        sids = list(stock_ids)
        need_map = {sid: required_by_warehouse[(wh_id, sid)] for sid in sids}
        levels = {
            l.stock_item_id: l
            for l in WarehouseStockLevel.objects.select_for_update(nowait=True).filter(
                warehouse_id=wh_id,
                stock_item_id__in=sids,
                is_active=True,
            )
        }
        stock_items_by_id = {
            si.id: si
            for si in StockItem.objects.filter(id__in=sids)
        }
        for stock_item_id, requested_qty in need_map.items():
            level = levels.get(stock_item_id)
            available = quantity_at_warehouse_level(level)
            try:
                item = stock_items_by_id[stock_item_id]
            except KeyError as exc:
                raise StockItem.DoesNotExist(
                    f"Reçete doğrulaması için stok kalemi bulunamadı: pk={stock_item_id!r}"
                ) from exc
            if not is_minimum_unlimited(item.minimum_quantity) and available < requested_qty:
                raise InsufficientStockError(item.name, available, requested_qty)
            
            if level:
                locked_levels[(wh_id, stock_item_id)] = level
                
    return locked_levels


def _batch_check_low_stock_alerts(warehouse_stock_pairs: list[tuple[int, int]]):
    """
    Sipariş sonrası toplu kritik stok kontrolü ve aksiyonları.
    """
    from django.db.models import Q
    from apps.warehouse.models import (
        DeficiencyReport,
        DeficiencyReportItem,
        DeficiencyReportStatus,
        WarehouseStockLevel,
    )
    from apps.inventory.stock_minimum import q_low_stock_warehouse_level

    if not warehouse_stock_pairs:
        return

    # 1. Toplu Seviye Sorgusu
    q_pairs = Q()
    for wid, sid in warehouse_stock_pairs:
        q_pairs |= Q(warehouse_id=wid, stock_item_id=sid)

    levels = (
        WarehouseStockLevel.objects.filter(q_pairs & q_low_stock_warehouse_level())
        .select_related("warehouse", "stock_item")
        .prefetch_related("warehouse__branches", "warehouse__kitchen_stations")
    )

    if not levels.exists():
        return

    cutoff = tz.now() - timedelta(hours=24)
    kitchen_reports: dict[int, DeficiencyReport] = {}
    report_items_to_create: list[DeficiencyReportItem] = []
    processed_reports: set[int] = set()

    for level in levels:
        warehouse = level.warehouse
        stock_item = level.stock_item

        logger.warning(
            'KRİTİK STOK UYARISI — %s deposunda "%s" minimum seviyenin altına düştü! '
            "Mevcut: %s, Minimum: %s",
            warehouse.name,
            stock_item.name,
            level.quantity,
            level.minimum_quantity,
        )

        # Mutfak Deposu: Eksik Listesi (Deficiency Report) Oluşturma
        if warehouse.warehouse_type == WarehouseType.KITCHEN:
            existing = DeficiencyReportItem.objects.filter(
                report__target_warehouse=warehouse,
                report__is_active=True,
                stock_item=stock_item,
                report__status__in=[
                    DeficiencyReportStatus.DRAFT,
                    DeficiencyReportStatus.PENDING,
                ],
                report__created_at__gte=cutoff,
            ).exists()

            if not existing:
                station = warehouse.kitchen_stations.first()
                if station:
                    if warehouse.id not in kitchen_reports:
                        kitchen_reports[warehouse.id] = DeficiencyReport.objects.create(
                            kitchen_station=station,
                            target_warehouse=warehouse,
                            status=DeficiencyReportStatus.PENDING,
                            notes='Otomatik toplu oluşturuldu: Kritik eşik uyarıları.',
                        )
                    
                    report = kitchen_reports[warehouse.id]
                    si_floor = ZERO_QTY if is_minimum_unlimited(stock_item.minimum_quantity) else stock_item.minimum_quantity
                    needed_qty = max(level.minimum_quantity - level.quantity, si_floor)
                    
                    report_items_to_create.append(DeficiencyReportItem(
                        report=report,
                        stock_item=stock_item,
                        quantity=needed_qty,
                        unit=stock_item.unit,
                    ))
                    processed_reports.add(report.id)

        # WebSocket Bildirimleri (Her depo tipi için)
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                msg_payload = {
                    "warehouse_id": str(warehouse.id),
                    "warehouse_name": warehouse.name,
                    "stock_item_id": str(stock_item.id),
                    "stock_item_name": stock_item.name,
                    "current_quantity": str(level.quantity),
                    "minimum_quantity": str(level.minimum_quantity),
                }
                for branch in warehouse.branches.all():
                    # 1. Depo bildirim grubu
                    async_to_sync(channel_layer.group_send)(
                        f"warehouse_notifications_{branch.id}",
                        {"type": "stock.low_alert", "message": msg_payload},
                    )
                    # 2. KDS/Mutfak bildirim grubu
                    from apps.orders.ws_broadcast import broadcast_kitchen_stock_low_alert
                    broadcast_kitchen_stock_low_alert(str(branch.id), msg_payload)
        except Exception:
            logger.exception("WebSocket Bildirimi Gönderilemedi.")

    # 2. Toplu Item Oluşturma ve WS Yayını
    if report_items_to_create:
        DeficiencyReportItem.objects.bulk_create(report_items_to_create)
        
        try:
            from apps.warehouse.ws_broadcast import schedule_deficiency_created
            for report in kitchen_reports.values():
                schedule_deficiency_created(report)
        except Exception:
            logger.exception("Eksik Listesi WebSocket Bildirimi Gönderilemedi.")


@transaction.atomic
def deduct_for_order(
    order, performed_by=None, allow_negative: bool = False
) -> list[StockMovement]:
    """
    Siparişteki ürünlerin reçetelerine göre stok düşer.
    """
    from apps.menu.models import Product

    from .cart_recipe_requirements import build_order_recipe_requirements
    required = build_order_recipe_requirements(order)
    if not required:
        logger.warning(
            "deduct_for_order_empty order_id=%s branch_id=%s reason=no_recipe_requirements",
            order.id,
            order.branch_id,
        )
        return []

    locked_levels = _order_validate_multi_warehouse(required, allow_negative)

    # N+1 Önleme: Tüm stok kalemlerini toplu çek
    required_stock_ids = {sid for (wid, sid) in required.keys()}
    stock_items_map = {
        si.id: si for si in StockItem.objects.filter(id__in=required_stock_ids)
    }

    movements: list[StockMovement] = []
    for (warehouse_id, stock_item_id), requested_qty in required.items():
        movement = deduct_stock(
            warehouse_id=warehouse_id,
            stock_item_id=stock_item_id,
            quantity=requested_qty,
            reference=f"Sipariş #{order.id}",
            performed_by=performed_by,
            movement_type=StockMovementType.OUT,
            allow_negative=allow_negative,
            stock_item_obj=stock_items_map.get(stock_item_id),
            warehouse_stock_level_obj=locked_levels.get((warehouse_id, stock_item_id)),
        )
        movements.append(movement)

    # Toplu Kritik Stok Kontrolü
    _batch_check_low_stock_alerts(list(required.keys()))

    logger.info(
        "order_deduction order_id=%s branch_id=%s movements=%d warehouses=%s",
        order.id,
        order.branch_id,
        len(movements),
        sorted({k[0] for k in required.keys()}),
    )
    return movements
