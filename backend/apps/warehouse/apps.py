from django.apps import AppConfig


class WarehouseConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.warehouse'
    verbose_name = 'Depo Yönetimi'

    def ready(self):
        from apps.warehouse.search_config import register_search_modules
        from apps.warehouse.reports import warehouse_reports  # noqa: F401 — report_registry

        register_search_modules()
