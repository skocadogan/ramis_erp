# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0004_table_reservation_info'),
    ]

    operations = [
        migrations.AddField(
            model_name='table',
            name='reservation_party_size',
            field=models.PositiveSmallIntegerField(
                blank=True,
                null=True,
                verbose_name='Rezervasyon kişi sayısı',
            ),
        ),
        migrations.AddField(
            model_name='table',
            name='reservation_scheduled_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Planlanan geliş saati (isteğe bağlı)',
                null=True,
                verbose_name='Rezervasyon saati',
            ),
        ),
    ]
