"""
Login rate limit (DRF LoginRateThrottle) önbellek kayıtlarını temizler.

Örnek:
  python manage.py clear_login_throttle --ip 192.168.1.50
  python manage.py clear_login_throttle --all
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.users.login_throttle import LoginThrottleClearError, clear_login_throttle


class Command(BaseCommand):
    help = "Login throttle (5/dk/IP) önbelleğini temizler."

    def add_arguments(self, parser):
        parser.add_argument(
            "--ip",
            help="Yalnızca bu istemci IP'si için throttle kaydını sil",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Tüm throttle_login_* kayıtlarını sil (Redis gerekir)",
        )

    def handle(self, *args, **options):
        ip = (options.get("ip") or "").strip() or None
        clear_all = bool(options.get("all"))

        try:
            deleted = clear_login_throttle(ip=ip, clear_all=clear_all)
        except LoginThrottleClearError as exc:
            raise CommandError(str(exc)) from exc

        if not deleted:
            self.stdout.write(self.style.WARNING("Silinecek throttle kaydı bulunamadı."))
            return

        self.stdout.write(self.style.SUCCESS(f"{len(deleted)} kayıt silindi:"))
        for key in deleted:
            self.stdout.write(f"  - {key}")
