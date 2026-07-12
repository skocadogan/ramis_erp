import logging

from django.utils.deprecation import MiddlewareMixin
from django.utils.functional import SimpleLazyObject

logger = logging.getLogger(__name__)


def get_user_permissions(request):
    """Kullanıcı izinlerini almak için yardımcı fonksiyon"""
    if not hasattr(request, '_cached_user_permissions'):
        if request.user.is_authenticated:
            try:
                perms = request.user.get_all_permissions()
                if isinstance(perms, (list, set)):
                    request._cached_user_permissions = set(perms)
                else:
                    request._cached_user_permissions = set(p for p in perms if p)
            except (AttributeError, TypeError) as e:
                logger.debug("İzin alınamadı (user model uyumsuz): %s", e)
                request._cached_user_permissions = set()
        else:
            request._cached_user_permissions = set()
    return request._cached_user_permissions


class RBACMiddleware(MiddlewareMixin):
    """
    RBAC işlemleri için middleware.
    request.user_permissions ve request.has_permission() sağlar.
    Audit aktörü yaşam döngüsü: process_request'te set, process_response'ta clear.
    """

    def process_request(self, request):
        from rbac.signals import set_audit_user
        if request.user.is_authenticated:
            set_audit_user(request.user)

        request.user_permissions = SimpleLazyObject(lambda: get_user_permissions(request))

        def has_permission(perm_code):
            if not request.user.is_authenticated:
                return False
            if request.user.is_superuser:
                return True
            if hasattr(request.user, 'has_permission'):
                return request.user.has_permission(perm_code)
            return perm_code in request.user_permissions

        request.has_permission = has_permission

    def process_response(self, request, response):
        from rbac.signals import clear_audit_user
        clear_audit_user()
        return response
