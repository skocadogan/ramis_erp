from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Sum
from apps.orders.models import OrderItem, OrderStatus
from apps.production_planning.models import ProductionDaySettings

def generate_forecast(branch_id: str, target_date: date, horizon_weeks: int = 4) -> dict[str, dict]:
    """
    Belirli bir şube ve tarih için geçmiş haftalardaki satışı temel alan tahmin çıkarır.
    
    Örneğin: Hedef tarih 15 Mayıs Çarşamba ise, geçmiş 'horizon_weeks' kadar
    Çarşamba gününün satış (OrderItem.quantity) ortalamasını alır.
    
    Dönüş: { product_id (str): {"forecasted_qty": Decimal, "base_avg": float} }
    """
    dates_to_check = []
    for w in range(1, horizon_weeks + 1):
        dates_to_check.append(target_date - timedelta(days=w * 7))

    qs = OrderItem.objects.filter(
        order__branch_id=branch_id,
        order__sale__isnull=False,
        order__sale__is_deleted=False,
        order__sale__paid_at__date__in=dates_to_check,
        parent_item__isnull=True,
        status=OrderStatus.COMPLETED,
    )
    
    rows = qs.values("product_id").annotate(total_qty=Sum("quantity"))
    
    forecast = {}
    for r in rows:
        prod_id = str(r["product_id"])
        total_qty = r["total_qty"] or 0
        avg_qty = Decimal(str(total_qty)) / Decimal(str(horizon_weeks))
        if avg_qty > 0:
            forecast[prod_id] = forecast.get(prod_id, Decimal("0")) + avg_qty
            
    try:
        settings = ProductionDaySettings.objects.get(branch_id=branch_id)
        safety_factor = settings.default_safety_factor
    except ProductionDaySettings.DoesNotExist:
        safety_factor = Decimal("1.00")
        
    final_forecast = {}
    for pid, qty in forecast.items():
        # Güvenlik çarpanını uygula ve tam sayıya yakınsa (örneğin porsiyon adet bazlıdır)
        # tek ondalıklı veya tam sayı yuvarla. Burada miktar genelde integer.
        final_qty = (qty * safety_factor).quantize(Decimal("1"))
        if final_qty > 0:
            final_forecast[pid] = {
                "forecasted_qty": final_qty,
                "base_avg": float(qty)
            }

    return final_forecast
