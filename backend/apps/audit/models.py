import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel

class AuditLog(BaseModel):
    """
    Uygulama genelinde append-only denetim izi (Audit Trail).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        verbose_name=_('Aktör')
    )
    actor_ip = models.GenericIPAddressField(null=True, blank=True, verbose_name=_('IP Adresi'))
    user_agent = models.TextField(null=True, blank=True, verbose_name=_('User Agent'))
    
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        verbose_name=_('Şube')
    )
    
    action = models.CharField(max_length=100, db_index=True, verbose_name=_('Eylem'))
    
    target_type = models.CharField(max_length=100, db_index=True, verbose_name=_('Hedef Tipi'))
    target_id = models.CharField(max_length=255, db_index=True, verbose_name=_('Hedef ID'))
    
    before_json = models.JSONField(null=True, blank=True, verbose_name=_('Önceki Durum'))
    after_json = models.JSONField(null=True, blank=True, verbose_name=_('Sonraki Durum'))
    
    metadata = models.JSONField(null=True, blank=True, verbose_name=_('Ek Veri'))

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Denetim Kaydı')
        verbose_name_plural = _('Denetim Kayıtları')
        indexes = [
            models.Index(fields=['created_at']),
            models.Index(fields=['target_type', 'target_id']),
            models.Index(fields=['branch', 'created_at']),
            models.Index(fields=['action', 'created_at']),
        ]

    def __str__(self):
        return f"{self.action} - {self.target_type}:{self.target_id} ({self.created_at})"
