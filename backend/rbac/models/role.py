from django.db import models
from django.utils.translation import gettext_lazy as _


class Role(models.Model):
    """
    Sistemdeki roller için model.
    parent_role ile üst rol-alt rol hiyerarşisi desteklenir (örn: Admin -> Manager -> Editor).
    Alt rol, üst rolün tüm izinlerini miras alır.
    """
    name = models.CharField(max_length=100, unique=True, verbose_name=_('Rol Adı'))
    description = models.TextField(blank=True, null=True, verbose_name=_('Açıklama'))
    parent_role = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='child_roles',
        verbose_name=_('Üst Rol')
    )
    permissions = models.ManyToManyField(
        'rbac.RolePermission',
        blank=True,
        verbose_name=_('İzinler')
    )
    is_active = models.BooleanField(default=True, verbose_name=_('Aktif mi?'))
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Oluşturulma Tarihi'))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_('Güncellenme Tarihi'))

    def get_inherited_permission_codes(self):
        """Bu rol ve üst rollerinden gelen tüm izin kodlarını döndürür."""
        codes = set()
        role = self
        visited = set()
        while role and role.id not in visited:
            visited.add(role.id)
            if role.is_active:
                codes.update(role.permissions.values_list('code', flat=True))
            role = role.parent_role
        return codes

    class Meta:
        verbose_name = _('Rol')
        verbose_name_plural = _('Roller')
        ordering = ['name']
    def __str__(self):
        return self.name
