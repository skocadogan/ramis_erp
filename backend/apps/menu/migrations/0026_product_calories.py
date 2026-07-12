from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0025_add_performance_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='calories',
            field=models.PositiveIntegerField(
                blank=True,
                help_text='Porsiyon başına enerji değeri (kCal).',
                null=True,
                verbose_name='Kalori (kCal)',
            ),
        ),
    ]
