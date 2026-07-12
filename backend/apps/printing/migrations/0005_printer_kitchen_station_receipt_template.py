from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0017_kitchenstation_smart_firing_extra_buffer'),
        ('printing', '0004_rename_printing_pr_printer_16a52d_idx_printing_pr_printer_775749_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='printer',
            name='kitchen_station',
            field=models.ForeignKey(
                blank=True,
                help_text='Mutfak yazıcıları için hangi istasyona ait olduğu.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='printers',
                to='branches.kitchenstation',
                verbose_name='Mutfak İstasyonu',
            ),
        ),
        migrations.AddField(
            model_name='printer',
            name='receipt_template_slug',
            field=models.SlugField(
                blank=True,
                help_text='Bu yazıcıda kullanılacak ESC/POS fiş şablon kodu.',
                max_length=100,
                null=True,
                verbose_name='Fiş Şablonu',
            ),
        ),
    ]
