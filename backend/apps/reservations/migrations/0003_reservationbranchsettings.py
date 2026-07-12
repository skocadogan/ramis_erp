import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("branches", "0001_initial"),
        ("reservations", "0002_reservation_due_notified_at"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReservationBranchSettings",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "due_alert_lead_minutes",
                    models.PositiveSmallIntegerField(
                        default=15,
                        help_text="Rezervasyon saatinden kaç dakika önce geliş bildirimleri başlasın.",
                        verbose_name="Bildirim başlangıç (dk önce)",
                    ),
                ),
                (
                    "due_alert_interval_minutes",
                    models.PositiveSmallIntegerField(
                        default=5,
                        help_text="Geliş bildirimleri kaç dakikada bir tekrarlansın.",
                        verbose_name="Bildirim tekrar aralığı (dk)",
                    ),
                ),
                (
                    "branch",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reservation_branch_settings",
                        to="branches.branch",
                        verbose_name="Şube",
                    ),
                ),
            ],
            options={
                "verbose_name": "Rezervasyon şube ayarı",
                "verbose_name_plural": "Rezervasyon şube ayarları",
            },
        ),
    ]
