from datetime import date
from decimal import Decimal
from apps.production_planning.services.availability_service import check_product_availability
from apps.production_planning.models import PosBlockMode

def check_cart_with_production(branch_id: str, items_data: list[dict], check_date: date = None) -> dict:
    """
    Sipariş sepetindeki ürünleri 'Ürün Kalmadı' veya porsiyon limiti açısından denetler.
    items_data formatı: [{"product_id": str, "quantity": int/Decimal, ...}]
    
    Dönüş:
    {
        "ok": bool (Bloke eden bir durum var mı?),
        "production_issues": [
            {"code": "SOLD_OUT", "product_id": str, "reason": str, "block_mode": str}
        ]
    }
    """
    issues = []
    # Aynı üründen sepette birden fazla satır olabilir, toplamlarını bul.
    product_totals = {}
    for item in items_data:
        pid = str(item["product_id"])
        qty = Decimal(str(item["quantity"]))
        product_totals[pid] = product_totals.get(pid, Decimal("0")) + qty

    from apps.menu.models import Product
    pmap = {str(p.id): p.name for p in Product.objects.filter(id__in=product_totals.keys())}

    overall_block = False
    for pid, qty in product_totals.items():
        avail = check_product_availability(branch_id, pid, qty, check_date)
        if not avail["allowed"]:
            # Frontend PosStationStockIssue arayüzü ile uyumlu hale getiriyoruz
            rem = avail.get("remaining_portions")
            rem_str = str(rem) if rem is not None else "0"
            
            issues.append({
                "code": avail["code"], 
                "product_id": pid,
                "stock_item_name": pmap.get(pid, "Bilinmeyen Ürün"),
                "reason": avail["reason"],
                "block_mode": avail["block_mode"],
                # NaN önlemek için frontend'in beklediği alanlar:
                "physical": rem_str,
                "available": rem_str,
                "reserved": "0",
                "unit": "porsiyon",
                "warehouse_name": "Üretim",
                "station_name": None,
            })
            if avail["block_mode"] == PosBlockMode.BLOCK:
                overall_block = True
                
    return {
        "ok": not overall_block,
        "production_issues": issues
    }
