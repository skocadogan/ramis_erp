from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0019_alter_branch_options_alter_table_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='branch',
            name='table_cleaning_duration_minutes',
            field=models.PositiveSmallIntegerField(
                default=5,
                help_text='Ödeme sonrası masa Temizleniyor durumunda kalacağı dakika.',
                verbose_name='Masa temizlik süresi (dk)',
            ),
        ),
        migrations.AddField(
            model_name='table',
            name='cleaning_started_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Temizlik başlangıcı'),
        ),
        migrations.AlterField(
            model_name='table',
            name='status',
            field=models.CharField(
                choices=[
                    ('FREE', 'Boş'),
                    ('OCCUPIED', 'Dolu'),
                    ('RESERVED', 'Rezerve'),
                    ('CLEANING', 'Temizleniyor'),
                    ('OUT_OF_SERVICE', 'Hizmet Dışı'),
                ],
                default='FREE',
                max_length=20,
            ),
        ),
    ]
