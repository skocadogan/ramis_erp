from django.db import models
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel

class ConnectionType(models.TextChoices):
    NETWORK = "NETWORK", _("Network (Ethernet/WiFi)")
    USB     = "USB",     _("USB")

class PrinterType(models.TextChoices):
    EPSON   = "EPSON",   _("Epson")
    STAR    = "STAR",    _("Star")
    BIXOLON = "BIXOLON", _("Bixolon")
    GENERIC = "GENERIC", _("Jenerik ESC/POS")


class UsageType(models.TextChoices):
    KITCHEN = "KITCHEN", _("Mutfak")
    POS     = "POS",     _("POS / Kasa")


class Printer(BaseModel):
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='printers',
        verbose_name=_('Şube')
    )
    name = models.CharField(max_length=100, verbose_name=_('Yazıcı Adı'))
    connection_type = models.CharField(
        max_length=20,
        choices=ConnectionType.choices,
        default=ConnectionType.NETWORK,
        verbose_name=_('Bağlantı Tipi')
    )
    
    # Network settings
    ip_address = models.GenericIPAddressField(
        null=True, blank=True,
        verbose_name=_('IP Adresi')
    )
    port = models.PositiveIntegerField(
        default=9100,
        verbose_name=_('Port')
    )
    
    # USB settings
    device_path = models.CharField(
        max_length=255, null=True, blank=True,
        verbose_name=_('Cihaz Yolu'),
        help_text=_('Linux için örn: /dev/usb/lp0')
    )
    
    printer_type = models.CharField(
        max_length=20,
        choices=PrinterType.choices,
        default=PrinterType.GENERIC,
        verbose_name=_('Yazıcı Modeli/Profili')
    )
    
    usage_type = models.CharField(
        max_length=20,
        choices=UsageType.choices,
        default=UsageType.POS,
        verbose_name=_('Kullanım Alanı')
    )
    kitchen_station = models.ForeignKey(
        'branches.KitchenStation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='printers',
        verbose_name=_('Mutfak İstasyonu'),
        help_text=_('Mutfak yazıcıları için hangi istasyona ait olduğu.'),
    )
    receipt_template_slug = models.SlugField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name=_('Fiş Şablonu'),
        help_text=_('Bu yazıcıda kullanılacak ESC/POS fiş şablon kodu.'),
    )
    is_active = models.BooleanField(default=True, verbose_name=_('Aktif mi?'))
    
    # Status monitoring
    status_info = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Durum Bilgisi'),
        help_text=_('Online/Offline, Kağıt durumu vb.')
    )
    last_seen = models.DateTimeField(
        null=True, blank=True,
        verbose_name=_('Son Görülme')
    )

    class Meta:
        verbose_name = _('Yazıcı')
        verbose_name_plural = _('Yazıcılar')
        ordering = ['branch', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_connection_type_display()}) - {self.branch.name}"


class PrintJobStatus(models.TextChoices):
    PENDING = "PENDING", _("Bekliyor")
    PROCESSING = "PROCESSING", _("İşleniyor")
    COMPLETED = "COMPLETED", _("Tamamlandı")
    FAILED = "FAILED", _("Başarısız")


class PrintJob(BaseModel):
    """
    Termal fiş baskısı — API isteği kalıcı kayıt + Celery ile yazıcı başına seri gönderim.
    """

    printer = models.ForeignKey(
        Printer,
        on_delete=models.CASCADE,
        related_name="print_jobs",
        verbose_name=_("Yazıcı"),
    )
    receipt_slug = models.SlugField(
        max_length=100,
        verbose_name=_("Fiş şablon kodu"),
    )
    context = models.JSONField(default=dict, verbose_name=_("Şablon bağlamı"))
    status = models.CharField(
        max_length=20,
        choices=PrintJobStatus.choices,
        default=PrintJobStatus.PENDING,
        db_index=True,
        verbose_name=_("Durum"),
    )
    error_message = models.TextField(blank=True, default="", verbose_name=_("Hata mesajı"))
    idempotency_key = models.CharField(
        max_length=128,
        null=True,
        blank=True,
        unique=True,
        verbose_name=_("Idempotency anahtarı"),
        help_text=_("Aynı anahtarla tekrar istek yinelenen iş üretmez."),
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Tamamlanma zamanı"),
    )

    class Meta:
        verbose_name = _("Yazdırma işi")
        verbose_name_plural = _("Yazdırma işleri")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["printer", "status", "created_at"]),
        ]

    def __str__(self):
        return f"{self.receipt_slug} → {self.printer.name} ({self.status})"
