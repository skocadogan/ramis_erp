# Generated manually

from decimal import Decimal
from django.db import migrations, models


def seed_gross_from_base(apps, schema_editor):
    Product = apps.get_model('menu', 'Product')
    for row in Product.objects.all().only('id', 'base_price').iterator():
        Product.objects.filter(pk=row.pk).update(
            gross_price=row.base_price.quantize(Decimal('0.01')),
            tax_rate=Decimal('0'),
        )


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0013_combinedproductitem_product_unit'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='gross_price',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Vergi hariç birim fiyat; net satış ile birlikte saklanır.',
                max_digits=12,
                verbose_name='Brüt Fiyat (KDV hariç)',
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='product',
            name='tax_rate',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='KDV / satış vergisi yüzdesi (örn. 20).',
                max_digits=6,
                verbose_name='Vergi Oranı (%)',
            ),
        ),
        migrations.RunPython(seed_gross_from_base, migrations.RunPython.noop),
    ]
