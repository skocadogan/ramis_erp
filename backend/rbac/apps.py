from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class RbacConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'rbac'
    verbose_name = _('RBAC - Rol Tabanlı Erişim Kontrolü')

    def ready(self):
        import rbac.signals  # noqa: F401 - Sinyalleri yükle
