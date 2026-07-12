from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="due_notified_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Rezervasyon saati bildirimi",
            ),
        ),
    ]
