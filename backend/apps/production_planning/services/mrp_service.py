from core.decimal_constants import ZERO_QTY
from decimal import Decimal
from django.db import models
from apps.production_planning.models import ProductionPlan
from apps.inventory.services.recipe_requirements import compute_recipe_requirements
from apps.inventory.selectors import get_production_reserved_quantity
from apps.warehouse.models import WarehouseStockLevel


def calculate_mrp_for_plan(plan_id: str, station_id: str = None) -> dict:
    """
    Belirtilen üretim planı için MRP (Malzeme İhtiyaç Planlaması) hesaplar.
    Her bir plan satırındaki ürün ve porsiyon miktarına göre ihtiyaç duyulan
    hammaddeleri, mevcut mutfak deposu stoklarıyla karşılaştırarak eksik miktarları bulur.
    """
    try:
        plan = ProductionPlan.objects.filter(is_active=True).get(id=plan_id)
    except ProductionPlan.DoesNotExist:
        return {"items": []}

    # İstasyon bazlı veya tüm planı hesapla
    lines_qs = plan.lines.filter(is_active=True).select_related(
        'product__recipe',
        'product__category__station',
        'station'
    ).prefetch_related(
        'product__recipe__ingredients'
    )
    
    if station_id:
        lines_qs = lines_qs.filter(models.Q(station_id=station_id) | models.Q(product__category__station_id=station_id))

    # Tüm plan için stok-istasyon eşleşmesini çıkar (kolon için)
    from collections import defaultdict
    stock_item_stations = defaultdict(set)
    all_lines = plan.lines.filter(is_active=True).select_related(
        'product__recipe',
        'product__category__station',
        'station'
    ).prefetch_related('product__recipe__ingredients')
    
    for line in all_lines:
        station = line.station or line.product.category.station
        sname = station.name if station else "Bilinmiyor"
        recipe = getattr(line.product, "recipe", None)
        if recipe:
            for ing in recipe.ingredients.all():
                stock_item_stations[ing.stock_item_id].add(sname)

    items_to_compute = []
    for line in lines_qs:
        items_to_compute.append({
            "product": line.product,
            "quantity": line.target_quantity,
            "portion_multiplier": Decimal("1"),
            "parent_recipe": False
        })
        
    required_by_stock_item = compute_recipe_requirements(items_to_compute)
    
    if not required_by_stock_item:
        return {"items": []}
        
    # Şubenin mutfak deposunu bul
    from apps.warehouse.models import Warehouse, WarehouseType
    kitchen_wh = Warehouse.objects.filter(
        branches__id=plan.branch_id,
        warehouse_type=WarehouseType.KITCHEN,
        is_active=True,
    ).first()
    
    if not kitchen_wh:
        from apps.inventory.services._helpers import get_default_warehouse
        kitchen_wh = get_default_warehouse()
        
    levels = {
        l.stock_item_id: l
        for l in WarehouseStockLevel.objects.filter(
            warehouse=kitchen_wh,
            stock_item_id__in=list(required_by_stock_item.keys()),
            is_active=True
        ).select_related('stock_item')
    }
    
    from apps.inventory.models import StockItem
    stock_items_qs = StockItem.objects.filter(id__in=list(required_by_stock_item.keys()))
    stock_items = {si.id: si for si in stock_items_qs}

    results = []
    from apps.inventory.stock_minimum import ZERO_QTY, is_minimum_unlimited

    for stock_item_id, req_qty in required_by_stock_item.items():
        level = levels.get(stock_item_id)
        stock_item = stock_items.get(stock_item_id)
        if not stock_item:
            continue
            
        on_hand = level.quantity if level else Decimal("0")
        # Envanter listesi ile aynı: depo seviyesi varsa onun minimumu, yoksa kalem minimumu
        minimum_quantity = (
            level.minimum_quantity if level else (stock_item.minimum_quantity or ZERO_QTY)
        )
        minimum_unlimited = is_minimum_unlimited(minimum_quantity)
        
        # Sipariş / güvenlik payı hariç salt eksik hesaplaması
        gap = req_qty - on_hand
        if gap < 0:
            gap = Decimal("0")
            
        below_minimum = False
        if not minimum_unlimited and on_hand < req_qty:
            below_minimum = True

        stations_list = sorted(list(stock_item_stations.get(stock_item_id, set())))

        reserved_qty = get_production_reserved_quantity(
            stock_item_id,
            warehouse_id=kitchen_wh.id if kitchen_wh else None,
        )

        results.append({
            "stock_item_id": stock_item.id,
            "stock_item_name": stock_item.name,
            "unit": stock_item.unit if stock_item.unit else "",
            "required_quantity": req_qty,
            "on_hand": on_hand,
            "gap": gap,
            "below_minimum": below_minimum,
            "minimum_quantity": minimum_quantity,
            "is_minimum_unlimited": minimum_unlimited,
            "kitchen_station": ", ".join(stations_list) if stations_list else "Bilinmiyor",
            "reserved_quantity": reserved_qty,
            "available_after_reservation": on_hand - reserved_qty,
        })
        
    # İsme göre sırala
    results.sort(key=lambda x: x["stock_item_name"])
    
    return {
        "warehouse_id": kitchen_wh.id if kitchen_wh else None,
        "warehouse_name": kitchen_wh.name if kitchen_wh else "Bilinmiyor",
        "items": results
    }

