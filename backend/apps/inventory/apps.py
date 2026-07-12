from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.inventory'
    verbose_name = 'Stok & Depo Yönetimi'

    def ready(self):
        import apps.inventory.signals  # noqa: F401
        from apps.inventory.search_config import register_search_modules
        from apps.inventory.reports import inventory_reports # Register reports
        register_search_modules()
