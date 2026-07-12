"""
Rollback Script: Tüm ACTIVE ProductionReservation kayıtlarını RELEASED yapar.
Feature flag PRODUCTION_STOCK_RESERVATION_ENABLED=False yapıldığında çalıştırılır.

Kullanım:
    python manage.py shell < scripts/rollback_production_reservations.py
"""

from apps.inventory.models import ProductionReservation, ProductionReservationStatus

count = ProductionReservation.objects.filter(
    status=ProductionReservationStatus.ACTIVE,
    is_active=True,
).update(
    status=ProductionReservationStatus.RELEASED,
    is_active=False,
)

print(f"{count} ACTIVE production reservation(s) released.")
