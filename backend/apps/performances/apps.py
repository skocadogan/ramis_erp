from django.apps import AppConfig


class PerformancesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.performances'
    verbose_name = 'Performance Management'

    def ready(self):
        from apps.performances.reports import waiter_call_reports  # noqa: F401
