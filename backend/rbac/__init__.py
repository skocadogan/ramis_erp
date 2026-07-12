"""
RBAC (Role-Based Access Control) Modülü

Bağımsız Django paketi - herhangi bir projeye eklenebilir.
Kullanım için RBAC_KURULUM_KILAVUZU.md dosyasına bakınız.
"""


def __getattr__(name):
    """Lazy import - Django app yükleme sırası için"""
    if name in ('Role', 'RolePermission', 'PermissionCategory', 'RBACAuditLog'):
        from .models import Role, RolePermission, PermissionCategory, RBACAuditLog
        import sys
        mod = sys.modules[__name__]
        mod.Role, mod.RolePermission, mod.PermissionCategory, mod.RBACAuditLog = (
            Role, RolePermission, PermissionCategory, RBACAuditLog
        )
        return {'Role': Role, 'RolePermission': RolePermission, 'PermissionCategory': PermissionCategory,
                'RBACAuditLog': RBACAuditLog}[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ['Role', 'RolePermission', 'PermissionCategory', 'RBACAuditLog']
__version__ = '1.0.0'
