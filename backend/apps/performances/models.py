from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class WaiterCallStatus(models.TextChoices):
    PENDING = 'PENDING', _('Bekliyor')
    DISMISSED = 'DISMISSED', _('Görüldü')


class WaiterCallLog(models.Model):
    """
    Garson çağrısı geçmişi — analitik amaçlı, yumuşak silme yok.
    PK = çağrı anında üretilen call_id (WS payload ile aynı).
    """

    id = models.UUIDField(primary_key=True, editable=False)
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='waiter_call_logs',
        verbose_name=_('Şube'),
    )
    table = models.ForeignKey(
        'branches.Table',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='waiter_call_logs',
        verbose_name=_('Masa'),
    )
    reservation = models.ForeignKey(
        'reservations.Reservation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='waiter_call_logs',
        verbose_name=_('Rezervasyon'),
    )
    table_name = models.CharField(max_length=100, verbose_name=_('Masa adı'))
    zone_name = models.CharField(max_length=100, blank=True, default='', verbose_name=_('Bölge'))
    source = models.CharField(max_length=32, default='smart_button', verbose_name=_('Kaynak'))
    customer_message = models.CharField(
        max_length=500,
        blank=True,
        default='',
        verbose_name=_('Misafir mesajı'),
    )
    status = models.CharField(
        max_length=16,
        choices=WaiterCallStatus.choices,
        default=WaiterCallStatus.PENDING,
        db_index=True,
    )
    notified_count = models.PositiveIntegerField(default=0, verbose_name=_('Bildirilen garson'))
    called_at = models.DateTimeField(db_index=True, verbose_name=_('Çağrı zamanı'))
    dismissed_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Görüldü zamanı'))
    dismissed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dismissed_waiter_calls',
        verbose_name=_('Görüldü yapan'),
    )
    response_seconds = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name=_('Yanıt süresi (sn)'),
    )

    class Meta:
        verbose_name = _('Garson çağrı kaydı')
        verbose_name_plural = _('Garson çağrı kayıtları')
        ordering = ['-called_at']
        indexes = [
            models.Index(fields=['branch', 'called_at']),
            models.Index(fields=['branch', 'status', 'called_at']),
            models.Index(fields=['dismissed_by', 'called_at']),
        ]

    def __str__(self):
        return f"{self.table_name} @ {self.called_at:%Y-%m-%d %H:%M}"
