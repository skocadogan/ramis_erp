# Generated manually for birleşik ürün satış birimi

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0012_product_branches'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='combinedproductitem',
            unique_together=set(),
        ),
        migrations.AddField(
            model_name='combinedproductitem',
            name='product_unit',
            field=models.ForeignKey(
                blank=True,
                help_text='Alt ürünün satış birimi (örn. tam / yarım porsiyon). Boş bırakılırsa çarpan 1 kabul edilir.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='combined_usages',
                to='menu.productunit',
                verbose_name='Satış Birimi',
            ),
        ),
    ]
