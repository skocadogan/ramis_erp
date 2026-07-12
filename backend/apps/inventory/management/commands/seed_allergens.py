from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.inventory.models import Allergen

DEFAULT_ALLERGENS = [
    ('ALG-MILK-01', 'İnek sütü', '2.50', 9, 1),
    ('ALG-EGG-01', 'Yumurta beyazı', '2.00', 8, 2),
    ('ALG-PEANUT-01', 'Yer fıstığı', '1.40', 10, 3),
    ('ALG-SHRIMP-01', 'Karides', '1.20', 9, 4),
    ('ALG-WHEAT-01', 'Buğday unu', '0.60', 7, 5),
    ('ALG-NUT-HAZEL', 'Fındık', '0.50', 8, 6),
    ('ALG-NUT-WALNUT', 'Ceviz', '0.50', 8, 7),
    ('ALG-EGG-02', 'Yumurta sarısı', '0.40', 5, 8),
    ('ALG-SOYA-01', 'Soya fasulyesi', '0.40', 6, 9),
    ('ALG-CRAB-01', 'Yengeç', '0.30', 7, 10),
    ('ALG-LOBSTER-01', 'Istakoz', '0.30', 7, 11),
    ('ALG-NUT-ALMOND', 'Badem', '0.20', 7, 12),
    ('ALG-NUT-CASHEW', 'Kaju', '0.20', 8, 13),
    ('ALG-NUT-PISTACH', 'Antep fıstığı', '0.20', 7, 14),
    ('ALG-SESAME-01', 'Susam', '0.20', 8, 15),
    ('ALG-SESAME-02', 'Tahin', '0.20', 8, 16),
    ('ALG-FISH-SALMON', 'Somon', '0.20', 7, 17),
    ('ALG-FISH-TUNA', 'Ton balığı', '0.20', 7, 18),
    ('ALG-SOYA-02', 'Soya sosu', '0.15', 5, 19),
    ('ALG-FISH-HADDOC', 'Mezgit', '0.15', 6, 20),
    ('ALG-FISH-COD', 'Morina', '0.15', 6, 21),
    ('ALG-FISH-ANCHOV', 'Ançüez (Hamsi özü)', '0.10', 6, 22),
    ('ALG-MOLL-SQUID', 'Kalamar', '0.10', 5, 23),
    ('ALG-MOLL-MUSSEL', 'Midye', '0.10', 5, 24),
    ('ALG-MOLL-OCTOP', 'Ahtapot', '0.10', 5, 25),
    ('ALG-MOLL-OYSTER', 'İstiridye', '0.08', 5, 26),
    ('ALG-CELERY-01', 'Kereviz kökü', '0.05', 4, 27),
    ('ALG-CELERY-02', 'Kereviz sapı', '0.05', 4, 28),
    ('ALG-MUSTARD-01', 'Hardal tohumu / Hazır hardal', '0.05', 5, 29),
    ('ALG-SULFITE-01', 'Sülfitler / Kükürt dioksit', '0.05', 4, 30),
    ('ALG-NUT-PINE', 'Çam fıstığı', '0.03', 6, 31),
    ('ALG-LUPIN-01', 'Lupin unu (Acı bakla)', '0.02', 4, 32),
]


class Command(BaseCommand):
    help = 'Varsayılan allerjen maddelerini yükler (code ile idempotent upsert).'

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0
        for code, name, prevalence, risk, sort_order in DEFAULT_ALLERGENS:
            obj, created = Allergen.objects.update_or_create(
                code=code,
                defaults={
                    'name': name,
                    'prevalence_pct': Decimal(prevalence),
                    'risk_score': risk,
                    'sort_order': sort_order,
                    'is_active': True,
                },
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Created allergen: {code}'))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(f'Updated allergen: {code}'))

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Created={created_count}, Updated={updated_count}, Total={len(DEFAULT_ALLERGENS)}'
            )
        )
