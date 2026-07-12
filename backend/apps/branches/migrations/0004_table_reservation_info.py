# Generated manually for reservation_info

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0003_table_min_capacity_table_notes_table_position_x_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='table',
            name='reservation_info',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Kime / iletişim / not (yalnızca rezerve masalar için)',
                verbose_name='Rezervasyon bilgisi',
            ),
        ),
    ]
