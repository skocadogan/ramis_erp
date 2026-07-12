from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import BaseModel
from apps.branches.models import Branch
from apps.users.models import User


class ShiftStatus(models.TextChoices):
    OPEN = "OPEN", _("Açık")
    CLOSED = "CLOSED", _("Kapalı")


class CashMovementType(models.TextChoices):
    IN = "IN", _("Giren")
    OUT = "OUT", _("Çıkan")


class Shift(BaseModel):
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="shifts",
    )
    opened_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="opened_shifts",
    )
    closed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="closed_shifts",
    )
    status = models.CharField(
        max_length=10,
        choices=ShiftStatus.choices,
        default=ShiftStatus.OPEN,
    )
    opened_at = models.DateTimeField(auto_now_add=True)
    opened_at_terminal = models.ForeignKey(
        "pos_display.PosTerminal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opened_shifts",
        verbose_name=_("Açıldığı Terminal"),
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    opening_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    actual_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    difference = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # CARD (Kredi Kartı) alanları
    expected_card = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    actual_card = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    difference_card = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Diğer ödemeler alanları
    expected_other = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    actual_other = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    difference_other = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-opened_at"]
        verbose_name = _("Vardiya")
        verbose_name_plural = _("Vardiyalar")
        indexes = [
            models.Index(fields=['branch', 'status']),
            models.Index(fields=['branch', '-opened_at']),
            models.Index(fields=['status']),
        ]

    def __str__(self) -> str:
        return f"{self.branch} — {self.opened_at.date()} ({self.status})"


class ShiftExpense(BaseModel):
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="expenses",
    )
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shift_expenses",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Vardiya Gideri")
        verbose_name_plural = _("Vardiya Giderleri")


class ShiftCashMovement(BaseModel):
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="cash_movements",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    movement_type = models.CharField(
        max_length=10,
        choices=CashMovementType.choices,
    )
    description = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shift_cash_movements",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Vardiya Nakit Hareketi")
        verbose_name_plural = _("Vardiya Nakit Hareketleri")


class CashierPinAssignment(BaseModel):
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="cashier_pin_assignments",
        verbose_name=_("Şube"),
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="cashier_pin_assignments",
        verbose_name=_("Kullanıcı"),
    )
    pos_terminals = models.ManyToManyField(
        "pos_display.PosTerminal",
        related_name="cashier_pin_assignments",
        verbose_name=_("POS Terminalleri"),
        blank=True,
    )
    pin = models.CharField(
        max_length=4,
        unique=True,
        verbose_name=_("PIN Kodu"),
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Kasiyer PIN Ataması")
        verbose_name_plural = _("Kasiyer PIN Atamaları")

    def __str__(self) -> str:
        return f"{self.user.username} — {self.branch.name} ({self.pin})"

