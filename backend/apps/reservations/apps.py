from django.apps import AppConfig


class ReservationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.reservations"
    verbose_name = "Rezervasyonlar"

    def ready(self):
        from apps.reservations.search_config import register_search_modules
        register_search_modules()
