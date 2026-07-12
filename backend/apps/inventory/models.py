from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel


class StockCategory(BaseModel):
    name = models.CharField(max_length=100, verbose_name=_('Kategori Adı'))
    code = models.CharField(max_length=50, unique=True, verbose_name=_('Kategori Kodu'))
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        verbose_name=_('Üst Kategori')
    )

    class Meta:
        verbose_name = _('Stok Kategorisi')
        verbose_name_plural = _('Stok Kategorileri')
        ordering = ['name']

    def __str__(self):
        return f"{self.code} - {self.name}"


class UnitCategory(models.TextChoices):
    WEIGHT = 'WEIGHT', _('Ağırlık (kg, g, ...)')
    VOLUME = 'VOLUME', _('Hacim (Lt, ml, ...)')
    COUNT = 'COUNT', _('Adet / Sayı (adet, pk, kutu, ...)')
    OTHER = 'OTHER', _('Diğer')


class Allergen(BaseModel):
    """Alerjen madde referans tablosu (EU-14 benzeri genişletilmiş liste)."""

    code = models.CharField(max_length=50, unique=True, verbose_name=_('Sistem Kodu'))
    name = models.CharField(max_length=200, verbose_name=_('Madde Adı'))
    prevalence_pct = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        verbose_name=_('Küresel Sıklık Oranı (%)'),
    )
    risk_score = models.PositiveSmallIntegerField(
        default=1,
        verbose_name=_('Risk Puanı'),
        help_text=_('1 (düşük) – 10 (yüksek)'),
    )
    sort_order = models.PositiveIntegerField(default=0, verbose_name=_('Sıralama'))

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = _('Alerjen Maddesi')
        verbose_name_plural = _('Alerjen Maddeleri')

    def __str__(self) -> str:
        return f'{self.code} — {self.name}'


class StockUnit(BaseModel):
    name = models.CharField(max_length=50, verbose_name=_('Birim Adı'))
    short_name = models.CharField(max_length=20, verbose_name=_('Kısa Ad'))
    multiplier = models.DecimalField(
        max_digits=12, decimal_places=6, default=1.000, verbose_name=_('Çarpan')
    )
    category = models.CharField(
        max_length=10,
        choices=UnitCategory.choices,
        default=UnitCategory.OTHER,
        verbose_name=_('Birim Kategorisi'),
        help_text=_('Birim dönüşümü yalnızca aynı kategorideki birimler arasında yapılır.'),
    )

    class Meta:
        verbose_name = _('Miktar Birimi')
        verbose_name_plural = _('Miktar Birimleri')
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.short_name})"


class StockItem(BaseModel):
    """Ham madde veya stok kalemi. Birim, StockUnit (Birim Tanımlamaları) short_name ile eşleşir."""

    name = models.CharField(max_length=200, verbose_name=_('Stok Adı'))
    sku = models.CharField(max_length=50, unique=True, verbose_name=_('Stok Kodu'))
    barcode = models.CharField(max_length=100, blank=True, null=True, verbose_name=_('Barkod'))
    unit = models.CharField(
        max_length=20,
        default='adet',
        verbose_name=_('Birim'),
        help_text=_('StockUnit.short_name ile eşleşmeli (Birim Tanımlamalarından)'),
    )
    minimum_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=6,
        default=0,
        verbose_name=_('Minimum Miktar'),
        help_text=_('-1 = sınırsız (kritik stok kontrollerinde dikkate alınmaz).'),
    )
    last_purchase_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, verbose_name=_('Son Giriş Fiyatı'),
    )
    average_cost = models.DecimalField(
        max_digits=10, decimal_places=4, default=0,
        verbose_name=_('Ağırlıklı Ortalama Maliyet'),
        help_text=_('Mal kabulleri üzerinden otomatik hesaplanır.'),
    )
    category = models.ForeignKey(
        'StockCategory',
        on_delete=models.SET_NULL,
        related_name='stock_items',
        verbose_name=_('Kategori'),
        null=True,
    )
    allergens = models.ManyToManyField(
        Allergen,
        blank=True,
        related_name='stock_items',
        verbose_name=_('Alerjen Maddeler'),
    )
    is_returnable = models.BooleanField(
        default=False,
        verbose_name=_('İade Edilebilir'),
        help_text=_('Kapaklı/kutulu ürünlerde fiziksel iade mümkün. '
                    'True ise iptal/iade akışında fiziksel kontrol talep edilir.'),
    )

    class Meta:
        ordering = ['name']
        verbose_name = _('Stok Kalemi')
        verbose_name_plural = _('Stok Kalemleri')
        indexes = [
            models.Index(fields=['sku']),
        ]

    def __str__(self) -> str:
        return f'{self.name} ({self.sku})'


class StockLot(BaseModel):
    """Bir mal kabulüne ait parti/lot bilgisi — FEFO (First-Expired-First-Out) takibi için."""

    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.CASCADE,
        related_name='lots',
        verbose_name=_('Stok Kalemi'),
    )
    warehouse = models.ForeignKey(
        'warehouse.Warehouse',
        on_delete=models.CASCADE,
        related_name='stock_lots',
        verbose_name=_('Depo'),
    )
    lot_number = models.CharField(
        max_length=100, blank=True, default='',
        verbose_name=_('Parti/Lot Numarası'),
    )
    expiry_date = models.DateField(
        blank=True, null=True,
        verbose_name=_('Son Kullanma Tarihi (SKT)'),
    )
    quantity = models.DecimalField(
        max_digits=12, decimal_places=6, default=0,
        verbose_name=_('Kalan Miktar'),
    )
    initial_quantity = models.DecimalField(
        max_digits=12, decimal_places=6, default=0,
        verbose_name=_('Başlangıç Miktarı'),
    )
    unit_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        verbose_name=_('Birim Fiyat'),
    )
    received_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_('Kabul Tarihi'),
    )
    fefo_priority_boost = models.PositiveSmallIntegerField(
        default=0,
        verbose_name=_('FEFO Öncelik Boost'),
        help_text=_('Yüksek değer önce tüketilir (SKT öncelikli tüketim aksiyonu).'),
    )
    fefo_priority_until = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name=_('FEFO Boost Geçerlilik'),
    )

    class Meta:
        verbose_name = _('Stok Partisi')
        verbose_name_plural = _('Stok Partileri')
        ordering = ['expiry_date', 'received_at']  # FEFO sıralaması
        indexes = [
            models.Index(fields=['warehouse', 'stock_item', 'expiry_date']),
            models.Index(fields=['expiry_date']),
        ]

    def __str__(self) -> str:
        skt = self.expiry_date.strftime('%d.%m.%Y') if self.expiry_date else 'SKT yok'
        return f'{self.stock_item.name} — Lot:{self.lot_number} — SKT:{skt} — {self.quantity}'

    @property
    def is_expired(self) -> bool:
        from django.utils import timezone
        if not self.expiry_date:
            return False
        return self.expiry_date < timezone.now().date()

    @property
    def days_until_expiry(self) -> int | None:
        from django.utils import timezone
        if not self.expiry_date:
            return None
        return (self.expiry_date - timezone.now().date()).days


class ExpiryActionType(models.TextChoices):
    PRIORITY_CONSUME = 'PRIORITY_CONSUME', _('Öncelikli Tüketim')
    TRANSFER_SUGGEST = 'TRANSFER_SUGGEST', _('Transfer Önerisi')
    PLAN_NOTE = 'PLAN_NOTE', _('Plan Revizyon Notu')


class ExpiryAction(BaseModel):
    """SKT risk lotu için operasyonel aksiyon kaydı."""

    stock_lot = models.ForeignKey(
        StockLot,
        on_delete=models.CASCADE,
        related_name='expiry_actions',
        verbose_name=_('Stok Partisi'),
    )
    action_type = models.CharField(
        max_length=32,
        choices=ExpiryActionType.choices,
        verbose_name=_('Aksiyon Tipi'),
    )
    notes = models.TextField(blank=True, default='', verbose_name=_('Not'))
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expiry_actions',
        verbose_name=_('Oluşturan'),
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expiry_actions',
        verbose_name=_('Şube'),
    )
    result_json = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Otomasyon Sonucu'),
    )
    automation_applied = models.BooleanField(
        default=False,
        verbose_name=_('Otomasyon Uygulandı'),
    )

    class Meta:
        verbose_name = _('SKT Aksiyonu')
        verbose_name_plural = _('SKT Aksiyonları')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['stock_lot', '-created_at']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self) -> str:
        return f'{self.get_action_type_display()} — {self.stock_lot_id}'


class StockMovementType(models.TextChoices):
    IN = 'IN', _('Giriş')
    OUT = 'OUT', _('Çıkış')
    ADJUSTMENT = 'ADJUSTMENT', _('Düzeltme')
    WASTE = 'WASTE', _('Fire/Zayi')
    TRANSFER = 'TRANSFER', _('Transfer')
    RETURN = 'RETURN', _('İade')
    CANCEL = 'CANCEL', _('İptal')
    DISPOSAL = 'DISPOSAL', _('İmha')


class StockMovement(BaseModel):
    """Stok hareketi kaydı."""

    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.CASCADE,
        related_name='movements',
        verbose_name=_('Stok Kalemi'),
    )
    warehouse = models.ForeignKey(
        'warehouse.Warehouse',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_movements',
        verbose_name=_('Depo'),
    )
    movement_type = models.CharField(
        max_length=20,
        choices=StockMovementType.choices,
        verbose_name=_('Hareket Tipi'),
    )
    quantity = models.DecimalField(
        max_digits=12, decimal_places=6, verbose_name=_('Miktar'),
    )
    reference = models.CharField(
        max_length=200, blank=True, null=True, verbose_name=_('Referans'),
    )
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))
    performed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_movements',
        verbose_name=_('İşlemi Yapan'),
    )
    supplier = models.ForeignKey(
        'Supplier',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_movements',
        verbose_name=_('Tedarikçi'),
    )
    unit = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        verbose_name=_('Birim'),
        help_text=_('StockUnit.short_name ile eşleşmeli'),
    )
    unit_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, verbose_name=_('Birim Fiyat'),
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Stok Hareketi')
        verbose_name_plural = _('Stok Hareketleri')
        indexes = [
            models.Index(fields=['stock_item', '-created_at']),
            models.Index(fields=['warehouse', '-created_at']),
            models.Index(fields=['movement_type', '-created_at']),
            models.Index(fields=['warehouse', 'movement_type', '-created_at']), # Dashboard için kritik
            models.Index(fields=['reference']),
        ]

    def __str__(self) -> str:
        return f'{self.movement_type} - {self.stock_item.name} - {self.quantity}'

    @property
    def signed_quantity(self):
        from apps.inventory.stock_movement_display import get_stock_movement_signed_quantity

        return get_stock_movement_signed_quantity(self)


class StockMovementLot(BaseModel):
    """Stok hareketinin hangi lot(lar)dan tüketildiğini kaydeder (FEFO maliyet izi)."""

    movement = models.ForeignKey(
        StockMovement,
        on_delete=models.CASCADE,
        related_name='lot_consumptions',
        verbose_name=_('Stok Hareketi'),
    )
    stock_lot = models.ForeignKey(
        StockLot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='movement_consumptions',
        verbose_name=_('Stok Partisi'),
    )
    quantity = models.DecimalField(
        max_digits=12, decimal_places=6, verbose_name=_('Miktar'),
    )
    unit_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, verbose_name=_('Birim Fiyat'),
    )
    lot_number = models.CharField(
        max_length=100, blank=True, default='',
        verbose_name=_('Parti Numarası (snapshot)'),
    )
    expiry_date = models.DateField(
        blank=True, null=True,
        verbose_name=_('SKT (snapshot)'),
    )

    class Meta:
        verbose_name = _('Stok Hareketi Lot Satırı')
        verbose_name_plural = _('Stok Hareketi Lot Satırları')
        indexes = [
            models.Index(fields=['movement']),
            models.Index(fields=['stock_lot']),
        ]

    def __str__(self) -> str:
        return f'{self.movement_id} — {self.lot_number} — {self.quantity}'


class Supplier(BaseModel):
    """Tedarikçi bilgisi."""

    name = models.CharField(max_length=200, verbose_name=_('Tedarikçi Adı'))
    contact_person = models.CharField(
        max_length=200, blank=True, null=True, verbose_name=_('İletişim Kişisi'),
    )
    phone = models.CharField(max_length=50, blank=True, null=True, verbose_name=_('Telefon'))
    email = models.EmailField(blank=True, null=True, verbose_name=_('E-posta'))
    address = models.TextField(blank=True, null=True, verbose_name=_('Adres'))
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))
    stock_items = models.ManyToManyField(
        StockItem,
        blank=True,
        related_name='suppliers',
        verbose_name=_('Tedarik Edilen Ürünler'),
    )

    class Meta:
        ordering = ['name']
        verbose_name = _('Tedarikçi')
        verbose_name_plural = _('Tedarikçiler')

    def __str__(self) -> str:
        return self.name


class StockReceiptDraftStatus(models.TextChoices):
    DRAFT = 'DRAFT', _('Taslak')
    POSTED = 'POSTED', _('Kesinleştirildi')


class StockReceiptDraft(BaseModel):
    """Toplu stok girişi taslağı (fatura/irsaliye satırları iki kademeli kayıt)."""

    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='stock_receipt_drafts',
        verbose_name=_('Oluşturan'),
    )
    warehouse = models.ForeignKey(
        'warehouse.Warehouse',
        on_delete=models.CASCADE,
        related_name='stock_receipt_drafts',
        verbose_name=_('Depo'),
    )
    supplier = models.ForeignKey(
        'Supplier',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_receipt_drafts',
        verbose_name=_('Tedarikçi'),
    )
    reference = models.CharField(
        max_length=200,
        blank=True,
        default='',
        verbose_name=_('Fatura / İrsaliye Referansı'),
    )
    notes = models.TextField(blank=True, default='', verbose_name=_('Notlar'))
    status = models.CharField(
        max_length=20,
        choices=StockReceiptDraftStatus.choices,
        default=StockReceiptDraftStatus.DRAFT,
        verbose_name=_('Durum'),
    )
    posted_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Kesinleştirme Zamanı'))

    class Meta:
        verbose_name = _('Toplu Stok Girişi Taslağı')
        verbose_name_plural = _('Toplu Stok Girişi Taslakları')
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['warehouse', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.reference or self.id} — {self.get_status_display()}'


class StockReceiptDraftLine(BaseModel):
    """Taslak satırı: mevcut stok kalemi veya yeni kalem (geçici alanlar)."""

    draft = models.ForeignKey(
        StockReceiptDraft,
        on_delete=models.CASCADE,
        related_name='lines',
        verbose_name=_('Taslak'),
    )
    sort_order = models.PositiveIntegerField(default=0, verbose_name=_('Sıra'))
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='receipt_draft_lines',
        verbose_name=_('Stok Kalemi'),
    )
    temp_name = models.CharField(max_length=200, blank=True, default='', verbose_name=_('Geçici Ad (yeni kalem)'))
    temp_sku = models.CharField(max_length=50, blank=True, default='', verbose_name=_('Geçici SKU'))
    temp_unit = models.CharField(max_length=20, blank=True, default='', verbose_name=_('Geçici Birim'))
    temp_category = models.ForeignKey(
        'StockCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='receipt_draft_lines',
        verbose_name=_('Geçici Kategori'),
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=6,
        verbose_name=_('Miktar'),
    )
    unit = models.CharField(
        max_length=20,
        blank=True,
        default='',
        verbose_name=_('Fatura Birimi'),
        help_text=_('StockUnit.short_name; boşsa stok kaleminin birimi kullanılır'),
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name=_('Birim Fiyat'),
    )
    lot_number = models.CharField(max_length=100, blank=True, default='', verbose_name=_('Parti/Lot'))
    expiry_date = models.DateField(null=True, blank=True, verbose_name=_('SKT'))

    class Meta:
        verbose_name = _('Taslak Satırı')
        verbose_name_plural = _('Taslak Satırları')
        ordering = ['sort_order', 'id']
        indexes = [
            models.Index(fields=['draft', 'sort_order']),
        ]

    def __str__(self) -> str:
        if self.stock_item_id:
            return f'{self.stock_item.sku} × {self.quantity}'
        return f'{self.temp_sku or "?"} × {self.quantity}'


class StockReservationStatus(models.TextChoices):
    RESERVED = 'RESERVED', _('Rezerve')
    COMMITTED = 'COMMITTED', _('Commit')
    RELEASED = 'RELEASED', _('Serbest')


class StockReservation(BaseModel):
    """Sipariş bazlı stok rezervasyonu (opsiyonel mekanizma)."""

    order_item = models.ForeignKey(
        'orders.OrderItem',
        on_delete=models.CASCADE,
        related_name='stock_reservations',
        verbose_name=_('Sipariş Kalemi'),
    )
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.PROTECT,
        related_name='reservations',
        verbose_name=_('Stok Kalemi'),
    )
    warehouse = models.ForeignKey(
        'warehouse.Warehouse',
        on_delete=models.PROTECT,
        related_name='stock_reservations',
        verbose_name=_('Depo'),
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=3, verbose_name=_('Miktar'))
    status = models.CharField(
        max_length=20,
        choices=StockReservationStatus.choices,
        default=StockReservationStatus.RESERVED,
        verbose_name=_('Durum'),
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Stok Rezervasyonu')
        verbose_name_plural = _('Stok Rezervasyonları')
        indexes = [
            models.Index(fields=['warehouse', 'stock_item', 'status']),
            models.Index(fields=['order_item', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.status} - {self.stock_item.name} - {self.quantity}'


class OrderItemIngredientCost(BaseModel):
    """Sipariş commit anındaki ingredient maliyet snapshot kaydı (append-only)."""

    order_item = models.ForeignKey(
        'orders.OrderItem',
        on_delete=models.CASCADE,
        related_name='ingredient_cost_entries',
        verbose_name=_('Sipariş Kalemi'),
    )
    product = models.ForeignKey(
        'menu.Product',
        on_delete=models.PROTECT,
        related_name='ingredient_cost_entries',
        verbose_name=_('Ürün'),
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='ingredient_cost_entries',
        verbose_name=_('Şube'),
    )
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.PROTECT,
        related_name='ingredient_cost_entries',
        verbose_name=_('Stok Kalemi'),
    )
    warehouse = models.ForeignKey(
        'warehouse.Warehouse',
        on_delete=models.PROTECT,
        related_name='ingredient_cost_entries',
        verbose_name=_('Depo'),
    )
    movement = models.ForeignKey(
        StockMovement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ingredient_cost_entries',
        verbose_name=_('İlgili Stok Hareketi'),
    )
    quantity = models.DecimalField(
        max_digits=12, decimal_places=6, verbose_name=_('Miktar'),
    )
    unit_cost_snapshot = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, verbose_name=_('Birim Maliyet Snapshot'),
    )
    line_cost_snapshot = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, verbose_name=_('Satır Maliyet Snapshot'),
    )
    committed_at = models.DateTimeField(default=timezone.now, verbose_name=_('Commit Zamanı'))

    class Meta:
        ordering = ['-committed_at', '-created_at']
        verbose_name = _('Sipariş Ingredient Maliyet Kaydı')
        verbose_name_plural = _('Sipariş Ingredient Maliyet Kayıtları')
        indexes = [
            models.Index(fields=['order_item', '-committed_at']),
            models.Index(fields=['branch', '-committed_at']),
            models.Index(fields=['stock_item', '-committed_at']),
            models.Index(fields=['movement']),
        ]

    def __str__(self) -> str:
        return f'{self.order_item_id} -> {self.stock_item_id} ({self.quantity})'


class ProductionReservationStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', _('Aktif')
    CONSUMED = 'CONSUMED', _('Tüketildi')
    RELEASED = 'RELEASED', _('Serbest Bırakıldı')


class ProductionReservation(BaseModel):
    """Üretim planı satırı bazlı stok rezervasyonu.

    ProductionPlan.approve() aşamasında oluşturulur,
    PrepTask.complete() aşamasında CONSUMED'e çekilir.
    """

    plan_line = models.ForeignKey(
        'production_planning.ProductionPlanLine',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='stock_reservations',
        verbose_name=_('Üretim Planı Satırı'),
    )
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.PROTECT,
        related_name='production_reservations',
        verbose_name=_('Stok Kalemi'),
    )
    warehouse = models.ForeignKey(
        'warehouse.Warehouse',
        on_delete=models.PROTECT,
        related_name='production_reservations',
        verbose_name=_('Depo'),
    )
    quantity = models.DecimalField(
        max_digits=12, decimal_places=6, verbose_name=_('Miktar'),
    )
    status = models.CharField(
        max_length=20,
        choices=ProductionReservationStatus.choices,
        default=ProductionReservationStatus.ACTIVE,
        verbose_name=_('Durum'),
    )
    prep_task = models.ForeignKey(
        'prep.PrepTask',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_reservations',
        verbose_name=_('Hazırlık Görevi'),
        help_text=_('Hangi hazırlık görevi için rezerve edildiğini takip eder.'),
    )

    class Meta:
        verbose_name = _('Üretim Stok Rezervasyonu')
        verbose_name_plural = _('Üretim Stok Rezervasyonları')
        constraints = [
            models.UniqueConstraint(
                fields=['stock_item', 'warehouse', 'plan_line'],
                condition=models.Q(is_active=True),
                name='prodreservation_unique_item_warehouse_planline_active',
            ),
        ]
        indexes = [
            models.Index(fields=['warehouse', 'stock_item', 'status']),
            models.Index(fields=['plan_line', 'status']),
            models.Index(fields=['prep_task', 'status']),
        ]

    def __str__(self) -> str:
        return (
            f'{self.get_status_display()} - {self.stock_item.name} - '
            f'{self.quantity} ({self.plan_line_id})'
        )


class ReturnDisposalFlowStatus(models.TextChoices):
    DRAFT = 'DRAFT', _('Taslak')
    PENDING_APPROVAL = 'PENDING_APPROVAL', _('Onay Bekliyor')
    APPROVED = 'APPROVED', _('Onaylandı')
    COMPLETED = 'COMPLETED', _('Tamamlandı')
    CANCELLED = 'CANCELLED', _('İptal Edildi')


class ReturnDisposalFlowType(models.TextChoices):
    RETURN_TO_SUPPLIER = 'RETURN_TO_SUPPLIER', _('Tedarikçiye İade')
    CUSTOMER_RETURN = 'CUSTOMER_RETURN', _('Müşteri İadesi')
    DISPOSAL = 'DISPOSAL', _('İmha')
    END_OF_DAY_SURPLUS = 'END_OF_DAY_SURPLUS', _('Gün Sonu Fazlası')


class ReturnDisposalFlow(BaseModel):
    """İade/imha sürecini yöneten ana model."""

    flow_type = models.CharField(
        max_length=30,
        choices=ReturnDisposalFlowType.choices,
        verbose_name=_('Akış Tipi'),
    )
    status = models.CharField(
        max_length=20,
        choices=ReturnDisposalFlowStatus.choices,
        default=ReturnDisposalFlowStatus.DRAFT,
        verbose_name=_('Durum'),
    )
    source_warehouse = models.ForeignKey(
        'warehouse.Warehouse',
        on_delete=models.PROTECT,
        related_name='return_flows_from',
        verbose_name=_('Kaynak Depo'),
    )
    target_warehouse = models.ForeignKey(
        'warehouse.Warehouse',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='return_flows_to',
        verbose_name=_('Hedef Depo'),
    )
    supplier = models.ForeignKey(
        'inventory.Supplier',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_('Tedarikçi'),
    )
    reason_code = models.CharField(
        max_length=50,
        blank=True,
        verbose_name=_('Neden Kodu'),
    )
    reason_text = models.TextField(blank=True, verbose_name=_('Neden Açıklaması'))
    sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_('Satış'),
    )
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_('Sipariş'),
    )
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_return_flows',
        verbose_name=_('Oluşturan'),
    )
    approved_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_return_flows',
        verbose_name=_('Onaylayan'),
    )
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Tamamlanma Tarihi'))

    class Meta:
        verbose_name = _('İade/İmha Akışı')
        verbose_name_plural = _('İade/İmha Akışları')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'flow_type']),
            models.Index(fields=['sale']),
            models.Index(fields=['order']),
        ]

    def __str__(self):
        return f"{self.get_flow_type_display()} - {self.get_status_display()} ({self.id})"


class ReturnDisposalFlowItem(BaseModel):
    """İade/imha akışındaki her bir stok kalemi."""

    flow = models.ForeignKey(
        ReturnDisposalFlow,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Akış'),
    )
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.PROTECT,
        verbose_name=_('Stok Kalemi'),
    )
    stock_lot = models.ForeignKey(
        StockLot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_('Lot/Parti'),
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=6,
        verbose_name=_('Miktar'),
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name=_('Birim Fiyat'),
    )
    # Fiziksel kontrol alanları (returnable ürünler için)
    is_packaging_intact = models.BooleanField(
        null=True,
        blank=True,
        verbose_name=_('Ambalaj Sağlam mı?'),
        help_text=_('Kapaklı/kutulu ürünlerde fiziksel kontrol sonucu'),
    )
    checked_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_('Kontrol Eden'),
    )
    checked_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Kontrol Tarihi'),
    )

    class Meta:
        verbose_name = _('İade/İmha Kalemi')
        verbose_name_plural = _('İade/İmha Kalemleri')

    def __str__(self):
        return f"{self.stock_item.name} x {self.quantity}"
