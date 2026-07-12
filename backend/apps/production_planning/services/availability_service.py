from datetime import date
from decimal import Decimal
from django.utils import timezone
from apps.production_planning.models import (
    ProductDayAvailability, 
    AvailabilityMode, 
    ProductionDaySettings,
    PosBlockMode
)

def check_product_availability(branch_id: str, product_id: str, requested_qty: Decimal, check_date: date = None) -> dict:
    """
    Ürünün o gün için satışa kapalı (Ürün Kalmadı) olup olmadığını kontrol eder.
    Sınırlı kota (LIMITED) ise mevcut sepetteki adet limiti aşıyor mu diye bakar.
    """
    if not check_date:
        check_date = timezone.now().date()
        
    try:
        settings = ProductionDaySettings.objects.get(branch_id=branch_id)
        block_mode = settings.pos_block_mode
    except ProductionDaySettings.DoesNotExist:
        block_mode = PosBlockMode.WARN
        
    if block_mode == PosBlockMode.OFF:
        return {"allowed": True, "reason": None, "block_mode": block_mode, "code": "OK"}

    availability = ProductDayAvailability.objects.filter(
        branch_id=branch_id,
        product_id=product_id,
        effective_date=check_date,
        is_active=True,
    ).first()
    
    if availability:
        if availability.mode == AvailabilityMode.SOLD_OUT:
            return {
                "allowed": False, 
                "reason": "Ürün Kalmadı", 
                "block_mode": block_mode,
                "code": "SOLD_OUT",
                "remaining_portions": 0
            }
        elif availability.mode == AvailabilityMode.LIMITED:
            if availability.remaining_portions is not None and requested_qty > availability.remaining_portions:
                return {
                    "allowed": False, 
                    "reason": f"Sadece {availability.remaining_portions} porsiyon kaldı.", 
                    "block_mode": block_mode,
                    "code": "LIMITED_EXCEEDED",
                    "remaining_portions": availability.remaining_portions
                }

    return {"allowed": True, "reason": None, "block_mode": block_mode, "code": "OK"}
