"""
Data migration: Mevcut RecipeIngredient.normalized_quantity değerlerini
decimal_places=6 hassasiyetiyle yeniden hesaplar.
"""

from django.db import migrations


def recalculate_normalized_quantities(apps, schema_editor):
    RecipeIngredient = apps.get_model('recipes', 'RecipeIngredient')
    StockItem = apps.get_model('inventory', 'StockItem')
    StockUnit = apps.get_model('inventory', 'StockUnit')

    from decimal import Decimal, ROUND_HALF_UP

    def normalize(quantity, from_short, to_short):
        if from_short == to_short:
            return quantity
        try:
            from_u = StockUnit.objects.get(short_name=from_short)
            to_u = StockUnit.objects.get(short_name=to_short)
        except StockUnit.DoesNotExist:
            return quantity
        if to_u.multiplier == 0:
            return quantity
        return (
            (Decimal(str(quantity)) * Decimal(str(from_u.multiplier)))
            / Decimal(str(to_u.multiplier))
        ).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)

    ingredients = RecipeIngredient.objects.select_related('stock_item').all()
    batch = []
    for ing in ingredients:
        si = ing.stock_item
        new_nq = normalize(ing.quantity, ing.unit, si.unit)
        if ing.normalized_quantity != new_nq:
            ing.normalized_quantity = new_nq
            batch.append(ing)

    if batch:
        RecipeIngredient.objects.bulk_update(batch, ['normalized_quantity'])


class Migration(migrations.Migration):

    dependencies = [
        ('recipes', '0004_increase_decimal_precision'),
        ('inventory', '0014_increase_decimal_precision'),
    ]

    operations = [
        migrations.RunPython(
            recalculate_normalized_quantities,
            migrations.RunPython.noop,
        ),
    ]
