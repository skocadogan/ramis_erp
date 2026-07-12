# Generated manually for SKT Phase-2

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0027_expiry_phase2_fields'),
        ('warehouse', '0010_stockcountingitem_difference_reason_linked_movement'),
    ]

    operations = [
        migrations.AddField(
            model_name='warehousetransfer',
            name='source_expiry_action',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='transfers',
                to='inventory.expiryaction',
                verbose_name='Bağlı SKT Aksiyonu',
            ),
        ),
    ]
