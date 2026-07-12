"""POS sepet stok kontrolü: sipariş öncesi reçete ihtiyacı doğrulaması."""

from __future__ import annotations
from core.decimal_constants import ZERO_QTY

from decimal import Decimal
from django.db.models import Sum

from apps.inventory.models import StockItem
from apps.inventory.stock_minimum import (
    effective_minimum_for_critical_alert,
    is_minimum_unlimited,
    minimum_quantity_for_display,
    quantity_at_warehouse_level,
)
from apps.inventory.selectors import get_production_reserved_quantity
from .cart_recipe_requirements import (
    build_cart_recipe_requirements,
    pos_kitchen_and_fallback_warehouse,
)




def _pos_prefetch_warehouse_names(wh_ids: set) -> dict:
    from apps.warehouse.models import Warehouse

    if not wh_ids:
        return {}
    return dict(Warehouse.objects.filter(id__in=wh_ids).values_list("id", "name"))


def _pos_first_station_name_per_warehouse(branch_id, wh_ids: set) -> dict:
    from apps.branches.models import KitchenStation

    if not wh_ids:
        return {}
    station_names: dict = {}
    qs = (
        KitchenStation.objects.filter(warehouse_id__in=wh_ids, branch_id=branch_id)
        .order_by("warehouse_id", "id")
        .only("warehouse_id", "name")
    )
    for ks in qs:
        if ks.warehouse_id not in station_names:
            station_names[ks.warehouse_id] = ks.name
    return station_names


def _pos_build_issues_for_requirements(
    required: dict[tuple, Decimal],
    levels: dict,
    reservations: dict[tuple, Decimal],
    stock_items: dict,
    warehouse_names: dict,
    station_names: dict,
) -> list[dict]:
    from apps.inventory.stock_minimum import ZERO_QTY
    issues = []
    for (wid, sid), req_qty in required.items():
        level = levels.get((wid, sid))
        si = stock_items.get(sid)
        if not si:
            continue
        
        physical = quantity_at_warehouse_level(level)
        reserved = reservations.get((wid, sid), ZERO_QTY)
        production_reserved = get_production_reserved_quantity(sid, wid)
        available = physical - reserved - production_reserved
        
        min_qty = minimum_quantity_for_display(level, si)
        eff_min = effective_minimum_for_critical_alert(level, si)

        wh_name = level.warehouse.name if level else warehouse_names.get(wid, "")
        if not wh_name:
            wh_name = warehouse_names.get(wid, "") or "—"

        station_name = station_names.get(wid)
        is_unlimited = is_minimum_unlimited(min_qty)
        unit_name = si.unit or ""

        if not is_unlimited and available < req_qty:
            issues.append(
                {
                    "code": "INSUFFICIENT_STOCK",
                    "stock_item_name": si.name,
                    "station_name": station_name,
                    "warehouse_name": wh_name,
                    "unit": unit_name,
                    "available": str(available),
                    "physical": str(physical),
                    "reserved": str(reserved),
                    "production_reserved": str(production_reserved),
                    "required": str(req_qty),
                    "minimum_quantity": str(min_qty),
                }
            )
            continue

        remaining = available - req_qty
        from apps.inventory.stock_minimum import has_positive_minimum_threshold

        if (
            eff_min is not None
            and has_positive_minimum_threshold(eff_min)
            and (available < eff_min or remaining < eff_min)
        ):
            issues.append(
                {
                    "code": "CRITICAL_STOCK",
                    "stock_item_name": si.name,
                    "station_name": station_name,
                    "warehouse_name": wh_name,
                    "unit": unit_name,
                    "available": str(available),
                    "physical": str(physical),
                    "reserved": str(reserved),
                    "production_reserved": str(production_reserved),
                    "required": str(req_qty),
                    "minimum_quantity": str(min_qty),
                }
            )

    return issues


def check_pos_cart_station_stock(branch_id, items_data: list[dict]) -> dict:
    """
    POS / garson siparişi öncesi: her ürünün mutfak istasyonuna bağlı depodaki
    reçete ihtiyacını kontrol eder.

    Blokaj:
    - Yetersiz stok (mevcut < gerekli)
    - Kritik: mevcut < depo minimumu veya sipariş sonrası kalan < depo minimumu

    Kullanılabilir stok = fiziksel - rezerve - üretim_rezerve
    (üretim_rezerve: ProductionPlan.approve() ile bloke edilmiş miktar)

    Reçetesiz ürünler atlanır (onaylanır). İstasyon deposu yoksa şube mutfak
    deposuna düşülür (ödeme anındaki deduct ile aynı algoritma).
    """
    from apps.menu.models import Product
    from apps.warehouse.models import WarehouseStockLevel

    if not items_data:
        return {"ok": True, "issues": []}

    _, fallback_wh = pos_kitchen_and_fallback_warehouse(branch_id)

    product_ids = [row["product_id"] for row in items_data]
    products = (
        Product.objects.filter(id__in=product_ids)
        .select_related("category__station__warehouse", "recipe")
        .prefetch_related(
            "recipe__ingredients__stock_item",
            "combined_items__product__category__station__warehouse",
            "combined_items__product__recipe__ingredients__stock_item",
            "combined_items__product_unit",
        )
    )
    pmap = {p.id: p for p in products}

    required = build_cart_recipe_requirements(pmap, items_data, fallback_wh)

    if not required:
        return {"ok": True, "issues": []}

    wh_ids = {k[0] for k in required.keys()}
    sid_ids = {k[1] for k in required.keys()}

    from django.db.models import Q
    q_pairs = Q()
    for wid, sid in required.keys():
        q_pairs |= Q(warehouse_id=wid, stock_item_id=sid)

    levels = {
        (l.warehouse_id, l.stock_item_id): l
        for l in WarehouseStockLevel.objects.filter(
            q_pairs,
            is_active=True,
        ).select_related("stock_item", "warehouse")
    }

    from apps.inventory.models import StockReservation, StockReservationStatus
    res_qs = StockReservation.objects.filter(
        q_pairs,
        status=StockReservationStatus.RESERVED
    ).values('warehouse_id', 'stock_item_id').annotate(total=Sum('quantity'))
    
    reservations = {
        (r['warehouse_id'], r['stock_item_id']): r['total']
        for r in res_qs
    }

    stock_items = {si.id: si for si in StockItem.objects.filter(id__in=sid_ids)}

    warehouse_names = _pos_prefetch_warehouse_names(wh_ids)
    station_names = _pos_first_station_name_per_warehouse(branch_id, wh_ids)

    issues = _pos_build_issues_for_requirements(
        required,
        levels,
        reservations,
        stock_items,
        warehouse_names,
        station_names,
    )

    return {"ok": len(issues) == 0, "issues": issues}
