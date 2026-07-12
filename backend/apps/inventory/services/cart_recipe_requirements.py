"""
POS sepeti ve sipariş tamamlama için aynı reçete-Depo eşleme algoritması.

Ürün kategorisinin mutfak istasyonuna bağlı deposu (varsa) kullanılır;
aksi halde şubenin KITCHEN tipi depo veya `get_default_warehouse()` uygulanır.
"""

from core.decimal_constants import ZERO_QTY

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from apps.inventory.stock_minimum import ZERO_QTY
from apps.warehouse.models import WarehouseType

from ._helpers import get_default_warehouse


def pos_kitchen_and_fallback_warehouse(branch_id):
    from apps.warehouse.models import Warehouse

    kitchen_wh = Warehouse.objects.filter(
        branches__id=branch_id,
        warehouse_type=WarehouseType.KITCHEN,
        is_active=True,
    ).first()
    fallback_wh = kitchen_wh or get_default_warehouse()
    return kitchen_wh, fallback_wh


def warehouse_id_for_product(product, fallback_wh):
    station = getattr(getattr(product, "category", None), "station", None)
    wh = getattr(station, "warehouse", None) if station else None
    if wh is not None:
        wid = getattr(wh, "id", wh) # wh nesne ise .id al, değilse kendisidir
        if wid: return wid
        
    if not fallback_wh:
        return None
    return getattr(fallback_wh, "id", fallback_wh)


def add_product_line_recipe_requirements(
    product,
    line_qty: Decimal,
    required: dict[tuple, Decimal],
    fallback_wh,
    *,
    station_warehouse_id=None,
) -> bool:
    """
    Tek satır (sepet veya OrderItem) için reçete ihtiyacını `required` sözlüğüne ekler.
    `station_warehouse_id` sipariş kalemindeki istasyon deposu snapshot'ıdır (varsa öncelikli).
    """
    if product.is_combined:
        parent_recipe = getattr(product, "recipe", None)
        parent_wh = station_warehouse_id or warehouse_id_for_product(product, fallback_wh)
        if parent_recipe:
            if not parent_wh:
                return False
            add_recipe_for_product(product, line_qty, parent_wh, required)
            return True
        any_added = False
        for comp in product.combined_items.all():
            comp_product = comp.product
            um = Decimal("1")
            if comp.product_unit_id:
                um = Decimal(str(comp.product_unit.multiplier))
            comp_qty = line_qty * Decimal(str(comp.quantity)) * um
            comp_wh = warehouse_id_for_product(comp_product, fallback_wh)
            if comp_wh and getattr(comp_product, "recipe", None):
                add_recipe_for_product(comp_product, comp_qty, comp_wh, required)
                any_added = True
        return any_added

    wh = station_warehouse_id or warehouse_id_for_product(product, fallback_wh)
    if not wh or not getattr(product, "recipe", None):
        return False
    add_recipe_for_product(product, line_qty, wh, required)
    return True


def add_order_item_recipe_requirements(
    order_item,
    required: dict[tuple, Decimal],
    fallback_wh,
    explicit_warehouse_id=None,
) -> bool:
    """OrderItem için reçete ihtiyacı; istasyon deposu snapshot'ı kullanılır."""
    if (
        getattr(order_item.product, 'is_combined', False)
        and order_item.parent_item_id is None
        and order_item.components.exists()
    ):
        return False

    station_wh = explicit_warehouse_id
    if station_wh is None and order_item.station_id and getattr(
        order_item.station, "warehouse_id", None
    ):
        station_wh = order_item.station.warehouse_id
    qty = Decimal(str(order_item.quantity)) * order_item.portion_multiplier
    return add_product_line_recipe_requirements(
        order_item.product,
        qty,
        required,
        fallback_wh,
        station_warehouse_id=station_wh,
    )


def add_recipe_for_product(
    product,
    line_qty: Decimal,
    warehouse_id,
    required: dict[tuple, Decimal],
) -> None:
    if warehouse_id is None:
        return
    recipe = getattr(product, "recipe", None)
    if not recipe:
        return
    from apps.recipes.recipe_expansion import expand_recipe_to_stock_requirements

    servings = Decimal(str(recipe.servings or 1))
    if servings <= 0:
        servings = Decimal("1")
    batch_multiplier = (line_qty / servings).quantize(
        Decimal("0.000001"), rounding=ROUND_HALF_UP
    )
    expand_recipe_to_stock_requirements(
        recipe, batch_multiplier, warehouse_id, required
    )


def build_cart_recipe_requirements(
    pmap: dict,
    items_data: list[dict],
    fallback_wh,
) -> dict[tuple, Decimal]:
    """
    (warehouse_id, stock_item_id) -> miktar: POS sepeti veya sipariş satırları
    (parent kalemler) ile aynı toplu ihtiyaç sözlüğü.
    """
    required: dict[tuple, Decimal] = defaultdict(lambda: ZERO_QTY)

    for row in items_data:
        pid = row["product_id"]
        qty = Decimal(str(row["quantity"]))
        product = pmap.get(pid)
        if not product:
            continue
        
        # --- Birim Çarpanı Çözümleme (OrderItem henüz yokken) ---
        unit_mult = Decimal("1.00")
        unit_name = row.get("unit_name")
        if unit_name:
            # Ürünün birimlerinden çarpanı bul
            # Not: pmap'te prefetch edilmemiş olabilir, query gerekebilir veya pmap'e eklenebilir.
            # Performans için pmap oluşturulurken 'units' prefetch edilmeli.
            from apps.menu.models import ProductUnit
            p_unit = ProductUnit.objects.filter(product=product, name=unit_name).first()
            if p_unit:
                unit_mult = Decimal(str(p_unit.multiplier))

        add_product_line_recipe_requirements(
            product,
            qty * unit_mult,
            required,
            fallback_wh,
        )

    return required


def build_order_recipe_requirements(order, fallback_wh=None) -> dict[tuple, Decimal]:
    """
    Verili siparişin tüm kalemleri (OrderItem) üzerinden reçete ihtiyaçlarını hesaplar.
    Snapshot olarak kaydedilmiş `station.warehouse` bilgisini kullanır.
    """
    from apps.orders.models import OrderStatus
    
    # Şube fallback deposunu bul
    if not fallback_wh:
        _, fallback_wh = pos_kitchen_and_fallback_warehouse(order.branch_id)

    # Tüm kalemleri ve reçetelerini peşin çek
    items = order.items.exclude(status=OrderStatus.CANCELLED).select_related(
        "product__recipe",
        "product__category__station__warehouse",
        "station__warehouse",
    ).prefetch_related(
        "product__recipe__ingredients__stock_item",
        "product__recipe__ingredients__sub_recipe__ingredients__stock_item",
        "product__recipe__ingredients__sub_recipe__ingredients__sub_recipe",
        "product__combined_items__product__recipe",
        "product__combined_items__product__category__station__warehouse",
        "product__combined_items__product_unit",
    )

    required: dict[tuple, Decimal] = defaultdict(lambda: ZERO_QTY)

    for oi in items:
        add_order_item_recipe_requirements(oi, required, fallback_wh)

    return required
