# Generated manually for Smart Firing v2

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0016_branchordercounter'),
    ]

    operations = [
        migrations.AddField(
            model_name='kitchenstation',
            name='smart_firing_extra_buffer_minutes',
            field=models.PositiveSmallIntegerField(
                blank=True,
                null=True,
                verbose_name='Smart Firing ek buffer (dk)',
                help_text='Smart Firing v2 açıkken bu istasyon için lead time’a eklenecek ek dakika; boş ise yalnızca kuyruk formülü uygulanır.',
            ),
        ),
    ]
