from django.apps import AppConfig


class RecipeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.recipes'
    verbose_name = 'Reçete Yönetimi'

    def ready(self):
        import apps.recipes.signals  # noqa: F401
        from apps.recipes.search_config import register_search_modules
        from apps.recipes.reports import recipe_reports
        register_search_modules()

