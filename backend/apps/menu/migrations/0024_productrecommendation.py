import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0023_category_parent'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductRecommendation',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True)),
                ('order', models.PositiveIntegerField(default=0, verbose_name='Sıra')),
                (
                    'product_unit',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='recommendation_usages',
                        to='menu.productunit',
                        verbose_name='Satış Birimi',
                    ),
                ),
                (
                    'recommended_product',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='recommended_for_sources',
                        to='menu.product',
                        verbose_name='Önerilen Ürün',
                    ),
                ),
                (
                    'source_product',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='recommendations',
                        to='menu.product',
                        verbose_name='Kaynak Ürün',
                    ),
                ),
            ],
            options={
                'verbose_name': 'Ürün Önerisi',
                'verbose_name_plural': 'Ürün Önerileri',
                'ordering': ['order', 'created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='productrecommendation',
            constraint=models.UniqueConstraint(
                fields=('source_product', 'recommended_product'),
                name='menu_productrecommendation_unique_source_recommended',
            ),
        ),
    ]
