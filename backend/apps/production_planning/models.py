from django.db import models
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from core.models import BaseModel


class ProductionPlanStatus(models.TextChoices):
    DRAFT = "DRAFT", _("Taslak")
    APPROVED = "APPROVED", _("Onaylı")
    LOCKED = "LOCKED", _("Kilitli")


class ProductionPlanSource(models.TextChoices):
    MANUAL = "MANUAL", _("Manuel")
    FORECAST = "FORECAST", _("Tahmin")
    IMPORT = "IMPORT", _("İçe Aktarma")


class PosBlockMode(models.TextChoices):
    OFF = "OFF", _("Kapalı")
    WARN = "WARN", _("Uyarı Ver")
    BLOCK = "BLOCK", _("Siparişi Engelle")


class AvailabilityMode(models.TextChoices):
    AVAILABLE = "AVAILABLE", _("Mevcut")
    LIMITED = "LIMITED", _("Sınırlı")
    SOLD_OUT = "SOLD_OUT", _("Tükendi (Ürün Kalmadı)")


class ProductionPlan(BaseModel):
    """
    Belirli bir şube ve tarih için günlük üretim planı.
    """
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='production_plans',
        verbose_name=_('Şube')
    )
    plan_date = models.DateField(verbose_name=_('Plan Tarihi'))
    status = models.CharField(
        max_length=20,
        choices=ProductionPlanStatus.choices,
        default=ProductionPlanStatus.DRAFT,
        verbose_name=_('Durum')
    )
    notes = models.TextField(blank=True, default='', verbose_name=_('Notlar'))
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_production_plans',
        verbose_name=_('Oluşturan')
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_production_plans',
        verbose_name=_('Onaylayan')
    )
    approved_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Onaylanma Zamanı'))

    class Meta:
        # Soft silinen kayıt satırda kaldığı için (branch, plan_date) yalnızca aktif satırlarda eşsiz olmalı.
        constraints = [
            models.UniqueConstraint(
                fields=['branch', 'plan_date'],
                condition=models.Q(is_active=True),
                name='prodplan_uniq_branch_date_active',
            ),
        ]
        ordering = ['-plan_date', 'branch']
        verbose_name = _('Üretim Planı')
        verbose_name_plural = _('Üretim Planları')

    def __str__(self):
        return f"{self.branch.name} - {self.plan_date} ({self.get_status_display()})"


class ProductionPlanLine(BaseModel):
    """
    Üretim planının içindeki ürün ve hedef porsiyon bilgisi.
    """
    plan = models.ForeignKey(
        ProductionPlan,
        on_delete=models.CASCADE,
        related_name='lines',
        verbose_name=_('Plan')
    )
    product = models.ForeignKey(
        'menu.Product',
        on_delete=models.CASCADE,
        related_name='production_plan_lines',
        verbose_name=_('Ürün')
    )
    # Porsiyon bazlı (OrderItem.quantity ile eşleşir).
    target_quantity = models.DecimalField(
        max_digits=10, 
        decimal_places=3, 
        default=1,
        verbose_name=_('Hedef Miktar (Porsiyon)')
    )
    station = models.ForeignKey(
        'branches.KitchenStation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='production_plan_lines',
        verbose_name=_('Mutfak İstasyonu'),
        help_text=_('Ürünün hazırlandığı istasyon')
    )
    source = models.CharField(
        max_length=20,
        choices=ProductionPlanSource.choices,
        default=ProductionPlanSource.MANUAL,
        verbose_name=_('Kaynak')
    )

    class Meta:
        unique_together = [('plan', 'product')]
        ordering = ['plan', 'product__name']
        verbose_name = _('Üretim Planı Satırı')
        verbose_name_plural = _('Üretim Planı Satırları')

    def __str__(self):
        return f"{self.product.name} - {self.target_quantity} porsiyon"


class ProductionDaySettings(BaseModel):
    """
    Şube bazlı üretim ve POS kontrol ayarları.
    """
    branch = models.OneToOneField(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='production_day_settings',
        verbose_name=_('Şube')
    )
    default_safety_factor = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        default=1.00,
        verbose_name=_('Varsayılan Güvenlik Çarpanı'),
        help_text=_('Tahmin hesaplamalarında kullanılır (Örn: %10 tolerans için 1.10)')
    )
    pos_block_mode = models.CharField(
        max_length=20,
        choices=PosBlockMode.choices,
        default=PosBlockMode.WARN,
        verbose_name=_('POS Engel Modu'),
        help_text=_('Tükendi veya limiti dolan ürünler POS ekranında nasıl davranacak?')
    )
    allow_negative_plan_variance = models.BooleanField(
        default=False,
        verbose_name=_('Negatif Plan Farkına İzin Ver'),
        help_text=_('Planda belirlenenden daha fazla satılmasına göz yumulacak mı?')
    )

    class Meta:
        verbose_name = _('Üretim Günü Ayarı')
        verbose_name_plural = _('Üretim Günü Ayarları')

    def __str__(self):
        return f"{self.branch.name} Üretim Ayarları"


class ProductDayAvailability(BaseModel):
    """
    Belirli bir gün ve şube için ürünün satışa uygunluğu.
    Kullanıcı arayüzünde "Ürün Kalmadı" veya 86 listesi olarak bilinir.
    """
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='product_availabilities',
        verbose_name=_('Şube')
    )
    effective_date = models.DateField(verbose_name=_('Geçerlilik Tarihi'))
    product = models.ForeignKey(
        'menu.Product',
        on_delete=models.CASCADE,
        related_name='day_availabilities',
        verbose_name=_('Ürün')
    )
    mode = models.CharField(
        max_length=20,
        choices=AvailabilityMode.choices,
        default=AvailabilityMode.SOLD_OUT,
        verbose_name=_('Durum'),
        help_text=_('Ürün satışta mı, limiti var mı, yoksa tükendi (kalmadı) mi?')
    )
    remaining_portions = models.DecimalField(
        max_digits=10, 
        decimal_places=3, 
        null=True, 
        blank=True,
        verbose_name=_('Kalan Porsiyon'),
        help_text=_('Durum "Sınırlı" seçilirse geçerlidir.')
    )
    reason = models.CharField(
        max_length=255, 
        blank=True, 
        default='', 
        verbose_name=_('Sebep')
    )
    set_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='set_product_availabilities',
        verbose_name=_('İşlemi Yapan')
    )

    class Meta:
        unique_together = [('branch', 'effective_date', 'product')]
        ordering = ['-effective_date', 'product__name']
        verbose_name = _('Ürün Kalmadı (86) Kaydı')
        verbose_name_plural = _('Ürün Kalmadı (86) Kayıtları')

    def __str__(self):
        return f"{self.product.name} ({self.get_mode_display()}) - {self.effective_date}"
