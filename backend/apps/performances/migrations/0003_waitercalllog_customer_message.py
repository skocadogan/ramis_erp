from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("performances", "0002_waitercalllog_reservation"),
    ]

    operations = [
        migrations.AddField(
            model_name="waitercalllog",
            name="customer_message",
            field=models.CharField(
                blank=True,
                default="",
                max_length=500,
                verbose_name="Misafir mesajı",
            ),
        ),
    ]
