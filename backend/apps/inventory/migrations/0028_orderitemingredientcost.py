import uuid
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0021_branch_new_fields'),
        ('inventory', '0027_expiry_phase2_fields'),
        ('menu', '0028_menutag_branch_scope'),
        ('orders', '0024_add_performance_indexes'),
        ('warehouse', '0012_alter_purchaseorderitem_quantity_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrderItemIngredientCost',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True)),
                ('quantity', models.DecimalField(decimal_places=6, max_digits=12, verbose_name='Miktar')),
                ('unit_cost_snapshot', models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name='Birim Maliyet Snapshot')),
                ('line_cost_snapshot', models.DecimalField(decimal_places=2, default=0, max_digits=12, verbose_name='Satır Maliyet Snapshot')),
                ('committed_at', models.DateTimeField(default=django.utils.timezone.now, verbose_name='Commit Zamanı')),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='ingredient_cost_entries', to='branches.branch', verbose_name='Şube')),
                ('movement', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='ingredient_cost_entries', to='inventory.stockmovement', verbose_name='İlgili Stok Hareketi')),
                ('order_item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ingredient_cost_entries', to='orders.orderitem', verbose_name='Sipariş Kalemi')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='ingredient_cost_entries', to='menu.product', verbose_name='Ürün')),
                ('stock_item', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='ingredient_cost_entries', to='inventory.stockitem', verbose_name='Stok Kalemi')),
                ('warehouse', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='ingredient_cost_entries', to='warehouse.warehouse', verbose_name='Depo')),
            ],
            options={
                'verbose_name': 'Sipariş Ingredient Maliyet Kaydı',
                'verbose_name_plural': 'Sipariş Ingredient Maliyet Kayıtları',
                'ordering': ['-committed_at', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='orderitemingredientcost',
            index=models.Index(fields=['order_item', '-committed_at'], name='invent_ordi_order_i_cd4e4e_idx'),
        ),
        migrations.AddIndex(
            model_name='orderitemingredientcost',
            index=models.Index(fields=['branch', '-committed_at'], name='invent_ordi_branch__b27a84_idx'),
        ),
        migrations.AddIndex(
            model_name='orderitemingredientcost',
            index=models.Index(fields=['stock_item', '-committed_at'], name='invent_ordi_stock_i_9e7b5f_idx'),
        ),
        migrations.AddIndex(
            model_name='orderitemingredientcost',
            index=models.Index(fields=['movement'], name='invent_ordi_movement_6ca69c_idx'),
        ),
    ]
