from django.apps import AppConfig

class CustomersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.customers'
    verbose_name = 'Customer Management'

    def ready(self):
        from apps.customers.search_config import register_search_modules
        from apps.customers.reports import CustomerListReport, CustomerSalesDetailReport
        register_search_modules()
