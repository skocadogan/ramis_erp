"""
Django REST Framework entegrasyonu.

Kullanım:
    pip install djangorestframework

    # settings.py
    INSTALLED_APPS = ['rest_framework', ...]

    # views.py
    from rest_framework.views import APIView
    from rest_framework.response import Response
    from rbac.drf import RBACPermission, RBACPermissionAll, RBACRoleRequired

    class ProductListAPI(APIView):
        permission_classes = [RBACPermission]
        permission_codes = ['product.view_product']

        def get(self, request):
            return Response({'data': []})

    class StrictAPI(APIView):
        permission_classes = [RBACPermissionAll]
        permission_codes = ['product.view_product', 'product.edit_product']

    class AdminOnlyAPI(APIView):
        permission_classes = [RBACRoleRequired]
        required_role = 'Admin'
"""
import logging

from django.utils.translation import gettext_lazy as _

logger = logging.getLogger(__name__)

try:
    from rest_framework.permissions import BasePermission
    from rest_framework.exceptions import PermissionDenied
    DRF_AVAILABLE = True
except ImportError:
    DRF_AVAILABLE = False
    BasePermission = object
    PermissionDenied = Exception


def _check_permission(request, permission_code):
    """İzin kontrolü - DRF request için."""
    if not request.user or not request.user.is_authenticated:
        return False
    if getattr(request.user, 'is_superuser', False):
        return True
    if hasattr(request.user, 'has_permission'):
        return request.user.has_permission(permission_code)
    if hasattr(request, 'has_permission'):
        return request.has_permission(permission_code)
    if hasattr(request, 'user_permissions'):
        return permission_code in request.user_permissions
    try:
        return request.user.roles.filter(
            is_active=True, permissions__code=permission_code
        ).exists()
    except (AttributeError, TypeError):
        return False


if DRF_AVAILABLE:

    class RBACPermission(BasePermission):
        """
        DRF için RBAC izin sınıfı (OR mantığı).
        Gelişmiş ModelViewSet ve Superuser desteği içerir.
        """
        message = _("Bu işlem için gerekli yetkiniz bulunmamaktadır.")

        def has_permission(self, request, view):
            if not request.user or not request.user.is_authenticated:
                return False

            # 1. Superuser her zaman yetkilidir
            if getattr(request.user, 'is_superuser', False):
                return True

            # 2. İzin kodlarını belirle
            codes = None
            
            # a) ViewSet 'action' bazlı kontrol (ModelViewSet için)
            action_name = getattr(view, 'action', None)
            required_permissions = getattr(view, 'required_permissions', None)
            
            if action_name and isinstance(required_permissions, dict):
                codes = required_permissions.get(action_name)
            
            # b) Klasik 'permission_codes' veya 'permission_required' (Class level)
            if not codes:
                codes = getattr(view, 'permission_codes', None) or getattr(view, 'permission_required', None)
            
            # c) Aksiyon metodunun üzerindeki dekoratörden (permission_codes)
            if not codes and action_name:
                action_method = getattr(view, action_name, None)
                if action_method:
                    codes = getattr(action_method, 'permission_codes', None)

            if not codes:
                # Modül/ViewSet düzeyinde hiçbir kısıtlama tanımlanmamışsa
                # Güvenlik gereği sadece superuser'a (yukarıda) izin veririz, 
                # diğerlerini yetkisiz saymayız (veya tam tersi proje politikasına göre değişir)
                # Buradaki mevcut politika: Kod yoksa False.
                return False

            # 3. İzinleri kontrol et
            codes = [codes] if isinstance(codes, str) else list(codes)
            for code in codes:
                if _check_permission(request, code):
                    return True
            return False

    class RBACPermissionAll(BasePermission):
        """
        DRF için RBAC izin sınıfı (AND mantığı).
        permission_codes: Liste - hepsi gerekli.
        """
        message = _("Bu işlem için gerekli tüm yetkilere sahip değilsiniz.")

        def has_permission(self, request, view):
            codes = getattr(view, 'permission_codes', None) or getattr(
                view, 'required_all_permissions', None
            )
            if not codes:
                return False
            codes = [codes] if isinstance(codes, str) else list(codes)
            for code in codes:
                if not _check_permission(request, code):
                    return False
            return True

    class RBACPermissionPosOrWaiterOrderWrite(BasePermission):
        """
        POS / garson sipariş yazma: `orders.manage_order` zorunlu; ayrıca
        `pos.view_pos` veya `waiter.access` yeterli (AND+OR birleşimi).
        Garson uygulaması `pos.view_pos` olmadan da sipariş oluşturabilsin diye.
        """
        message = _("Bu işlem için gerekli tüm yetkilere sahip değilsiniz.")

        def has_permission(self, request, view):
            if not request.user or not request.user.is_authenticated:
                return False
            if getattr(request.user, "is_superuser", False):
                return True
            if not _check_permission(request, "orders.manage_order"):
                return False
            return _check_permission(request, "pos.view_pos") or _check_permission(
                request, "waiter.access"
            )

    class RBACPermissionForbidden(BasePermission):
        """
        DRF için RBAC yasaklı izin sınıfı (NOT mantığı).
        permission_forbidden: Bu izinlere sahip kullanıcılar erişemez.
        """
        message = _("Bu işlem için yetkiniz bulunmamaktadır.")

        def has_permission(self, request, view):
            forbidden = getattr(view, 'permission_forbidden', None)
            if not forbidden:
                return True
            forbidden = [forbidden] if isinstance(forbidden, str) else list(forbidden)
            for code in forbidden:
                if _check_permission(request, code):
                    return False
            return True

    class RBACRoleRequired(BasePermission):
        """
        DRF için rol tabanlı yetkilendirme.
        required_role: Gerekli rol adı.
        """
        message = _("Bu işlem için gerekli role sahip değilsiniz.")

        def has_permission(self, request, view):
            role_name = getattr(view, 'required_role', None)
            if not role_name:
                return False
            if not request.user or not request.user.is_authenticated:
                return False
            if getattr(request.user, 'is_superuser', False):
                return True
            try:
                return request.user.roles.filter(
                    name=role_name, is_active=True
                ).exists()
            except (AttributeError, TypeError):
                return False
