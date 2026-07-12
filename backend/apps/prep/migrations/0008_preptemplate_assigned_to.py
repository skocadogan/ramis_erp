from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('prep', '0007_alter_preptemplate_options'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='preptemplate',
            name='assigned_to',
            field=models.ForeignKey(
                blank=True,
                help_text='Boş bırakılırsa herkese atanır.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assigned_prep_templates',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Atanan Kişi',
            ),
        ),
    ]
