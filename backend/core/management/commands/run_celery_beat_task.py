"""
Beat görevini zamanlamayı beklemeden Celery kuyruğuna ekler.

Kullanım:
    python manage.py run_celery_beat_task cleanup-redis-stale-keys
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from config.celery import app


class Command(BaseCommand):
    help = "Zamanlanmış Beat görevini anında Celery kuyruğuna ekler"

    def add_arguments(self, parser):
        parser.add_argument(
            "beat_key",
            help="CELERY_BEAT_SCHEDULE anahtarı (örn. cleanup-redis-stale-keys)",
        )

    def handle(self, *args, **options):
        beat_key = options["beat_key"]
        schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", None) or {}
        if beat_key not in schedule:
            known = ", ".join(sorted(schedule.keys()))
            raise CommandError(f"Bilinmeyen Beat anahtarı: {beat_key}. Tanımlılar: {known}")

        entry = schedule[beat_key]
        task_name = entry["task"]
        routes = getattr(settings, "CELERY_TASK_ROUTES", {})
        queue = routes.get(task_name, {}).get("queue") or getattr(
            settings, "CELERY_MAINTENANCE_QUEUE", "maintenance"
        )
        args = entry.get("args", ())
        kwargs = entry.get("kwargs", {})

        result = app.send_task(task_name, args=args, kwargs=kwargs, queue=queue)
        self.stdout.write(
            self.style.SUCCESS(
                f"Kuyruğa eklendi: {task_name} (id={result.id}, queue={queue})"
            )
        )
