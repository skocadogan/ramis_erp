from core.decimal_constants import ZERO_QTY
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from apps.inventory.stock_minimum import ZERO_QTY


def compute_recipe_requirements(items: list[dict]) -> dict[int, Decimal]:
    """
    Verilen ürün ve porsiyon listesi için reçete bazlı stok ihtiyacını hesaplar.
    
    Beklenen format:
    items = [
        {
            "product": Product instance,
            "quantity": int veya Decimal,
            "portion_multiplier": Decimal (varsayılan: 1),
            "parent_recipe": bool (Eğer üst ürünün reçetesi varsa True gönderilir ki tekrar hesaplanmasın)
        }, ...
    ]
    
    Dönüş:
    { stock_item_id (int): total_required_quantity (Decimal) }
    """
    required_by_stock_item: dict[int, Decimal] = defaultdict(lambda: ZERO_QTY)

    for item in items:
        # Eğer bu bir birleşik ürünün (combined product) alt öğesi ise ve 
        # ana ürünün kendi reçetesi varsa, alt ürün reçetesini hesaba katmayız.
        if item.get("parent_recipe", False):
            continue

        product = item["product"]
        recipe = getattr(product, "recipe", None)
        if not recipe:
            continue

        servings = Decimal(str(recipe.servings or 1))
        if servings <= 0:
            servings = Decimal("1")

        mult = item.get("portion_multiplier", Decimal("1"))
        qty = Decimal(str(item["quantity"]))

        for ingredient in recipe.ingredients.all():
            per_serving_qty = (ingredient.normalized_quantity / servings).quantize(
                Decimal("0.000001"), rounding=ROUND_HALF_UP
            )
            required_by_stock_item[ingredient.stock_item_id] += (
                per_serving_qty * qty * mult
            )

    return required_by_stock_item
