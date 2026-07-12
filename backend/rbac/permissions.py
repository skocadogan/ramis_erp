import logging
from functools import wraps

from django.http import HttpResponseForbidden
from django.contrib.auth.mixins import AccessMixin
from django.utils.translation import gettext_lazy as _

logger = logging.getLogger(__name__)


class PermissionRequiredMixin(AccessMixin):
    """
    View için gerekli izinlere sahip olma kontrolü yapan mixin.
    permission_required parametresi tek bir izin kodu veya izin kodlarından oluşan bir liste olabilir.
    Eğer bir liste verilirse, kullanıcının listenin herhangi bir iznine sahip olması yeterlidir (OR ilişkisi).
    """
    permission_required = None
    required_all_permissions = None
    permission_forbidden = None
    permission_description = None
    permission_denied_message = _("Bu sayfaya erişim izniniz bulunmamaktadır.")

    def has_permission(self):
        if not self.request.user.is_authenticated:
            return False

        if self.request.user.is_superuser:
            return True

        if (self.permission_required is None and self.required_all_permissions is None and
                self.permission_forbidden is None):
            return False

        # NOT: Yasaklı izinlere sahip olmamalı
        if self.permission_forbidden is not None:
            forbidden = (
                [self.permission_forbidden] if isinstance(self.permission_forbidden, str)
                else list(self.permission_forbidden)
            )
            for perm in forbidden:
                if self._check_single_permission(perm):
                    return False

        # AND: Tüm izinlere sahip olmalı
        if self.required_all_permissions is not None:
            required = (
                [self.required_all_permissions] if isinstance(self.required_all_permissions, str)
                else list(self.required_all_permissions)
            )
            for perm in required:
                if not self._check_single_permission(perm):
                    return False

        # OR: Herhangi bir izin yeterli (varsayılan)
        if self.permission_required is None:
            return True

        if isinstance(self.permission_required, (list, tuple)):
            for permission in self.permission_required:
                if self._check_single_permission(permission):
                    return True
            return False
        return self._check_single_permission(self.permission_required)

    def _check_single_permission(self, permission_code):
        try:
            if hasattr(self.request.user, 'has_permission'):
                return self.request.user.has_permission(permission_code)

            if hasattr(self.request, 'has_permission'):
                return self.request.has_permission(permission_code)

            if hasattr(self.request, 'user_permissions'):
                return permission_code in self.request.user_permissions

            return self.request.user.roles.filter(
                is_active=True,
                permissions__code=permission_code
            ).exists()
        except (AttributeError, TypeError) as e:
            logger.debug("İzin kontrolü hatası: %s", e)
            return False

    def dispatch(self, request, *args, **kwargs):
        if not self.has_permission():
            return self.handle_no_permission()
        return super().dispatch(request, *args, **kwargs)


def permission_required(permission_code_or_list, permission_description=None):
    """
    Belirli bir izne veya izinlere sahip olmayı gerektiren decorator.
    permission_description: register_permissions komutu için izin açıklaması (opsiyonel).
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return HttpResponseForbidden(_("Giriş yapmanız gerekmektedir."))

            if request.user.is_superuser:
                return view_func(request, *args, **kwargs)

            if isinstance(permission_code_or_list, (list, tuple)):
                permission_codes = permission_code_or_list
            else:
                permission_codes = [permission_code_or_list]

            has_any_perm = False
            for permission_code in permission_codes:
                if hasattr(request.user, 'has_permission'):
                    if request.user.has_permission(permission_code):
                        has_any_perm = True
                        break
                elif hasattr(request, 'has_permission'):
                    if request.has_permission(permission_code):
                        has_any_perm = True
                        break
                elif hasattr(request, 'user_permissions'):
                    if permission_code in request.user_permissions:
                        has_any_perm = True
                        break

            if not has_any_perm:
                return HttpResponseForbidden(_("Bu işlemi gerçekleştirmek için gerekli yetkiye sahip değilsiniz."))

            return view_func(request, *args, **kwargs)

        _wrapped_view.permission_required = permission_code_or_list
        _wrapped_view.permission_description = permission_description
        return _wrapped_view
    return decorator


def _check_perm(request, permission_code):
    """İzin kontrolü için ortak yardımcı."""
    if hasattr(request.user, 'has_permission'):
        return request.user.has_permission(permission_code)
    if hasattr(request, 'has_permission'):
        return request.has_permission(permission_code)
    if hasattr(request, 'user_permissions'):
        return permission_code in request.user_permissions
    return request.user.roles.filter(
        is_active=True, permissions__code=permission_code
    ).exists()


def permission_required_all(permission_codes, permission_description=None):
    """
    Tüm izinlere sahip olmayı gerektiren decorator (AND mantığı).
    Kullanıcı listedeki her izne sahip olmalıdır.
    """
    codes = list(permission_codes) if isinstance(permission_codes, (list, tuple)) else [permission_codes]

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return HttpResponseForbidden(_("Giriş yapmanız gerekmektedir."))
            if request.user.is_superuser:
                return view_func(request, *args, **kwargs)
            for perm in codes:
                if not _check_perm(request, perm):
                    return HttpResponseForbidden(_("Bu işlemi gerçekleştirmek için gerekli yetkiye sahip değilsiniz."))
            return view_func(request, *args, **kwargs)

        _wrapped_view.permission_required = codes
        _wrapped_view.permission_description = permission_description
        _wrapped_view.permission_operator = 'AND'
        return _wrapped_view
    return decorator


def permission_forbidden(permission_code_or_list, permission_description=None):
    """
    Belirtilen izinlere sahip olmayan kullanıcılar için decorator (NOT mantığı).
    Kullanıcı listedeki hiçbir izne sahip olmamalıdır.
    """
    forbidden = (
        list(permission_code_or_list) if isinstance(permission_code_or_list, (list, tuple))
        else [permission_code_or_list]
    )

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return HttpResponseForbidden(_("Giriş yapmanız gerekmektedir."))
            if request.user.is_superuser:
                return view_func(request, *args, **kwargs)
            for perm in forbidden:
                if _check_perm(request, perm):
                    return HttpResponseForbidden(_("Bu işlemi gerçekleştirmek için yetkiniz bulunmamaktadır."))
            return view_func(request, *args, **kwargs)

        _wrapped_view.permission_forbidden = forbidden
        _wrapped_view.permission_description = permission_description
        _wrapped_view.permission_operator = 'NOT'
        return _wrapped_view
    return decorator


def role_required(role_name):
    """
    Belirli bir role sahip olmayı gerektiren decorator.
    Superuser her zaman bypass edilir.
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return HttpResponseForbidden(_("Giriş yapmanız gerekmektedir."))

            if getattr(request.user, 'is_superuser', False):
                return view_func(request, *args, **kwargs)

            if not request.user.roles.filter(name=role_name, is_active=True).exists():
                return HttpResponseForbidden(_("Bu işlemi gerçekleştirmek için gerekli role sahip değilsiniz."))

            return view_func(request, *args, **kwargs)
        return _wrapped_view
    return decorator
