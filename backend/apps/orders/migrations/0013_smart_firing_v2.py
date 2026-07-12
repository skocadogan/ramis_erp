# Generated manually for Smart Firing v2

import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0017_kitchenstation_smart_firing_extra_buffer'),
        ('menu', '0015_alter_product_gross_price_and_more'),
        ('orders', '0012_order_orders_orde_branch__e95c01_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderitem',
            name='firing_forced_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name='Ateşleme operatör müdahalesi (şimdi başlat)',
                help_text='force-now ile set edilir; KDS firing_state için kullanılır.',
            ),
        ),
        migrations.CreateModel(
            name='ProductStationTimingStats',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True)),
                ('ema_minutes', models.FloatField(default=0.0, verbose_name='EMA (dk)')),
                ('sample_count', models.PositiveIntegerField(default=0, verbose_name='Örnek sayısı')),
                (
                    'branch',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='product_station_timing_stats',
                        to='branches.branch',
                    ),
                ),
                (
                    'product',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='station_timing_stats',
                        to='menu.product',
                    ),
                ),
                (
                    'station',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='product_timing_stats',
                        to='branches.kitchenstation',
                    ),
                ),
            ],
            options={
                'verbose_name': 'Ürün istasyon süre istatistiği',
                'verbose_name_plural': 'Ürün istasyon süre istatistikleri',
            },
        ),
        migrations.AddConstraint(
            model_name='productstationtimingstats',
            constraint=models.UniqueConstraint(
                fields=('branch', 'product', 'station'),
                name='orders_productstationtimingstats_branch_product_station_uniq',
            ),
        ),
    ]
