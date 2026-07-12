# Generated manually for StockReceiptDraft / StockReceiptDraftLine

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0012_stockreservation'),
        ('warehouse', '0007_purchaseorder_deficiency_report_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='StockReceiptDraft',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True)),
                ('reference', models.CharField(blank=True, default='', max_length=200, verbose_name='Fatura / İrsaliye Referansı')),
                ('notes', models.TextField(blank=True, default='', verbose_name='Notlar')),
                ('status', models.CharField(
                    choices=[('DRAFT', 'Taslak'), ('POSTED', 'Kesinleştirildi')],
                    default='DRAFT',
                    max_length=20,
                    verbose_name='Durum',
                )),
                ('posted_at', models.DateTimeField(blank=True, null=True, verbose_name='Kesinleştirme Zamanı')),
                ('supplier', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='stock_receipt_drafts',
                    to='inventory.supplier',
                    verbose_name='Tedarikçi',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='stock_receipt_drafts',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Oluşturan',
                )),
                ('warehouse', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='stock_receipt_drafts',
                    to='warehouse.warehouse',
                    verbose_name='Depo',
                )),
            ],
            options={
                'verbose_name': 'Toplu Stok Girişi Taslağı',
                'verbose_name_plural': 'Toplu Stok Girişi Taslakları',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.CreateModel(
            name='StockReceiptDraftLine',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.PositiveIntegerField(default=0, verbose_name='Sıra')),
                ('temp_name', models.CharField(blank=True, default='', max_length=200, verbose_name='Geçici Ad (yeni kalem)')),
                ('temp_sku', models.CharField(blank=True, default='', max_length=50, verbose_name='Geçici SKU')),
                ('temp_unit', models.CharField(blank=True, default='', max_length=20, verbose_name='Geçici Birim')),
                ('quantity', models.DecimalField(decimal_places=3, max_digits=12, verbose_name='Miktar')),
                ('unit', models.CharField(blank=True, default='', help_text='StockUnit.short_name; boşsa stok kaleminin birimi kullanılır', max_length=20, verbose_name='Fatura Birimi')),
                ('unit_price', models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name='Birim Fiyat')),
                ('lot_number', models.CharField(blank=True, default='', max_length=100, verbose_name='Parti/Lot')),
                ('expiry_date', models.DateField(blank=True, null=True, verbose_name='SKT')),
                ('draft', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='lines',
                    to='inventory.stockreceiptdraft',
                    verbose_name='Taslak',
                )),
                ('stock_item', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='receipt_draft_lines',
                    to='inventory.stockitem',
                    verbose_name='Stok Kalemi',
                )),
                ('temp_category', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='receipt_draft_lines',
                    to='inventory.stockcategory',
                    verbose_name='Geçici Kategori',
                )),
            ],
            options={
                'verbose_name': 'Taslak Satırı',
                'verbose_name_plural': 'Taslak Satırları',
                'ordering': ['sort_order', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='stockreceiptdraft',
            index=models.Index(fields=['user', 'status'], name='inventory_s_user_id_8f0b2d_idx'),
        ),
        migrations.AddIndex(
            model_name='stockreceiptdraft',
            index=models.Index(fields=['warehouse', 'status'], name='inventory_s_warehou_3a9c1e_idx'),
        ),
        migrations.AddIndex(
            model_name='stockreceiptdraftline',
            index=models.Index(fields=['draft', 'sort_order'], name='inventory_s_draft_i_7e4a2b_idx'),
        ),
    ]
