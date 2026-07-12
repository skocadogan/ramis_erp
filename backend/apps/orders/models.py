from decimal import Decimal

from django.db import models
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel
from apps.branches.models import Branch, Table, Zone
from apps.users.models import User
from apps.menu.models import Product, ProductVariant, Modifier


class OrderStatus(models.TextChoices):
    PENDING = 'PENDING', _('Bekliyor')
    PREPARING = 'PREPARING', _('Hazırlanıyor')
    READY = 'READY', _('Hazır')
    DELIVERED = 'DELIVERED', _('Teslim Edildi')
    COMPLETED = 'COMPLETED', _('Tamamlandı')
    CANCELLED = 'CANCELLED', _('İptal Edildi')

class OrderType(models.TextChoices):
    TABLE = 'TABLE', _('Masa')
    TAKEAWAY = 'TAKEAWAY', _('Paket')

class Order(BaseModel):
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name='orders')
    table = models.ForeignKey(Table, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    takeaway_zone = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='takeaway_orders',
        verbose_name=_('Paket bölgesi'),
        help_text=_('Masasız paket siparişleri için POS’ta gruplanacak bölge.'),
    )
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='processed_orders')
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders',
        verbose_name=_('Müşteri')
    )
    
    order_type = models.CharField(
        max_length=20, 
        choices=OrderType.choices, 
        default=OrderType.TABLE,
        verbose_name=_('Sipariş Türü')
    )
    status = models.CharField(max_length=20, choices=OrderStatus.choices, default=OrderStatus.PENDING)
    total_amount = models.DecimalField(max_digits=12, decimal_places=4, default=0.00)
    order_number = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        verbose_name=_('Sipariş No'),
        help_text=_('Günlük sıfırlanan, şubeye özel kısa numara (örn. #1, #2)')
    )
    notes = models.TextField(blank=True, null=True)

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
    discount_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='discounted_orders',
        verbose_name=_('İndirimi Uygulayan'),
    )
    stock_tracking_mode = models.CharField(
        max_length=20,
        choices=[('PRODUCT', _('Ürün Kısıtına Göre')), ('INGREDIENT', _('Hammaddeye Göre'))],
        default='PRODUCT',
        verbose_name=_('Stok Takip Yöntemi')
    )

    # İptal gerekçesi (Audit Trail v1.11)
    cancel_reason_code = models.CharField(max_length=50, null=True, blank=True, verbose_name=_('İptal Gerekçesi Kodu'))
    cancel_reason_text = models.TextField(null=True, blank=True, verbose_name=_('İptal Gerekçesi Metni'))

    class Meta:
        verbose_name = _('Sipariş')
        verbose_name_plural = _('Siparişler')
        indexes = [
            models.Index(fields=['branch', 'status']),
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['branch', 'created_at']),  # KDS / dashboard
            models.Index(fields=['table', 'status']),       # masa açık siparişler
            models.Index(fields=['order_number']),
        ]

    def __str__(self):
        return f"Order #{self.id} - {self.status}"


class OrderItem(BaseModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, null=True, blank=True)

    quantity = models.PositiveIntegerField(default=1)
    portion_multiplier = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=Decimal('1'),
        verbose_name=_('Porsiyon çarpanı'),
        help_text=_('Birleşik ürün alt kaleminde reçete düşümü: miktar × bu çarpan (satış birimi).'),
    )
    unit_price = models.DecimalField(max_digits=12, decimal_places=4)
    total_price = models.DecimalField(max_digits=12, decimal_places=4)

    status = models.CharField(max_length=20, choices=OrderStatus.choices, default=OrderStatus.PENDING)
    scheduled_start_time = models.DateTimeField(
        null=True, 
        blank=True, 
        verbose_name=_('Planlanan Başlangıç Zamanı'),
        help_text=_('Smart Firing için hazırlığa başlanması gereken zaman.')
    )
    unit_name = models.CharField(max_length=100, blank=True, null=True, verbose_name=_("Birim Adı"))
    notes = models.CharField(max_length=255, blank=True, null=True)

    parent_item = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='components',
        verbose_name=_('Ana Ürün (Birleşik)')
    )

    # Sipariş anındaki istasyon snapshot'ı — sonradan kategori değişse bile doğru kalır
    station = models.ForeignKey(
        'branches.KitchenStation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='order_items',
        verbose_name=_('Mutfak İstasyonu'),
    )
    firing_forced_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Ateşleme operatör müdahalesi (şimdi başlat)'),
        help_text=_('force-now ile set edilir; KDS firing_state için kullanılır.'),
    )

    # Sipariş anındaki şube — denormalize (okuma performansı)
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name=_('Şube (denormalize)'),
        help_text=_('order.branch_id\'nin okuma performansı için kopyası. Order.save() ile güncellenir.'),
    )

    # İptal gerekçesi (Audit Trail v1.11)
    cancel_reason_code = models.CharField(max_length=50, null=True, blank=True, verbose_name=_('İptal Gerekçesi Kodu'))
    cancel_reason_text = models.TextField(null=True, blank=True, verbose_name=_('İptal Gerekçesi Metni'))

    # İade/İmha sistemi (EPIC-05)
    waste_recorded = models.BooleanField(
        default=False,
        verbose_name=_('Fire Kaydedildi'),
        help_text=_('Hazırlanmış ürün iptal edildiğinde fire stok hareketinin '
                    'kaydedilip kaydedilmediğini gösterir. Double-spending koruması.'),
    )
    return_flow = models.ForeignKey(
        'inventory.ReturnDisposalFlow',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='returned_order_items',
        verbose_name=_('İade/İmha Akışı'),
    )

    waiter_acknowledged_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Garson mutfak bildiriminde görüldü'),
        help_text=_('READY kalem garson tarafından görüldü işaretlendiğinde set edilir; teslim (DELIVERED) ayrıdır.'),
    )

    class Meta:
        verbose_name = _('Sipariş Kalemi')
        verbose_name_plural = _('Sipariş Kalemleri')
        indexes = [
            models.Index(fields=['order', 'status']),
            models.Index(fields=['station', 'status']),     # KDS ana sorgu
            models.Index(fields=['parent_item']),
            models.Index(fields=['scheduled_start_time']),  # smart firing
            models.Index(fields=['status', 'parent_item']),  # dashboard aggregate
            models.Index(fields=['product', 'status']),      # top products
            models.Index(fields=['branch', 'station', 'status'], name='idx_oi_br_st_st'),
            models.Index(fields=['order', 'status', 'parent_item'], name='idx_oi_order_st_par'),
        ]

    def save(self, *args, **kwargs):
        if self.order_id and not self.branch_id:
            self.branch_id = self.order.branch_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantity}x {self.product.name} (Order #{self.order.id})"

class OrderItemModifier(BaseModel):
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name='modifiers')
    modifier = models.ForeignKey(Modifier, on_delete=models.PROTECT)
    price = models.DecimalField(max_digits=12, decimal_places=4, default=0.00)

    def __str__(self):
        return f"+ {self.modifier.name} for {self.order_item.id}"


class ProductStationTimingStats(BaseModel):
    """Ürün × istasyon × şube için gözlemlenen hazırlık süresi özeti (EMA)."""

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='product_station_timing_stats')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='station_timing_stats')
    station = models.ForeignKey(
        'branches.KitchenStation',
        on_delete=models.CASCADE,
        related_name='product_timing_stats',
    )
    ema_minutes = models.FloatField(default=0.0, verbose_name=_('EMA (dk)'))
    sample_count = models.PositiveIntegerField(default=0, verbose_name=_('Örnek sayısı'))

    class Meta:
        verbose_name = _('Ürün istasyon süre istatistiği')
        verbose_name_plural = _('Ürün istasyon süre istatistikleri')
        constraints = [
            models.UniqueConstraint(
                fields=('branch', 'product', 'station'),
                name='orders_productstationtimingstats_branch_product_station_uniq',
            )
        ]

    def __str__(self):
        return f'{self.product_id} @ {self.station_id} ema={self.ema_minutes}'


class PosIdempotencyScope(models.TextChoices):
    ORDER_CREATE = 'order.create', _('Sipariş oluştur')
    ORDER_COMPLETE = 'order.complete', _('Sipariş tamamla')
    ORDER_COMPLETE_TABLE = 'order.complete_table', _('Masa kapat')


class PosIdempotencyRecord(BaseModel):
    """POS offline senkron / tekrar deneme için idempotent yanıt önbelleği."""

    idempotency_key = models.CharField(
        max_length=128,
        unique=True,
        db_index=True,
        verbose_name=_('Idempotency anahtarı'),
    )
    scope = models.CharField(
        max_length=32,
        choices=PosIdempotencyScope.choices,
        verbose_name=_('Kapsam'),
    )
    request_hash = models.CharField(max_length=64, verbose_name=_('İstek özeti'))
    response_status = models.PositiveSmallIntegerField(verbose_name=_('Yanıt durumu'))
    response_body = models.JSONField(default=dict, verbose_name=_('Yanıt gövdesi'))
    branch = models.ForeignKey(
        Branch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pos_idempotency_records',
    )
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pos_idempotency_records',
    )
    resource_id = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        verbose_name = _('POS idempotency kaydı')
        verbose_name_plural = _('POS idempotency kayıtları')
        indexes = [
            models.Index(fields=['scope', 'created_at']),
            models.Index(fields=['branch', 'created_at']),
        ]
