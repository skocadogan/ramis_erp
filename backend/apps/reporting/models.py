from django.db import models
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel

class ReportCategory(models.TextChoices):
    # Dinamik Şablonlar (Editör ile düzenlenebilir)
    POS_RECEIPT     = "POS_RECEIPT",     _("POS Fişi / Adisyon")
    KITCHEN_TICKET  = "KITCHEN_TICKET",  _("Mutfak Fişi")
    WAITER_TICKET   = "WAITER_TICKET",   _("Garson Fişi")
    
    # Sistem Tarafından Yönetilen Raporlar (Modül tabanlı)
    MODULE_REPORT   = "MODULE_REPORT",   _("Modül Raporu (Sabit)")
    
    INVOICE         = "INVOICE",         _("Fatura Şablonu")
    CUSTOM          = "CUSTOM",          _("Özel Şablon")

class ReportTemplate(BaseModel):
    name = models.CharField(max_length=150, verbose_name=_('Şablon Adı'))
    slug = models.SlugField(max_length=100, verbose_name=_('Kod'))
    category = models.CharField(
        max_length=20,
        choices=ReportCategory.choices,
        default=ReportCategory.CUSTOM,
        verbose_name=_('Kategori')
    )
    
    html_body = models.TextField(
        verbose_name=_('HTML Gövdesi'),
        help_text=_('Template formatında HTML içeriği.')
    )
    css_styles = models.TextField(
        blank=True, default='',
        verbose_name=_('CSS Stilleri'),
        help_text=_('Rapor için özel CSS kuralları.')
    )
    
    is_default = models.BooleanField(
        default=False,
        verbose_name=_('Varsayılan mı?'),
        help_text=_('Aynı kategorideki bir işlem için bu şablonun varsayılan olarak kullanılıp kullanılmayacağını belirler.')
    )

    class Meta:
        verbose_name = _('Rapor Şablonu')
        verbose_name_plural = _('Rapor Şablonları')
        ordering = ['category', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['slug'],
                condition=models.Q(is_active=True),
                name='uniq_reporttemplate_slug_among_active',
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"


# ── ESC/POS Fiş Şablonları ──────────────────────────────────────────────────

class ReceiptCategory(models.TextChoices):
    POS_RECEIPT    = "POS_RECEIPT",    _("POS Fişi / Adisyon")
    KITCHEN_TICKET = "KITCHEN_TICKET", _("Mutfak Fişi")
    WAITER_TICKET  = "WAITER_TICKET",  _("Garson Fişi")


class ReceiptTemplate(BaseModel):
    """
    ESC/POS termal yazıcılar için blok tabanlı fiş şablonu.
    Şablon içeriği layout_json alanında JSON blokları olarak saklanır.
    """
    name = models.CharField(max_length=150, verbose_name=_('Şablon Adı'))
    slug = models.SlugField(max_length=100, verbose_name=_('Kod'))
    category = models.CharField(
        max_length=20,
        choices=ReceiptCategory.choices,
        default=ReceiptCategory.POS_RECEIPT,
        verbose_name=_('Kategori')
    )

    paper_width = models.PositiveSmallIntegerField(
        default=48,
        verbose_name=_('Kağıt Genişliği (karakter)'),
        help_text=_('Satır başına karakter sayısı. 58mm→32, 80mm→48.')
    )

    layout_json = models.JSONField(
        default=list,
        verbose_name=_('Şablon Blokları'),
        help_text=_('ESC/POS komutlarına dönüştürülecek blok listesi.')
    )

    is_default = models.BooleanField(
        default=False,
        verbose_name=_('Varsayılan mı?'),
        help_text=_('Aynı kategorideki işlem için varsayılan şablon.')
    )

    class Meta:
        verbose_name = _('Fiş Şablonu')
        verbose_name_plural = _('Fiş Şablonları')
        ordering = ['category', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['category'],
                condition=models.Q(is_default=True, is_active=True),
                name='unique_default_receipt_per_category'
            ),
            models.UniqueConstraint(
                fields=['slug'],
                condition=models.Q(is_active=True),
                name='uniq_receipttemplate_slug_among_active',
            ),
        ]

    def __str__(self):
        w = "80mm" if self.paper_width >= 48 else "58mm"
        return f"{self.name} ({self.get_category_display()}) [{w}]"
