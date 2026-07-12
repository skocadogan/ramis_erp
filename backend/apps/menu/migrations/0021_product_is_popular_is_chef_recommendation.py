from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0020_recalculate_discount_caches'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='is_popular',
            field=models.BooleanField(
                default=False,
                help_text="İşaretlenirse ürün dijital menüde 'Popüler' etiketiyle gösterilir.",
                verbose_name='Popüler',
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='is_chef_recommendation',
            field=models.BooleanField(
                default=False,
                help_text="İşaretlenirse ürün dijital menüde 'Şefin Önerisi' etiketiyle gösterilir.",
                verbose_name='Şefin Önerisi',
            ),
        ),
    ]
