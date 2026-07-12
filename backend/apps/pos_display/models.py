from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from apps.branches.models import Branch
from core.models import BaseModel

_pos_code_validator = RegexValidator(
    regex=r"^[\w-]+$",
    message=_("Kod yalnızca harf, rakam, alt çizgi ve tire içerebilir."),
)


class DisplaySettings(BaseModel):
    """
    Müşteri ekranı metinleri ve zamanlama.

    - pos_terminal boş → şube varsayılanı (müşteri ekranı terminal kodu verilmezse veya override yoksa).
    - pos_terminal dolu → yalnızca o POS terminalinin müşteri ekranı için geçerli kayıt.
    """
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="display_settings",
        null=True,
        blank=True,
    )
    pos_terminal = models.ForeignKey(
        "PosTerminal",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="display_settings",
        verbose_name=_("POS terminali"),
        help_text=_("Boş bırakılırsa şube varsayılanıdır."),
    )
    idle_timeout = models.IntegerField(default=30, help_text=_("Saniye cinsinden bekleme süresi"))
    transition_speed = models.IntegerField(default=5, help_text=_("Slaytlar arası geçiş hızı (saniye)"))
    show_clock = models.BooleanField(default=True, help_text=_("Ekranda saat gösterilsin mi?"))
    welcome_title = models.CharField(max_length=200, default="RAMIS ERP", verbose_name=_("Karşılama Başlığı"))
    welcome_subtitle = models.CharField(max_length=255, default="Şeffaf ve Profesyonel Hizmet", verbose_name=_("Karşılama Alt Başlığı"))
    order_success_title = models.CharField(max_length=200, default="Siparişiniz Alındı", verbose_name=_("Sipariş Başarı Başlığı"))
    order_success_subtitle = models.CharField(max_length=255, default="Mutfağa iletildi, hazırlanıyor...", verbose_name=_("Sipariş Başarı Alt Başlığı"))
    payment_success_title = models.CharField(max_length=200, default="Teşekkürler", verbose_name=_("Ödeme Başarı Başlığı"))
    payment_success_subtitle = models.CharField(max_length=255, default="Afiyet olsun, yine bekleriz.", verbose_name=_("Ödeme Başarı Alt Başlığı"))
    success_message_duration = models.IntegerField(default=5, help_text=_("Başarı mesajının ekranda kalma süresi (saniye)"))

    def __str__(self):
        return f"Display Settings - {self.branch.name if self.branch else 'Global'}"

    class Meta:
        verbose_name = _("Ekran Ayarı")
        verbose_name_plural = _("Ekran Ayarları")
        ordering = ['created_at']
        constraints = [
            models.UniqueConstraint(
                fields=('branch',),
                condition=models.Q(pos_terminal__isnull=True),
                name='pos_display_displaysettings_branch_default_uniq',
            ),
            models.UniqueConstraint(
                fields=('branch', 'pos_terminal'),
                condition=models.Q(pos_terminal__isnull=False),
                name='pos_display_displaysettings_branch_terminal_uniq',
            ),
        ]


class PromotionSlide(BaseModel):
    """
    Müşteri ekranında dönecek olan kampanya ve reklam slaytları.
    BaseModel: UUID PK, created_at, updated_at, is_active.
    """
    branch = models.ForeignKey(
        Branch, on_delete=models.CASCADE, related_name='promotion_slides', null=True, blank=True,
    )
    pos_terminal = models.ForeignKey(
        'PosTerminal',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='promotion_slides',
        verbose_name=_('POS terminali'),
        help_text=_('Boş ise şube geneli tüm müşteri ekranlarında gösterilir.'),
    )
    TYPE_CHOICES = (
        ('IMAGE', _('Görsel')),
        ('TEXT', _('Metin')),
    )
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='IMAGE', verbose_name=_("Tür"))
    title = models.CharField(max_length=200, verbose_name=_("Başlık"))
    sub_title = models.CharField(max_length=255, null=True, blank=True, verbose_name=_("Alt Başlık"))
    description = models.TextField(null=True, blank=True, verbose_name=_("Açıklama"))
    image = models.ImageField(upload_to='pos/promotions/', verbose_name=_("Görsel"), null=True, blank=True)
    order = models.PositiveIntegerField(default=0, verbose_name=_("Sıralama"))
    duration = models.IntegerField(default=10, help_text=_("Bu slaytın ekranda kalma süresi (saniye)"))

    class Meta:
        ordering = ['order', '-created_at']
        verbose_name = _("Tanıtım Slaytı")
        verbose_name_plural = _("Tanıtım Slaytları")

    def __str__(self):
        return self.title


class FiscalType(models.TextChoices):
    NONE = 'NONE', _('Yok (Mali Entegrasyon Devre Dışı)')
    MOCK = 'MOCK', _('Sanal Entegrasyon (Test/Simülasyon)')
    BEKO_GMP3 = 'BEKO_GMP3', _('Beko ÖKC (GMP3 Bulut/Lokal)')
    HUGIN_GMP3 = 'HUGIN_GMP3', _('Hugin ÖKC (GMP3 Lokal/Socket)')
    EARSIV_UYUMSOFT = 'EARSIV_UYUMSOFT', _('Uyumsoft e-Arşiv Fatura')


class PosTerminal(BaseModel):
    """
    Şube bazlı ödeme noktası (POS). `code` müşteri ekranı WebSocket kanalı ile aynı anahtardır.
    """

    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="pos_terminals",
    )
    code = models.CharField(
        max_length=64,
        validators=[_pos_code_validator],
        help_text=_("Kanal kodu (örn. kasa-1); müşteri ekranı URL/WS ile uyumlu olmalıdır."),
    )
    name = models.CharField(max_length=120, verbose_name=_("Görünen ad"))
    sort_order = models.PositiveSmallIntegerField(default=0, verbose_name=_("Sıra"))
    
    # Mali Entegrasyon Alanları
    fiscal_type = models.CharField(
        max_length=30,
        choices=FiscalType.choices,
        default=FiscalType.NONE,
        verbose_name=_("Mali Entegrasyon Türü"),
    )
    fiscal_settings = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_("Mali Entegrasyon Ayarları"),
        help_text=_("IP, Port, Seri Port, API Key vb. parametreleri JSON olarak saklar."),
    )

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name = _("POS terminali")
        verbose_name_plural = _("POS terminalleri")
        constraints = [
            models.UniqueConstraint(fields=["branch", "code"], name="uniq_pos_terminal_branch_code"),
        ]

    def __str__(self):
        return f"{self.branch} — {self.name} ({self.code})"
