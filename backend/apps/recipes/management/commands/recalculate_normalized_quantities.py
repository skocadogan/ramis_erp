"""
Management command: Tüm RecipeIngredient.normalized_quantity değerlerini
mevcut StockUnit.multiplier değerlerine göre yeniden hesaplar.

Kullanım:
    python manage.py recalculate_normalized_quantities
    python manage.py recalculate_normalized_quantities --dry-run
"""

from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand

from apps.inventory.services import InventoryService
from apps.recipes.models import RecipeIngredient


class Command(BaseCommand):
    help = 'RecipeIngredient.normalized_quantity değerlerini yeniden hesaplar.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Değişiklik yapmadan sadece raporla.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        ingredients = RecipeIngredient.objects.select_related(
            'stock_item', 'recipe__product'
        ).all()

        updated = 0
        skipped = 0
        errors = 0

        batch = []
        for ing in ingredients:
            try:
                new_nq, _, _ = InventoryService._normalize_quantity_to_item_unit(
                    ing.stock_item, ing.quantity, ing.unit
                )
                new_nq = new_nq.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)

                if ing.normalized_quantity != new_nq:
                    if not dry_run:
                        ing.normalized_quantity = new_nq
                        batch.append(ing)
                    self.stdout.write(
                        f'  Güncelleniyor: {ing.recipe.name} / {ing.stock_item.name}: '
                        f'{ing.normalized_quantity} → {new_nq} {ing.stock_item.unit}'
                    )
                    updated += 1
                else:
                    skipped += 1
            except Exception as e:
                self.stderr.write(
                    self.style.ERROR(
                        f'Hata: {ing.recipe.name} / {ing.stock_item.name}: {e}'
                    )
                )
                errors += 1

        if batch and not dry_run:
            RecipeIngredient.objects.bulk_update(batch, ['normalized_quantity'])

        prefix = '[DRY-RUN] ' if dry_run else ''
        self.stdout.write(
            self.style.SUCCESS(
                f'{prefix}Tamamlandı: {updated} güncellendi, {skipped} atlandı, {errors} hata.'
            )
        )
