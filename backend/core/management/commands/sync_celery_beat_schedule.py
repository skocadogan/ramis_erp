"""
CELERY_BEAT_SCHEDULE tanımlarını django_celery_beat PeriodicTask tablosuna yazar.

Kullanım:
    python manage.py sync_celery_beat_schedule
    python manage.py sync_celery_beat_schedule --dry-run

Üretimde ramis-beat.service DatabaseScheduler kullanır; migrate/deploy sonrası
bu komut çalıştırılmazsa zamanlanmış görevler tetiklenmez.
"""

from django.core.management.base import BaseCommand

from core.celery_beat_sync import sync_celery_beat_schedule


class Command(BaseCommand):
    help = "CELERY_BEAT_SCHEDULE → django_celery_beat PeriodicTask senkronizasyonu"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Veritabanına yazmadan yalnızca tanım sayısını göster",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if dry_run:
            from django.conf import settings

            count = len(getattr(settings, "CELERY_BEAT_SCHEDULE", {}) or {})
            self.stdout.write(
                self.style.WARNING(f"Dry-run: {count} görev tanımı senkronize edilecek.")
            )
            return

        stats = sync_celery_beat_schedule()
        self.stdout.write(
            self.style.SUCCESS(
                "Celery Beat senkronize edildi — "
                f"oluşturulan: {stats['created']}, "
                f"güncellenen: {stats['updated']}, "
                f"değişmeyen: {stats['unchanged']}, "
                f"devre dışı bırakılan: {stats['disabled']}"
            )
        )
