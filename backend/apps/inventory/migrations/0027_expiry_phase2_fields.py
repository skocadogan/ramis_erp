# Generated manually for SKT Phase-2

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0026_stockmovementlot'),
    ]

    operations = [
        migrations.AddField(
            model_name='stocklot',
            name='fefo_priority_boost',
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text='Yüksek değer önce tüketilir (SKT öncelikli tüketim aksiyonu).',
                verbose_name='FEFO Öncelik Boost',
            ),
        ),
        migrations.AddField(
            model_name='stocklot',
            name='fefo_priority_until',
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name='FEFO Boost Geçerlilik',
            ),
        ),
        migrations.AddField(
            model_name='expiryaction',
            name='automation_applied',
            field=models.BooleanField(default=False, verbose_name='Otomasyon Uygulandı'),
        ),
        migrations.AddField(
            model_name='expiryaction',
            name='result_json',
            field=models.JSONField(blank=True, default=dict, verbose_name='Otomasyon Sonucu'),
        ),
    ]
