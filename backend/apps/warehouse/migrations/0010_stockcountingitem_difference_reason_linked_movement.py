from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0025_stockmovement_cancel_type'),
        ('warehouse', '0009_remove_deficiencyreport_warehouse_d_status_c23cb7_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='stockcountingitem',
            name='difference_reason',
            field=models.CharField(
                blank=True,
                choices=[
                    ('CORRECTION', 'Düzeltme'),
                    ('WRONG_MEASUREMENT', 'Yanlış Ölçüm'),
                    ('CANCEL_RETURN', 'İptal / İade'),
                    ('WASTE', 'Fire / Zayi'),
                    ('OTHER', 'Diğer'),
                ],
                max_length=30,
                null=True,
                verbose_name='Fark Nedeni',
            ),
        ),
        migrations.AddField(
            model_name='stockcountingitem',
            name='linked_movement',
            field=models.ForeignKey(
                blank=True,
                help_text='Onayda oluşturulan iptal/iade, fire veya düzeltme hareketi.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='counting_items',
                to='inventory.stockmovement',
                verbose_name='Bağlı Stok Hareketi',
            ),
        ),
    ]
