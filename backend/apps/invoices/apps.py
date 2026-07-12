from django.apps import AppConfig


class InvoicesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.invoices"
    verbose_name = "Faturalar"

    def ready(self):
        from apps.invoices.search_config import register_search_modules
        register_search_modules()
