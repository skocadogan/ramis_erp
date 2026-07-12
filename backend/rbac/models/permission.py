from django.db import models
from django.utils.translation import gettext_lazy as _


class RolePermission(models.Model):
    """
    Özel izin tanımları için model
    """
    name = models.CharField(max_length=100, verbose_name=_('İzin Adı'))
    description = models.TextField(blank=True, null=True, verbose_name=_('Açıklama'))
    code = models.CharField(max_length=100, unique=True, verbose_name=_('İzin Kodu'))
    category = models.ForeignKey(
        'rbac.PermissionCategory',
        on_delete=models.CASCADE,
        related_name='permissions',
        verbose_name=_('İzin Kategorisi')
    )

    class Meta:
        verbose_name = _('Rol İzni')
        verbose_name_plural = _('Rol İzinleri')
        ordering = ['category', 'name']
    def __str__(self):
        return f"{self.category.name} - {self.name}"
