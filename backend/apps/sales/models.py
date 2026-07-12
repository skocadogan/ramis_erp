from django.db import models
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel
from apps.branches.models import Branch
from apps.orders.models import Order
from apps.users.models import User


class PaymentMethod(models.TextChoices):
    CASH = 'CASH', _('Nakit')
    CARD = 'CARD', _('Kredi Kartı')
    OTHER = 'OTHER', _('Diğer')
    CREDIT = 'CREDIT', _('Ödenmez')


class Sale(BaseModel):
    order = models.OneToOneField(
        Order,
        on_delete=models.PROTECT,
        related_name='sale',
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='sales',
    )
    shift = models.ForeignKey(
        'shifts.Shift',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales',
    )
    pos_terminal = models.ForeignKey(
        'pos_display.PosTerminal',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales',
        verbose_name=_('POS terminali'),
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales',
    )
    payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
    )
    is_split_payment = models.BooleanField(default=False)
    original_payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        blank=True,
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=4)
    paid_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    # Mali ÖKC / e-Arşiv Fatura Alanları
    fiscal_printed = models.BooleanField(default=False, verbose_name=_("Mali Fiş Basıldı mı"))
    okc_serial_number = models.CharField(max_length=50, null=True, blank=True, verbose_name=_("ÖKC Seri No"))
    okc_receipt_number = models.CharField(max_length=20, null=True, blank=True, verbose_name=_("ÖKC Fiş No"))
    okc_z_number = models.CharField(max_length=20, null=True, blank=True, verbose_name=_("Z Raporu No"))
    okc_receipt_datetime = models.DateTimeField(null=True, blank=True, verbose_name=_("ÖKC Mali Fiş Zamanı"))
    fiscal_qr_code = models.TextField(null=True, blank=True, verbose_name=_("Mali Karekod Verisi"))
    fiscal_raw_response = models.JSONField(default=dict, blank=True, verbose_name=_("Mali Ham Yanıt"))

    # İade/İmha sistemi (EPIC-05)
    return_reason_code = models.CharField(
        max_length=50, null=True, blank=True,
        verbose_name=_('İade Gerekçe Kodu'),
        db_index=True,
    )
    return_reason_text = models.TextField(
        null=True, blank=True, verbose_name=_('İade Gerekçe Metni'),
    )
    return_flow = models.ForeignKey(
        'inventory.ReturnDisposalFlow',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='voided_sales',
        verbose_name=_('İade/İmha Akışı'),
    )

    # İndirim alanları
    discount_amount = models.DecimalField(
        max_digits=12, decimal_places=4, default=0,
        verbose_name=_('İndirim Tutarı'),
    )
    discount_type = models.CharField(
        max_length=10,
        choices=[('ORDER', _('Sipariş İndirimi')), ('ITEM', _('Ürün İndirimi'))],
        null=True, blank=True,
        verbose_name=_('İndirim Türü'),
    )
    discount_applied_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='applied_discounts',
        verbose_name=_('İndirimi Uygulayan'),
    )

    class Meta:
        ordering = ['-paid_at']
        indexes = [
            models.Index(fields=['branch', '-paid_at']),
            models.Index(fields=['paid_at']),
            models.Index(fields=['is_deleted', '-paid_at']),
            models.Index(fields=['payment_method']),
            models.Index(fields=['is_deleted', 'branch', 'paid_at']),
        ]

    def save(self, *args, **kwargs):
        if not self.original_payment_method:
            self.original_payment_method = self.payment_method
        super().save(*args, **kwargs)

    def get_payment_method_display(self):
        return PaymentMethod(self.payment_method).label
        
    def __str__(self):
        return f"Sale #{self.id} - {self.total_amount} ({self.payment_method})"


class SalePayment(BaseModel):
    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name='payments',
    )
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=4)
    notes = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['created_at']
        verbose_name = _('Satış Ödemesi')
        verbose_name_plural = _('Satış Ödemeleri')
        indexes = [
            models.Index(fields=['sale', 'payment_method']),
        ]


class FiscalBasketStatus(models.TextChoices):
    PENDING = 'PENDING', _('Bekliyor')
    COMPLETED = 'COMPLETED', _('Tamamlandı')
    CANCELLED = 'CANCELLED', _('İptal')
    FAILED = 'FAILED', _('Hata')


class FiscalPendingBasket(BaseModel):
    """
    Token X-Connect Cloud instant basket → webhook eşlemesi.
    Ödeme akışı sepeti gönderir; Token BASKET_COMPLETED webhook'u ile sonucu yazar.
    """

    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name='fiscal_pending_baskets',
    )
    pos_terminal = models.ForeignKey(
        'pos_display.PosTerminal',
        on_delete=models.CASCADE,
        related_name='fiscal_pending_baskets',
    )
    basket_id = models.CharField(max_length=36, unique=True, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=FiscalBasketStatus.choices,
        default=FiscalBasketStatus.PENDING,
        db_index=True,
    )
    result_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default='')
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Bekleyen mali sepet')
        verbose_name_plural = _('Bekleyen mali sepetler')
        indexes = [
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['pos_terminal', 'status']),
        ]

    def __str__(self):
        return f"FiscalBasket {self.basket_id} ({self.status})"
