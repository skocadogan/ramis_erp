from django.core.management.base import BaseCommand
from apps.inventory.models import StockUnit, UnitCategory
from decimal import Decimal

class Command(BaseCommand):
    help = 'Seeds initial stock units'

    def handle(self, *args, **kwargs):
        # (name, short_name, multiplier, category)
        units = [
            ('Kilogram', 'kg', '1', UnitCategory.WEIGHT),
            ('Gram', 'g', '0.001', UnitCategory.WEIGHT),
            ('Adet', 'adet', '1', UnitCategory.COUNT),
            ('Paket', 'pk', '1', UnitCategory.COUNT),
            ('Porsiyon', 'porsiyon', '1', UnitCategory.COUNT),
            ('Kutu', 'kutu', '1', UnitCategory.COUNT),
            ('Şişe', 'şişe', '1', UnitCategory.COUNT),
            ('Litre', 'Lt', '1', UnitCategory.VOLUME),
            ('Mili Litre', 'ml', '0.001', UnitCategory.VOLUME),
        ]

        for name, short_name, multiplier, category in units:
            unit, created = StockUnit.objects.get_or_create(
                short_name=short_name,
                defaults={
                    'name': name,
                    'multiplier': Decimal(multiplier),
                    'category': category,
                }
            )
            if not created and unit.category != category:
                unit.category = category
                unit.save(update_fields=['category'])
                self.stdout.write(self.style.SUCCESS(f'Updated category for unit: {name}'))
            elif created:
                self.stdout.write(self.style.SUCCESS(f'Created unit: {name}'))
            else:
                self.stdout.write(self.style.WARNING(f'Unit already exists: {name}'))
