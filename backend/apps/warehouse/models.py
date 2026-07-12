import uuid
from decimal import Decimal, InvalidOperation

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.decimal_constants import ZERO_QTY
from core.models import BaseModel


# ──────────────────────────────────────────────────
# 1. Depo Tanımı
# ──────────────────────────────────────────────────
class WarehouseType(models.TextChoices):
    MAIN = 'MAIN', _('Ana Depo')
    SUB = 'SUB', _('Ara Depo')
    COLD = 'COLD', _('Soğuk Hava Deposu')
    DRY = 'DRY', _('Kuru Depo')
    RAW = 'RAW', _('Hammadde Deposu')
    KITCHEN = 'KITCHEN', _('Mutfak Deposu')


class Warehouse(BaseModel):
    """Depo tanımı — her depo bir şubeye bağlıdır."""

    name = models.CharField(max_length=200, verbose_name=_('Depo Adı'))
    code = models.CharField(max_length=50, unique=True, verbose_name=_('Depo Kodu'))
    warehouse_type = models.CharField(
        max_length=20,
        choices=WarehouseType.choices,
        default=WarehouseType.MAIN,
        verbose_name=_('Depo Tipi'),
    )
    branches = models.ManyToManyField(
        'branches.Branch',
        related_name='warehouses',
        verbose_name=_('Şubeler'),
        blank=True,
    )
    address = models.TextField(blank=True, null=True, verbose_name=_('Adres'))
    capacity_info = models.TextField(blank=True, null=True, verbose_name=_('Kapasite Bilgisi'))
    manager = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_warehouses',
        verbose_name=_('Depo Sorumlusu'),
    )
    is_default = models.BooleanField(default=False, verbose_name=_('Varsayılan Depo'))
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))

    class Meta:
        verbose_name = _('Depo')
        verbose_name_plural = _('Depolar')
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active']),
            models.Index(fields=['code']),
        ]

    def __str__(self) -> str:
        return f'{self.code} - {self.name}'


# ──────────────────────────────────────────────────
# 2. Depo-Bazlı Stok Seviyesi
# ──────────────────────────────────────────────────
class WarehouseStockLevel(BaseModel):
    """Bir stok kaleminin belirli bir depodaki miktarını tutar."""

    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='stock_levels',
        verbose_name=_('Depo'),
    )
    stock_item = models.ForeignKey(
        'inventory.StockItem',
        on_delete=models.CASCADE,
        related_name='warehouse_levels',
        verbose_name=_('Stok Kalemi'),
    )
    quantity = models.DecimalField(
        max_digits=12, decimal_places=6, default=0, verbose_name=_('Miktar'),
    )
    minimum_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=6,
        default=0,
        verbose_name=_('Minimum Miktar'),
        help_text=_('-1 = sınırsız (kritik stok kontrollerinde dikkate alınmaz).'),
    )

    class Meta:
        verbose_name = _('Depo Stok Seviyesi')
        verbose_name_plural = _('Depo Stok Seviyeleri')
        unique_together = ('warehouse', 'stock_item')
        indexes = [
            models.Index(fields=['warehouse', 'stock_item']),
            models.Index(fields=['stock_item', 'quantity']), # Düşük stok raporu için
        ]

    def __str__(self) -> str:
        return f'{self.warehouse.code} — {self.stock_item.name}: {self.quantity}'

    @property
    def is_low_stock(self) -> bool:
        from apps.inventory.stock_minimum import is_quantity_below_minimum

        return is_quantity_below_minimum(self.quantity, self.minimum_quantity)


# ──────────────────────────────────────────────────
# 3. Satın Alma Siparişi
# ──────────────────────────────────────────────────
class PurchaseOrderStatus(models.TextChoices):
    DRAFT = 'DRAFT', _('Taslak')
    PENDING = 'PENDING', _('Onay Bekliyor')
    APPROVED = 'APPROVED', _('Onaylandı')
    ORDERED = 'ORDERED', _('Sipariş Verildi')
    PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED', _('Kısmen Teslim Alındı')
    RECEIVED = 'RECEIVED', _('Teslim Alındı')
    CANCELLED = 'CANCELLED', _('İptal Edildi')


def _generate_po_number() -> str:
    """PO-XXXXXXXX formatında benzersiz sipariş numarası üretir."""
    return f'PO-{uuid.uuid4().hex[:8].upper()}'


class PurchaseOrder(BaseModel):
    """Tedarikçiye verilen satın alma siparişi."""

    order_number = models.CharField(
        max_length=50, unique=True, default=_generate_po_number, verbose_name=_('Sipariş No'),
    )
    supplier = models.ForeignKey(
        'inventory.Supplier',
        on_delete=models.PROTECT,
        related_name='purchase_orders',
        verbose_name=_('Tedarikçi'),
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='purchase_orders',
        verbose_name=_('Hedef Depo'),
    )
    status = models.CharField(
        max_length=30,
        choices=PurchaseOrderStatus.choices,
        default=PurchaseOrderStatus.DRAFT,
        verbose_name=_('Durum'),
    )
    order_date = models.DateField(verbose_name=_('Sipariş Tarihi'))
    expected_date = models.DateField(blank=True, null=True, verbose_name=_('Beklenen Teslimat Tarihi'))
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))
    deficiency_report = models.ForeignKey(
        'DeficiencyReport',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_orders',
        verbose_name=_('Bağlı Eksik Listesi'),
    )
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_purchase_orders',
        verbose_name=_('Oluşturan'),
    )
    approved_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_purchase_orders',
        verbose_name=_('Onaylayan'),
    )
    approved_at = models.DateTimeField(blank=True, null=True, verbose_name=_('Onay Tarihi'))
    total_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, verbose_name=_('Toplam Tutar'),
    )

    class Meta:
        verbose_name = _('Satın Alma Siparişi')
        verbose_name_plural = _('Satın Alma Siparişleri')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['order_number']),
            models.Index(fields=['status', 'supplier']),
            models.Index(fields=['warehouse', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.order_number} — {self.supplier.name}'


class PurchaseOrderItem(BaseModel):
    """Satın alma siparişinin bir kalemi."""

    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Satın Alma Siparişi'),
    )
    stock_item = models.ForeignKey(
        'inventory.StockItem',
        on_delete=models.PROTECT,
        related_name='purchase_order_items',
        verbose_name=_('Stok Kalemi'),
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=6, verbose_name=_('Sipariş Miktarı'), validators=[MinValueValidator(0)])
    unit = models.CharField(max_length=20, verbose_name=_('Birim'))
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name=_('Birim Fiyat'), validators=[MinValueValidator(0)])
    received_quantity = models.DecimalField(
        max_digits=12, decimal_places=6, default=0, verbose_name=_('Teslim Alınan Miktar'), validators=[MinValueValidator(0)],
    )
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))

    class Meta:
        verbose_name = _('Sipariş Kalemi')
        verbose_name_plural = _('Sipariş Kalemleri')
        ordering = ['id']

    def __str__(self) -> str:
        return f'{self.purchase_order.order_number} — {self.stock_item.name} x {self.quantity}'

    @property
    def line_total(self):
        return self.quantity * self.unit_price

    @property
    def is_fully_received(self) -> bool:
        # Ondalık hassasiyet artıklarına karşı küçük tolerans (0.01 birim)
        from decimal import Decimal
        return self.received_quantity >= (self.quantity - Decimal("0.01"))


# ──────────────────────────────────────────────────
# 4. Mal Kabul
# ──────────────────────────────────────────────────
class GoodsReceivingStatus(models.TextChoices):
    PENDING = 'PENDING', _('Bekliyor')
    INSPECTED = 'INSPECTED', _('Kontrol Edildi')
    ACCEPTED = 'ACCEPTED', _('Kabul Edildi')
    PARTIALLY_ACCEPTED = 'PARTIALLY_ACCEPTED', _('Kısmen Kabul Edildi')
    REJECTED = 'REJECTED', _('Reddedildi')


def _generate_gr_number() -> str:
    return f'GR-{uuid.uuid4().hex[:8].upper()}'


class GoodsReceiving(BaseModel):
    """Mal kabul belgesi."""

    receiving_number = models.CharField(
        max_length=50, unique=True, default=_generate_gr_number, verbose_name=_('Mal Kabul No'),
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='goods_receivings',
        verbose_name=_('Satın Alma Siparişi'),
    )
    supplier = models.ForeignKey(
        'inventory.Supplier',
        on_delete=models.PROTECT,
        related_name='goods_receivings',
        verbose_name=_('Tedarikçi'),
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='goods_receivings',
        verbose_name=_('Hedef Depo'),
    )
    status = models.CharField(
        max_length=30,
        choices=GoodsReceivingStatus.choices,
        default=GoodsReceivingStatus.PENDING,
        verbose_name=_('Durum'),
    )
    received_date = models.DateField(verbose_name=_('Teslim Alma Tarihi'))
    invoice_number = models.CharField(max_length=100, blank=True, null=True, verbose_name=_('Fatura No'))
    waybill_number = models.CharField(max_length=100, blank=True, null=True, verbose_name=_('İrsaliye No'))
    received_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='received_goods',
        verbose_name=_('Teslim Alan'),
    )
    inspected_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inspected_goods',
        verbose_name=_('Kontrol Eden'),
    )
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))
    total_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, verbose_name=_('Toplam Tutar'),
    )

    class Meta:
        verbose_name = _('Mal Kabul')
        verbose_name_plural = _('Mal Kabul İşlemleri')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['receiving_number']),
            models.Index(fields=['warehouse', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.receiving_number} — {self.supplier.name}'


class GoodsReceivingItem(BaseModel):
    """Mal kabul kalemi."""

    goods_receiving = models.ForeignKey(
        GoodsReceiving,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Mal Kabul'),
    )
    stock_item = models.ForeignKey(
        'inventory.StockItem',
        on_delete=models.PROTECT,
        related_name='goods_receiving_items',
        verbose_name=_('Stok Kalemi'),
    )
    expected_quantity = models.DecimalField(
        max_digits=12, decimal_places=6, default=0, verbose_name=_('Beklenen Miktar'),
    )
    received_quantity = models.DecimalField(
        max_digits=12, decimal_places=6, verbose_name=_('Alınan Miktar'),
    )
    rejected_quantity = models.DecimalField(
        max_digits=12, decimal_places=6, default=0, verbose_name=_('Reddedilen Miktar'),
    )
    unit = models.CharField(max_length=20, verbose_name=_('Birim'))
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name=_('Birim Fiyat'))
    expiry_date = models.DateField(blank=True, null=True, verbose_name=_('Son Kullanma Tarihi'))
    batch_number = models.CharField(max_length=100, blank=True, null=True, verbose_name=_('Parti No'))
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))

    class Meta:
        verbose_name = _('Mal Kabul Kalemi')
        verbose_name_plural = _('Mal Kabul Kalemleri')
        ordering = ['id']

    def __str__(self) -> str:
        return f'{self.goods_receiving.receiving_number} — {self.stock_item.name}'

    @property
    def accepted_quantity(self):
        """Kabul edilen miktar — ``received_quantity`` alanında saklanır."""
        return self.received_quantity

    @property
    def line_total(self):
        return self.accepted_quantity * self.unit_price


# ──────────────────────────────────────────────────
# 5. Depolar Arası Transfer
# ──────────────────────────────────────────────────
class TransferStatus(models.TextChoices):
    DRAFT = 'DRAFT', _('Taslak')
    PENDING = 'PENDING', _('Onay Bekliyor')
    IN_TRANSIT = 'IN_TRANSIT', _('Transfer Ediliyor')
    COMPLETED = 'COMPLETED', _('Tamamlandı')
    CANCELLED = 'CANCELLED', _('İptal Edildi')


def _generate_tr_number() -> str:
    return f'TR-{uuid.uuid4().hex[:8].upper()}'


class WarehouseTransfer(BaseModel):
    """Depolar arası stok transferi."""

    transfer_number = models.CharField(
        max_length=50, unique=True, default=_generate_tr_number, verbose_name=_('Transfer No'),
    )
    source_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='outgoing_transfers',
        verbose_name=_('Kaynak Depo'),
    )
    target_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='incoming_transfers',
        verbose_name=_('Hedef Depo'),
    )
    status = models.CharField(
        max_length=20,
        choices=TransferStatus.choices,
        default=TransferStatus.DRAFT,
        verbose_name=_('Durum'),
    )
    transfer_date = models.DateField(verbose_name=_('Transfer Tarihi'))
    completed_date = models.DateField(blank=True, null=True, verbose_name=_('Tamamlanma Tarihi'))
    deficiency_report = models.ForeignKey(
        'DeficiencyReport',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers',
        verbose_name=_('Bağlı Eksik Listesi'),
    )
    source_expiry_action = models.ForeignKey(
        'inventory.ExpiryAction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers',
        verbose_name=_('Bağlı SKT Aksiyonu'),
    )
    requested_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='requested_transfers',
        verbose_name=_('Talep Eden'),
    )
    approved_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_transfers',
        verbose_name=_('Onaylayan'),
    )
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))

    class Meta:
        verbose_name = _('Depo Transferi')
        verbose_name_plural = _('Depo Transferleri')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['transfer_number']),
            models.Index(fields=['source_warehouse', 'status']),
            models.Index(fields=['target_warehouse', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.transfer_number}: {self.source_warehouse.code} → {self.target_warehouse.code}'


class WarehouseTransferItem(BaseModel):
    """Transfer kalemi."""

    transfer = models.ForeignKey(
        WarehouseTransfer,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Transfer'),
    )
    stock_item = models.ForeignKey(
        'inventory.StockItem',
        on_delete=models.PROTECT,
        related_name='transfer_items',
        verbose_name=_('Stok Kalemi'),
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=6, verbose_name=_('Transfer Miktarı'))
    unit = models.CharField(max_length=20, verbose_name=_('Birim'))
    received_quantity = models.DecimalField(
        max_digits=12, decimal_places=6, default=0, verbose_name=_('Hedefte Alınan Miktar'),
    )
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))

    class Meta:
        verbose_name = _('Transfer Kalemi')
        verbose_name_plural = _('Transfer Kalemleri')
        ordering = ['id']

    def __str__(self) -> str:
        return f'{self.transfer.transfer_number} — {self.stock_item.name} x {self.quantity}'


# ──────────────────────────────────────────────────
# 6. Stok Sayımı
# ──────────────────────────────────────────────────
class CountingStatus(models.TextChoices):
    DRAFT = 'DRAFT', _('Taslak')
    IN_PROGRESS = 'IN_PROGRESS', _('Sayım Devam Ediyor')
    COMPLETED = 'COMPLETED', _('Tamamlandı')
    APPROVED = 'APPROVED', _('Onaylandı')


class CountingDifferenceReason(models.TextChoices):
    CORRECTION = 'CORRECTION', _('Düzeltme')
    WRONG_MEASUREMENT = 'WRONG_MEASUREMENT', _('Yanlış Ölçüm')
    CANCEL_RETURN = 'CANCEL_RETURN', _('İptal / İade')
    WASTE = 'WASTE', _('Fire / Zayi')
    OTHER = 'OTHER', _('Diğer')


def _generate_sc_number() -> str:
    return f'SC-{uuid.uuid4().hex[:8].upper()}'


class StockCounting(BaseModel):
    """Periyodik stok sayımı."""

    counting_number = models.CharField(
        max_length=50, unique=True, default=_generate_sc_number, verbose_name=_('Sayım No'),
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='stock_countings',
        verbose_name=_('Depo'),
    )
    status = models.CharField(
        max_length=20,
        choices=CountingStatus.choices,
        default=CountingStatus.DRAFT,
        verbose_name=_('Durum'),
    )
    counting_date = models.DateField(verbose_name=_('Sayım Tarihi'))
    counted_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='stock_countings',
        verbose_name=_('Sayan'),
    )
    approved_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_stock_countings',
        verbose_name=_('Onaylayan'),
    )
    approved_at = models.DateTimeField(blank=True, null=True, verbose_name=_('Onay Tarihi'))
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))

    class Meta:
        verbose_name = _('Stok Sayımı')
        verbose_name_plural = _('Stok Sayımları')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['counting_number']),
            models.Index(fields=['warehouse', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.counting_number} — {self.warehouse.code}'


class StockCountingItem(BaseModel):
    """Sayım kalemi — bir stok kaleminin sayım detayı."""

    counting = models.ForeignKey(
        StockCounting,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Sayım'),
    )
    stock_item = models.ForeignKey(
        'inventory.StockItem',
        on_delete=models.PROTECT,
        related_name='counting_items',
        verbose_name=_('Stok Kalemi'),
    )
    system_quantity = models.DecimalField(
        max_digits=12, decimal_places=6, verbose_name=_('Sistem Miktarı'),
    )
    counted_quantity = models.DecimalField(
        max_digits=12, decimal_places=6, verbose_name=_('Sayılan Miktar'),
    )
    difference = models.DecimalField(
        max_digits=12, decimal_places=6, default=0, verbose_name=_('Fark'),
    )
    unit = models.CharField(max_length=20, verbose_name=_('Birim'))
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))
    difference_reason = models.CharField(
        max_length=30,
        choices=CountingDifferenceReason.choices,
        blank=True,
        null=True,
        verbose_name=_('Fark Nedeni'),
    )
    linked_movement = models.ForeignKey(
        'inventory.StockMovement',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='counting_items',
        verbose_name=_('Bağlı Stok Hareketi'),
        help_text=_('Onayda oluşturulan iptal/iade, fire veya düzeltme hareketi.'),
    )

    class Meta:
        verbose_name = _('Sayım Kalemi')
        verbose_name_plural = _('Sayım Kalemleri')
        ordering = ['id']
        unique_together = ('counting', 'stock_item')

    def __str__(self) -> str:
        return f'{self.counting.counting_number} — {self.stock_item.name}: {self.difference:+}'

    def save(self, *args, **kwargs):
        counted = self._coerce_qty_field(self.counted_quantity)
        system = self._coerce_qty_field(self.system_quantity)
        self.counted_quantity = counted
        self.system_quantity = system
        self.difference = counted - system
        super().save(*args, **kwargs)

    @staticmethod
    def _coerce_qty_field(value) -> Decimal:
        if value is None:
            return ZERO_QTY
        if isinstance(value, Decimal):
            return value
        try:
            return Decimal(str(value).strip())
        except (InvalidOperation, ValueError, TypeError):
            return ZERO_QTY


# ──────────────────────────────────────────────────
# 7. Eksik Listesi (Deficiency Report)
# ──────────────────────────────────────────────────
class DeficiencyReportStatus(models.TextChoices):
    DRAFT = 'DRAFT', _('Taslak')
    PENDING = 'PENDING', _('Bekliyor')
    APPROVED = 'APPROVED', _('Onaylandı')
    ORDERED = 'ORDERED', _('Sipariş Verildi')
    PARTIALLY_COMMITTED = 'PARTIALLY_COMMITTED', _('Kısmen İşlendi')
    COMMITTED = 'COMMITTED', _('Tamamlandı / İşlendi')
    CANCELLED = 'CANCELLED', _('İptal Edildi')


def _generate_dr_number() -> str:
    return f'DR-{uuid.uuid4().hex[:8].upper()}'


class DeficiencyReport(BaseModel):
    """Mutfak istasyonlarından gelen malzeme eksik listesi."""

    report_number = models.CharField(
        max_length=50, unique=True, default=_generate_dr_number, verbose_name=_('Rapor No'),
    )
    kitchen_station = models.ForeignKey(
        'branches.KitchenStation',
        on_delete=models.PROTECT,
        related_name='deficiency_reports',
        verbose_name=_('Mutfak İstasyonu'),
    )
    target_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='deficiency_reports',
        verbose_name=_('Hedef Depo (Mutfak Deposu)'),
        help_text=_('Malzemelerin transfer edileceği mutfağa bağlı küçük depo.'),
    )
    status = models.CharField(
        max_length=30,
        choices=DeficiencyReportStatus.choices,
        default=DeficiencyReportStatus.PENDING,
        verbose_name=_('Durum'),
    )
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_deficiency_reports',
        verbose_name=_('Oluşturan'),
    )
    approved_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_deficiency_reports',
        verbose_name=_('Onaylayan'),
    )
    approved_at = models.DateTimeField(blank=True, null=True, verbose_name=_('Onay Tarihi'))

    class Meta:
        verbose_name = _('Eksik Listesi')
        verbose_name_plural = _('Eksik Listeleri')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['report_number']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['kitchen_station', 'status']),
        ]

    def __str__(self) -> str:
        return f'{self.report_number} — {self.kitchen_station.name}'


class DeficiencyReportItem(BaseModel):
    """Eksik listesi kalemi."""

    report = models.ForeignKey(
        DeficiencyReport,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Eksik Listesi'),
    )
    stock_item = models.ForeignKey(
        'inventory.StockItem',
        on_delete=models.PROTECT,
        related_name='deficiency_items',
        verbose_name=_('Stok Kalemi'),
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=6, verbose_name=_('İstenen Miktar'))
    unit = models.CharField(max_length=20, verbose_name=_('Birim'))
    notes = models.TextField(blank=True, null=True, verbose_name=_('Notlar'))

    class Meta:
        verbose_name = _('Eksik Listesi Kalemi')
        verbose_name_plural = _('Eksik Listesi Kalemleri')
        ordering = ['id']

    def __str__(self) -> str:
        return f'{self.report.report_number} — {self.stock_item.name} x {self.quantity}'
