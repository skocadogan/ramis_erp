# Generated manually — birleşik alt kalemlerde porsiyon çarpanı

from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0007_order_order_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderitem',
            name='portion_multiplier',
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal('1'),
                help_text='Birleşik ürün alt kaleminde reçete düşümü: miktar × bu çarpan (satış birimi).',
                max_digits=10,
                verbose_name='Porsiyon çarpanı',
            ),
        ),
    ]
