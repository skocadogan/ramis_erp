from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0002_reservation_due_notified_at"),
        ("performances", "0001_initial_waiter_call_log"),
    ]

    operations = [
        migrations.AddField(
            model_name="waitercalllog",
            name="reservation",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="waiter_call_logs",
                to="reservations.reservation",
                verbose_name="Rezervasyon",
            ),
        ),
    ]
