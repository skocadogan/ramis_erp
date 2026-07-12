# Generated manually for PrintJob model

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("printing", "0002_printer_usage_type"),
    ]

    operations = [
        migrations.CreateModel(
            name="PrintJob",
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
                    "receipt_slug",
                    models.SlugField(max_length=100, verbose_name="Fiş şablon kodu"),
                ),
                ("context", models.JSONField(default=dict, verbose_name="Şablon bağlamı")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Bekliyor"),
                            ("PROCESSING", "İşleniyor"),
                            ("COMPLETED", "Tamamlandı"),
                            ("FAILED", "Başarısız"),
                        ],
                        db_index=True,
                        default="PENDING",
                        max_length=20,
                        verbose_name="Durum",
                    ),
                ),
                (
                    "error_message",
                    models.TextField(blank=True, default="", verbose_name="Hata mesajı"),
                ),
                (
                    "idempotency_key",
                    models.CharField(
                        blank=True,
                        help_text="Aynı anahtarla tekrar istek yinelenen iş üretmez.",
                        max_length=128,
                        null=True,
                        unique=True,
                        verbose_name="Idempotency anahtarı",
                    ),
                ),
                (
                    "completed_at",
                    models.DateTimeField(
                        blank=True,
                        null=True,
                        verbose_name="Tamamlanma zamanı",
                    ),
                ),
                (
                    "printer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="print_jobs",
                        to="printing.printer",
                        verbose_name="Yazıcı",
                    ),
                ),
            ],
            options={
                "verbose_name": "Yazdırma işi",
                "verbose_name_plural": "Yazdırma işleri",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="printjob",
            index=models.Index(
                fields=["printer", "status", "created_at"],
                name="printing_pr_printer_16a52d_idx",
            ),
        ),
    ]
