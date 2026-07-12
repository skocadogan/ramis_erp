from django.apps import AppConfig

class MenuConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.menu'
    verbose_name = 'Menu Management'

    def ready(self):
        import apps.menu.signals  # noqa: F401
        from apps.menu.search_config import register_search_modules
        register_search_modules()
