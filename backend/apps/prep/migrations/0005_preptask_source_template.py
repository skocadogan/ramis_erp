import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('prep', '0004_alter_preptemplate_options_prepsmartrule'),
    ]

    operations = [
        migrations.AddField(
            model_name='preptask',
            name='source_template',
            field=models.ForeignKey(
                blank=True,
                help_text='Şablondan otomatik oluşturulduysa bağlantı; aynı gün tekrar üretimi engellemek için kullanılır.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='generated_tasks',
                to='prep.preptemplate',
                verbose_name='Kaynak şablon',
            ),
        ),
    ]
