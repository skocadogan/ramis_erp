from django.apps import AppConfig


class SalesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.sales'
    verbose_name = 'Sales Management'

    def ready(self):
        from apps.sales.search_config import register_search_modules
        from apps.sales.reports import sales_reports, product_reports # Register reports
        register_search_modules()

