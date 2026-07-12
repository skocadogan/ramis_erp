from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import BaseModel
from apps.branches.models import Branch, Table
from apps.users.models import User


DEFAULT_DUE_ALERT_LEAD_MINUTES = 15
DEFAULT_DUE_ALERT_INTERVAL_MINUTES = 5


class ReservationStatus(models.TextChoices):
    PENDING = "PENDING", _("Bekliyor")
    CONFIRMED = "CONFIRMED", _("Onaylandı")
    SEATED = "SEATED", _("Oturdu")
    COMPLETED = "COMPLETED", _("Tamamlandı")
    CANCELLED = "CANCELLED", _("İptal")
    NO_SHOW = "NO_SHOW", _("Gelmedi")


class Reservation(BaseModel):
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    table = models.ForeignKey(
        Table,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reservations",
    )
    customer_name = models.CharField(max_length=255)
    customer_phone = models.CharField(max_length=50, blank=True, default="")
    customer_email = models.CharField(max_length=255, blank=True, default="")
    party_size = models.PositiveSmallIntegerField()
    scheduled_date = models.DateField()
    scheduled_time = models.TimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=120)
    status = models.CharField(
        max_length=20,
        choices=ReservationStatus.choices,
        default=ReservationStatus.PENDING,
    )
    notes = models.TextField(blank=True, default="")
    due_notified_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Rezervasyon saati bildirimi"),
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_reservations",
    )

    class Meta:
        ordering = ["scheduled_date", "scheduled_time"]
        verbose_name = _("Rezervasyon")
        verbose_name_plural = _("Rezervasyonlar")
        indexes = [
            models.Index(fields=['branch', 'scheduled_date']),
            models.Index(fields=['branch', 'status', 'scheduled_date']),
            models.Index(fields=['scheduled_date', 'scheduled_time']),
        ]

    def __str__(self):
        return f"{self.customer_name} — {self.scheduled_date} {self.scheduled_time}"


class ReservationBranchSettings(BaseModel):
    """Şube bazlı rezervasyon geliş bildirimi ayarları."""

    branch = models.OneToOneField(
        Branch,
        on_delete=models.CASCADE,
        related_name="reservation_branch_settings",
        verbose_name=_("Şube"),
    )
    due_alert_lead_minutes = models.PositiveSmallIntegerField(
        default=DEFAULT_DUE_ALERT_LEAD_MINUTES,
        verbose_name=_("Bildirim başlangıç (dk önce)"),
        help_text=_(
            "Rezervasyon saatinden kaç dakika önce geliş bildirimleri başlasın."
        ),
    )
    due_alert_interval_minutes = models.PositiveSmallIntegerField(
        default=DEFAULT_DUE_ALERT_INTERVAL_MINUTES,
        verbose_name=_("Bildirim tekrar aralığı (dk)"),
        help_text=_("Geliş bildirimleri kaç dakikada bir tekrarlansın."),
    )

    class Meta:
        verbose_name = _("Rezervasyon şube ayarı")
        verbose_name_plural = _("Rezervasyon şube ayarları")

    def __str__(self):
        return f"ReservationSettings {self.branch_id}"
