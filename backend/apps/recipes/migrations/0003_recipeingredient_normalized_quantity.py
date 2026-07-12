# Generated manually for stok birimine normalize reçete maliyeti

from django.db import migrations, models


def populate_normalized_quantities(apps, schema_editor):
    RecipeIngredient = apps.get_model('recipes', 'RecipeIngredient')
    StockItem = apps.get_model('inventory', 'StockItem')
    from apps.inventory.services import InventoryService

    for ri in RecipeIngredient.objects.all().iterator():
        try:
            item = StockItem.objects.get(pk=ri.stock_item_id)
        except StockItem.DoesNotExist:
            nq = ri.quantity
        else:
            try:
                nq, _, _ = InventoryService._normalize_quantity_to_item_unit(
                    item, ri.quantity, ri.unit
                )
            except ValueError:
                nq = ri.quantity
        RecipeIngredient.objects.filter(pk=ri.pk).update(normalized_quantity=nq)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('recipes', '0002_recipe_branches'),
    ]

    operations = [
        migrations.AddField(
            model_name='recipeingredient',
            name='normalized_quantity',
            field=models.DecimalField(
                decimal_places=3,
                help_text='Maliyet için stok kalemi birimine normalize edilmiş miktar (envanter birim dönüşümü ile).',
                max_digits=12,
                null=True,
                verbose_name='Stok birimine göre miktar',
            ),
        ),
        migrations.RunPython(populate_normalized_quantities, noop_reverse),
        migrations.AlterField(
            model_name='recipeingredient',
            name='normalized_quantity',
            field=models.DecimalField(
                decimal_places=3,
                help_text='Maliyet için stok kalemi birimine normalize edilmiş miktar (envanter birim dönüşümü ile).',
                max_digits=12,
                verbose_name='Stok birimine göre miktar',
            ),
        ),
    ]
