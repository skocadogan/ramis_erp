from django.apps import AppConfig


class ProductionPlanningConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.production_planning'
    verbose_name = "Üretim Planlama"

    def ready(self):
        import apps.production_planning.reports
