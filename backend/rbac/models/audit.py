from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class RBACAuditLog(models.Model):
    """
    RBAC denetim kaydı: kim, ne zaman, hangi role/izne değişiklik yaptı.
    """
    ACTION_CREATE = 'create'
    ACTION_UPDATE = 'update'
    ACTION_DELETE = 'delete'
    ACTION_ASSIGN = 'assign'
    ACTION_REVOKE = 'revoke'

    ACTION_CHOICES = [
        (ACTION_CREATE, _('Oluşturma')),
        (ACTION_UPDATE, _('Güncelleme')),
        (ACTION_DELETE, _('Silme')),
        (ACTION_ASSIGN, _('Atama')),
        (ACTION_REVOKE, _('Geri Alma')),
    ]

    TARGET_ROLE = 'role'
    TARGET_PERMISSION = 'permission'
    TARGET_CATEGORY = 'category'
    TARGET_USER_ROLE = 'user_role'

    TARGET_CHOICES = [
        (TARGET_ROLE, _('Rol')),
        (TARGET_PERMISSION, _('İzin')),
        (TARGET_CATEGORY, _('Kategori')),
        (TARGET_USER_ROLE, _('Kullanıcı-Rol')),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rbac_audit_logs',
        verbose_name=_('İşlemi Yapan')
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, verbose_name=_('İşlem'))
    target_type = models.CharField(max_length=20, choices=TARGET_CHOICES, verbose_name=_('Hedef Tipi'))
    target_id = models.PositiveIntegerField(null=True, blank=True, verbose_name=_('Hedef ID'))
    target_repr = models.CharField(max_length=255, blank=True, verbose_name=_('Hedef Özeti'))
    changes = models.JSONField(default=dict, blank=True, verbose_name=_('Değişiklik Detayları'))
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name=_('IP Adresi'))
    user_agent = models.TextField(blank=True, verbose_name=_('User Agent'))
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Tarih'))

    class Meta:
        verbose_name = _('RBAC Denetim Kaydı')
        verbose_name_plural = _('RBAC Denetim Kayıtları')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_action_display()} - {self.target_type} - {self.created_at}"
