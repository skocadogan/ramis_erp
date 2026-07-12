"""
RBAC Admin - Bağımsız projelerde kullanılır.
Ana projede user.admin RBAC modellerini kaydediyor olabilir.
"""
from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from rbac import Role, RolePermission, PermissionCategory, RBACAuditLog


class RolePermissionInline(admin.TabularInline):
    model = Role.permissions.through
    extra = 1
    verbose_name = _("İzin")
    verbose_name_plural = _("İzinler")


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent_role', 'description', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [RolePermissionInline]
    exclude = ('permissions',)


@admin.register(PermissionCategory)
class PermissionCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'description')
    search_fields = ('name', 'code', 'description')


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'category')
    list_filter = ('category',)
    search_fields = ('name', 'code', 'description')


@admin.register(RBACAuditLog)
class RBACAuditLogAdmin(admin.ModelAdmin):
    list_display = ('user', 'action', 'target_type', 'target_repr', 'created_at')
    list_filter = ('action', 'target_type', 'created_at')
    search_fields = ('target_repr', 'user__username')
    readonly_fields = ('user', 'action', 'target_type', 'target_id', 'target_repr', 'changes', 'created_at')
