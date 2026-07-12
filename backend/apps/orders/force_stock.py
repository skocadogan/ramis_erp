"""POS yetersiz stok override yetkisi doğrulaması."""

from django.utils.translation import gettext as _
from rest_framework import status

from core.api_responses import detail_response

FORCE_STOCK_PERMISSION = 'pos.force_stock_order'


def user_may_force_stock(request) -> bool:
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    if hasattr(request, 'has_permission'):
        return request.has_permission(FORCE_STOCK_PERMISSION)
    if hasattr(user, 'has_permission'):
        return user.has_permission(FORCE_STOCK_PERMISSION)
    perms = getattr(request, 'user_permissions', set())
    return FORCE_STOCK_PERMISSION in perms


def deny_force_stock_response():
    return detail_response(
        _('Yetersiz stokta sipariş geçme yetkiniz yok.'),
        http_status=status.HTTP_403_FORBIDDEN,
        code='FORCE_STOCK_FORBIDDEN',
    )
