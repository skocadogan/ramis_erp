from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("menu", "0016_product_discounted_price_cached"),
    ]

    operations = [
        migrations.AlterField(
            model_name="combinedproductitem",
            name="quantity",
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal("1"),
                max_digits=12,
                verbose_name="Miktar",
            ),
        ),
    ]
