"""
RBAC User Mixin - Kullanıcı modeline has_permission ve get_all_permissions ekler.

Kullanım:
    from django.contrib.auth.models import AbstractUser
    from rbac.mixins import RBACUserMixin

    class User(RBACUserMixin, AbstractUser):
        roles = models.ManyToManyField('rbac.Role', blank=True, related_name='users')
"""


class RBACUserMixin:
    """
    User modeline RBAC yetenekleri ekleyen mixin.
    User modelinde roles = ManyToManyField('rbac.Role') olmalıdır.
    """
    def has_permission(self, permission_code):
        """
        Kullanıcının belirli bir izne sahip olup olmadığını kontrol eder.
        Rol hiyerarşisi dahil (üst rol izinleri miras alınır).
        """
        if getattr(self, 'is_superuser', False):
            return True

        return permission_code in self.get_all_permissions()

    def get_all_permissions(self):
        """
        Kullanıcının tüm izinlerini döndürür (rol hiyerarşisi dahil).
        Toplu sorgu: rol+üst rol id'leri toplanıp tek RolePermission sorgusuyla distinct kodlar çekilir.
        Cache kullanır: RBAC_CACHE_TTL ayarı varsa cache'den okur.
        """
        from rbac import Role, RolePermission
        from rbac.cache import get_cached_user_permissions, set_cached_user_permissions

        if getattr(self, 'is_superuser', False):
            return set(RolePermission.objects.values_list('code', flat=True))

        cached = get_cached_user_permissions(self)
        if cached is not None:
            return cached

        role_ids = set()
        for role in self.roles.filter(is_active=True).select_related('parent_role'):
            r = role
            visited = set()
            while r and r.id not in visited:
                visited.add(r.id)
                if r.is_active:
                    role_ids.add(r.id)
                r = r.parent_role

        if not role_ids:
            perms = set()
        else:
            perms = set(
                RolePermission.objects.filter(role__in=role_ids)
                .values_list('code', flat=True)
                .distinct()
            )

        set_cached_user_permissions(self, perms)
        return perms
