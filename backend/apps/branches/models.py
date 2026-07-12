from django.db import models
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel


class KitchenStation(BaseModel):
    """
    Fiziksel bir mutfak istasyonunu temsil eder (Ana Mutfak, Bar, Pastane vb.)
    Her şubenin birden fazla istasyonu olabilir. Ürün kategorileri bu istasyonlara bağlanarak
    sipariş kalemleri doğru KDS ekranına yönlendirilir.
    """
    branch = models.ForeignKey(
        'Branch',
        on_delete=models.CASCADE,
        related_name='stations',
        verbose_name=_('Şube')
    )
    name = models.CharField(max_length=100, verbose_name=_('İstasyon Adı'))  # "Bar", "Pastane"
    code = models.SlugField(max_length=50, verbose_name=_('Kod'))              # "bar", "pastane"
    color = models.CharField(max_length=20, default='#6366f1', blank=True, verbose_name=_('Renk'))
    description = models.TextField(blank=True, default='', verbose_name=_('Açıklama'))
    warehouse = models.ForeignKey(
        'warehouse.Warehouse',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='kitchen_stations',
        verbose_name=_('Depo')
    )
    smart_firing_extra_buffer_minutes = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        verbose_name=_('Smart Firing ek buffer (dk)'),
        help_text=_('Smart Firing v2 açıkken bu istasyon için lead time’a eklenecek ek dakika; boş ise yalnızca kuyruk formülü uygulanır.'),
    )

    class Meta:
        unique_together = [('branch', 'code')]
        ordering = ['branch', 'name']
        verbose_name = _('Mutfak İstasyonu')
        verbose_name_plural = _('Mutfak İstasyonları')

    def __str__(self):
        return f"{self.branch.name} — {self.name}"

class Branch(BaseModel):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    address = models.TextField(blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True, verbose_name=_('E-posta'))
    website = models.URLField(blank=True, null=True, verbose_name=_('Web adresi'))
    tax_office = models.CharField(max_length=200, blank=True, null=True, verbose_name=_('Vergi Dairesi'))
    tax_number = models.CharField(max_length=50, blank=True, null=True, verbose_name=_('Vergi No'))
    registry_no = models.CharField(max_length=50, blank=True, null=True, verbose_name=_('Sicil No'))
    mersis_no = models.CharField(max_length=50, blank=True, null=True, verbose_name=_('Mersis No'))
    logo = models.ImageField(upload_to='branch_logos/', blank=True, null=True, verbose_name=_('Şube Logosu'))
    table_cleaning_duration_minutes = models.PositiveSmallIntegerField(
        default=5,
        verbose_name=_('Masa temizlik süresi (dk)'),
        help_text=_('Ödeme sonrası masa Temizleniyor durumunda kalacağı dakika.'),
    )
    currency = models.CharField(max_length=3, default='TRY', verbose_name=_('Para birimi'))
    tax_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        verbose_name=_('Vergi oranı (%)'),
    )
    invoice_prefix = models.CharField(
        max_length=10, blank=True, default='',
        verbose_name=_('Fatura ön eki'),
    )
    members = models.ManyToManyField(
        'users.User',
        blank=True,
        related_name='branches',
        verbose_name=_('Şube Üyeleri')
    )

    class Meta:
        verbose_name = _('Şube')
        verbose_name_plural = _('Şubeler')

    def __str__(self):
        return f"{self.name} ({self.code})"

class Zone(BaseModel):
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='zones')
    name = models.CharField(max_length=100) # e.g. "Terrace", "Main Hall"
    description = models.TextField(blank=True, null=True)
    color = models.CharField(max_length=20, default='#f8fafc', blank=True)
    is_takeaway = models.BooleanField(default=False, verbose_name=_('Paket Bölgesi'))
    sort_order = models.PositiveIntegerField(default=0)
    
    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = _('Bölge')
        verbose_name_plural = _('Bölgeler')
        indexes = [
            models.Index(fields=["branch", "is_active"], name="zone_branch_active_idx"),
            models.Index(fields=["is_takeaway"], name="zone_takeaway_idx"),
        ]

    def __str__(self):
        return f"{self.name} - {self.branch.name}"

class TableSize(models.TextChoices):
    SMALL       = "SMALL",       _("Küçük (1-2 Kişi)")
    MEDIUM      = "MEDIUM",      _("Orta (3-4 Kişi)")
    LARGE       = "LARGE",       _("Büyük (5-8 Kişi)")
    EXTRA_LARGE = "EXTRA_LARGE", _("Çok Büyük (8+ Kişi)")

class TableShape(models.TextChoices):
    ROUND     = "ROUND",     _("Yuvarlak")
    SQUARE    = "SQUARE",    _("Kare")
    RECTANGLE = "RECTANGLE", _("Dikdörtgen")

class TableStatus(models.TextChoices):
    FREE             = "FREE",             _("Boş")
    OCCUPIED         = "OCCUPIED",         _("Dolu")
    RESERVED         = "RESERVED",         _("Rezerve")
    CLEANING         = "CLEANING",         _("Temizleniyor")
    OUT_OF_SERVICE   = "OUT_OF_SERVICE",   _("Hizmet Dışı")

class Table(BaseModel):
    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name='tables')
    name = models.CharField(max_length=50) # e.g. "T1", "B2"
    table_number = models.PositiveSmallIntegerField(default=1)
    capacity = models.PositiveIntegerField(default=4)
    min_capacity = models.PositiveSmallIntegerField(default=1)
    
    size = models.CharField(max_length=20, choices=TableSize.choices, default=TableSize.MEDIUM)
    shape = models.CharField(max_length=20, choices=TableShape.choices, default=TableShape.SQUARE)
    
    position_x = models.PositiveSmallIntegerField(default=0)
    position_y = models.PositiveSmallIntegerField(default=0)
    
    status = models.CharField(
        max_length=20,
        choices=TableStatus.choices,
        default=TableStatus.FREE
    )
    reservation_info = models.TextField(
        blank=True,
        default='',
        verbose_name=_('Rezervasyon bilgisi'),
        help_text=_('Kime / iletişim / not (yalnızca rezerve masalar için)'),
    )
    reservation_scheduled_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Rezervasyon saati'),
        help_text=_('Planlanan geliş saati (isteğe bağlı)'),
    )
    reservation_party_size = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        verbose_name=_('Rezervasyon kişi sayısı'),
    )
    notes = models.TextField(blank=True, null=True)
    cleaning_started_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Temizlik başlangıcı'),
    )
    
    class Meta:
        ordering = ['zone__name', 'table_number']
        verbose_name = _('Masa')
        verbose_name_plural = _('Masalar')
        indexes = [
            # Masa listeleme: zone + status + is_active — en kritik composite index
            # branch filtrelemesi zone__branch üzerinden JOIN ile yapılır;
            # zone index ile birlikte optimize edilir.
            models.Index(
                fields=["zone", "status", "is_active"],
                name="table_zone_status_active_idx",
            ),
            # status bazlı zone filtreleme (garson/POS masa durum sorguları)
            models.Index(
                fields=["status", "zone"],
                name="table_status_zone_idx",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.zone.name})"


class WaiterBranchAssignment(BaseModel):
    """
    Garsonun şube bazlı hizmet alanı: zone + masa birleşimi (M2M).
    (user, branch) tekil; takeaway zone/masa API doğrulamasında elenir.
    """

    user = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="waiter_branch_assignments",
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="waiter_branch_assignments",
    )
    zones = models.ManyToManyField(Zone, blank=True, related_name="waiter_assignments_by_zone")
    tables = models.ManyToManyField(Table, blank=True, related_name="waiter_assignments_by_table")

    class Meta:
        unique_together = [("user", "branch")]
        verbose_name = _("Garson şube ataması")
        verbose_name_plural = _("Garson şube atamaları")

    def __str__(self):
        return f"{self.user} @ {self.branch}"


class CookStationAssignment(BaseModel):
    """
    Aşçının (kullanıcı) şube bazlı mutfak istasyonu atamaları.
    (user, branch) tekil. KDS ekranında hangi istasyonlara erişebileceğini belirler.
    """
    user = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="cook_station_assignments",
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="cook_station_assignments",
    )
    stations = models.ManyToManyField(
        KitchenStation,
        blank=True,
        related_name="cook_assignments"
    )

    class Meta:
        unique_together = [("user", "branch")]
        verbose_name = _("Aşçı istasyon ataması")
        verbose_name_plural = _("Aşçı istasyon atamaları")

    def __str__(self):
        return f"{self.user} @ {self.branch}"

class ManagerBranchAssignment(BaseModel):
    """
    Kullanıcının yönetici / sorumlu olduğu şubeler.
    Aşçı ve garson atamalarından farklı olarak, şubenin tamamına erişim yetkisi verir.
    (user, branch) tekil.
    """
    user = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="manager_branch_assignments",
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="manager_branch_assignments",
    )

    class Meta:
        unique_together = [("user", "branch")]
        verbose_name = _("Müdür şube ataması")
        verbose_name_plural = _("Müdür şube atamaları")

    def __str__(self):
        return f"{self.user} @ {self.branch} (Müdür)"

class BranchOrderCounter(BaseModel):
    """
    Şube bazlı, günlük sıfırlanan sipariş numarası sayacı.
    Race condition önlemek için select_for_update ile kullanılır.
    """
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='order_counters')
    date = models.DateField()
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = [('branch', 'date')]
        verbose_name = _('Şube Sipariş Sayacı')
        verbose_name_plural = _('Şube Sipariş Sayaçları')

    def __str__(self):
        return f"{self.branch.name} - {self.date}: {self.last_number}"


class BranchTarget(BaseModel):
    """
    Şube bazlı aylık ciro hedefleri.
    Dashboard üzerinde ilerleme çubuğu (progress bar) için kullanılır.
    """
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='targets',
        verbose_name=_('Şube')
    )
    month = models.PositiveSmallIntegerField(verbose_name=_('Ay (1-12)'))
    year = models.PositiveIntegerField(verbose_name=_('Yıl'))
    target_revenue = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        verbose_name=_('Hedef Ciro')
    )

    class Meta:
        unique_together = [('branch', 'month', 'year')]
        ordering = ['-year', '-month', 'branch']
        verbose_name = _('Şube Hedefi')
        verbose_name_plural = _('Şube Hedefleri')

    def __str__(self):
        return f"{self.branch.name} - {self.month}/{self.year}: {self.target_revenue}"
