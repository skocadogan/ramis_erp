from django.apps import AppConfig

class BranchesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.branches'

    def ready(self):
        import apps.branches.signals  # noqa: F401
        import apps.branches.reports  # noqa: F401
        import apps.branches.tasks  # noqa: F401 — Celery görev kaydı
        from apps.branches.search_config import register_search_modules
        
        register_search_modules()
