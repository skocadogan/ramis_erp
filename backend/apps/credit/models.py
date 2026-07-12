from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

from core.models import BaseModel
from apps.branches.models import Branch
from apps.users.models import User


class CreditPolicy(models.TextChoices):
    """Hesap bakiyesi yetersiz kaldığında uygulanacak davranış."""

    BLOCK = "BLOCK", _("Bakiye yetersizse engelle")
    WARN_ALLOW = "WARN_ALLOW", _("Uyar ama satışa izin ver")
    OPEN_TAB = "OPEN_TAB", _("Açık hesap (limitsiz)")


class CreditAccount(BaseModel):
    """
    Ödenmez (müşteri kredisi) hesabı.

    İki türde kullanılabilir:
    - Sisteme kayıtlı bir kullanıcıya bağlı (``user`` dolu).
    - Giriş hesabı olmayan sanal kişi (``user`` boş, ad/soyad serbest).
    """

    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_accounts",
        verbose_name=_("Sistem Kullanıcısı"),
    )
    first_name = models.CharField(max_length=150, verbose_name=_("Ad"))
    last_name = models.CharField(max_length=150, blank=True, default="", verbose_name=_("Soyad"))
    phone = models.CharField(max_length=50, blank=True, default="", verbose_name=_("Telefon"))
    email = models.EmailField(blank=True, default="", verbose_name=_("E-posta"))
    address = models.TextField(blank=True, default="", verbose_name=_("Adres"))
    notes = models.TextField(blank=True, default="", verbose_name=_("Notlar"))

    # Şube kapsamı: belirli bir şubeye bağlı ya da tüm şubelerde geçerli (global).
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="credit_accounts",
        verbose_name=_("Şube"),
    )
    is_global = models.BooleanField(
        default=False,
        verbose_name=_("Tüm Şubelerde Geçerli"),
        help_text=_("İşaretliyse hesap herhangi bir şubede kullanılabilir."),
    )
    credit_policy = models.CharField(
        max_length=12,
        choices=CreditPolicy.choices,
        default=CreditPolicy.BLOCK,
        verbose_name=_("Bakiye Politikası"),
    )

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_credit_accounts",
        verbose_name=_("Oluşturan"),
    )

    class Meta:
        ordering = ["first_name", "last_name"]
        verbose_name = _("Ödenmez Hesabı")
        verbose_name_plural = _("Ödenmez Hesapları")
        constraints = [
            # Bir sistem kullanıcısının yalnızca bir aktif ödenmez hesabı olabilir.
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(is_active=True, user__isnull=False),
                name="uniq_active_credit_account_per_user",
            ),
        ]
        indexes = [
            models.Index(fields=["is_active", "branch"]),
            models.Index(fields=["is_active", "is_global"]),
            models.Index(fields=["user"]),
        ]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.full_name or f"CreditAccount #{self.id}"


class CreditTransactionType(models.TextChoices):
    TOPUP = "TOPUP", _("Kredi Yükleme")
    CHARGE = "CHARGE", _("Harcama")


class CreditTransaction(BaseModel):
    """
    Ödenmez hesabı hareketi.

    - ``TOPUP`` bakiyeyi artırır (kredi yükleme).
    - ``CHARGE`` bakiyeyi azaltır (satış ile harcama). ``sale`` alanı ile satışa bağlıdır.

    Tutar daima pozitif saklanır; işaret ``transaction_type`` ile belirlenir.
    Bağlı satış iptal/silme (``Sale.is_deleted``) durumunda harcama bakiye
    hesabına dahil edilmez (otomatik iade).
    """

    account = models.ForeignKey(
        CreditAccount,
        on_delete=models.CASCADE,
        related_name="transactions",
        verbose_name=_("Hesap"),
    )
    transaction_type = models.CharField(
        max_length=10,
        choices=CreditTransactionType.choices,
        verbose_name=_("Hareket Türü"),
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        verbose_name=_("Tutar"),
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_transactions",
        verbose_name=_("Şube"),
    )
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_transactions",
        verbose_name=_("Satış"),
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_transactions",
        verbose_name=_("İşlemi Yapan"),
    )
    notes = models.TextField(blank=True, default="", verbose_name=_("Açıklama"))

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Ödenmez Hareketi")
        verbose_name_plural = _("Ödenmez Hareketleri")
        indexes = [
            models.Index(fields=["account", "-created_at"]),
            models.Index(fields=["transaction_type"]),
            models.Index(fields=["sale"]),
        ]

    def __str__(self):
        return f"{self.transaction_type} {self.amount} ({self.account_id})"
