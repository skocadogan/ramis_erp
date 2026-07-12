from django.apps import AppConfig


class OrdersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.orders"
    verbose_name = "Order Management"

    def ready(self):
        import apps.orders.signals  # noqa: F401
        from apps.orders.search_config import register_search_modules
        register_search_modules()
