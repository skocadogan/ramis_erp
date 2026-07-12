from django.db import models
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel
from apps.branches.models import Branch, KitchenStation
from apps.users.models import User

class PrepStatus(models.TextChoices):
    PENDING = 'PENDING', _('Bekliyor')
    IN_PROGRESS = 'IN_PROGRESS', _('Hazırlanıyor')
    COMPLETED = 'COMPLETED', _('Tamamlandı')
    CANCELLED = 'CANCELLED', _('İptal Edildi')

class PrepTask(BaseModel):
    """Mutfak hazırlık görevleri."""
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='prep_tasks')
    station = models.ForeignKey(
        KitchenStation, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='prep_tasks',
        verbose_name=_('Mutfak İstasyonu')
    )
    
    title = models.CharField(max_length=200, verbose_name=_('Görev Başlığı'))
    description = models.TextField(blank=True, null=True, verbose_name=_('Açıklama'))
    
    target_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1.0)
    completed_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    unit = models.CharField(max_length=50, blank=True, null=True, verbose_name=_('Birim'))
    
    status = models.CharField(
        max_length=20, 
        choices=PrepStatus.choices, 
        default=PrepStatus.PENDING,
        db_index=True
    )
    
    priority = models.PositiveIntegerField(default=1, verbose_name=_('Öncelik'))
    deadline = models.DateTimeField(null=True, blank=True, verbose_name=_('Son Tamamlanma Zamanı'))
    
    assigned_to = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='assigned_prep_tasks'
    )
    completed_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='completed_prep_tasks'
    )
    
    is_recurring = models.BooleanField(default=False, verbose_name=_('Tekrarlayan Görev'))

    source_template = models.ForeignKey(
        'PrepTemplate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generated_tasks',
        verbose_name=_('Kaynak şablon'),
        help_text=_('Şablondan otomatik oluşturulduysa bağlantı; aynı gün tekrar üretimi engellemek için kullanılır.'),
    )

    product = models.ForeignKey(
        'menu.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='prep_tasks',
        verbose_name=_('Ürün'),
        help_text=_('Bu hazırlık görevinin bağlı olduğu ürün. PrepTemplate üzerinden otomatik atanır.'),
    )

    plan_line = models.ForeignKey(
        'production_planning.ProductionPlanLine',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='prep_tasks',
        verbose_name=_('Üretim Planı Satırı'),
        help_text=_('Bu görevin bağlı olduğu üretim planı satırı. Plan onaylandığında otomatik atanır.'),
    )

    scheduled_start = models.DateTimeField(
        null=True, blank=True, verbose_name=_('Planlanan Başlangıç'),
        help_text=_('Görevin planlanan başlangıç zamanı'),
    )

    class Meta:
        ordering = ['-priority', 'created_at']
        verbose_name = _('Hazırlık Görevi')
        verbose_name_plural = _('Hazırlık Görevleri')

    def __str__(self):
        return f"{self.title} - {self.status}"


class PrepTaskAssignment(BaseModel):
    """
    Çoklu kullanıcı ataması için ara model (PrepTask M2M User).

    - user doluysa → sistem kullanıcısına atama
    - user boş, display_name doluysa → manuel isim girişi (sisteme kayıtlı olmayan kişi)
    """
    prep_task = models.ForeignKey(
        PrepTask,
        on_delete=models.CASCADE,
        related_name='assignments',
        verbose_name=_('Hazırlık Görevi'),
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='prep_task_assignments',
        verbose_name=_('Kullanıcı'),
    )
    display_name = models.CharField(
        max_length=200,
        blank=True,
        default='',
        verbose_name=_('Görünen İsim'),
        help_text=_('Sisteme kayıtlı olmayan kişiler için manuel isim girişi'),
    )

    class Meta:
        verbose_name = _('Görev Ataması')
        verbose_name_plural = _('Görev Atamaları')
        indexes = [
            models.Index(fields=['prep_task', 'user']),
        ]

    def __str__(self):
        if self.user:
            return f'{self.prep_task.title} → {self.user.get_full_name() or self.user.username}'
        return f'{self.prep_task.title} → {self.display_name or "—"}'

class PrepTemplate(BaseModel):
    """Hazırlık şablonları (Tekrarlayan görevler için)"""
    branch = models.ForeignKey('branches.Branch', on_delete=models.CASCADE, related_name='prep_templates')
    station = models.ForeignKey('branches.KitchenStation', on_delete=models.SET_NULL, null=True, blank=True)
    
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    
    target_quantity = models.DecimalField(max_digits=10, decimal_places=3)
    unit = models.CharField(max_length=50, null=True, blank=True)
    
    # Zamanlama ayarları
    every_monday = models.BooleanField(default=True)
    every_tuesday = models.BooleanField(default=True)
    every_wednesday = models.BooleanField(default=True)
    every_thursday = models.BooleanField(default=True)
    every_friday = models.BooleanField(default=True)
    every_saturday = models.BooleanField(default=True)
    every_sunday = models.BooleanField(default=True)
    
    activation_time = models.TimeField(help_text=_("Görevin her gün saat kaçta oluşturulacağı"))
    
    is_enabled = models.BooleanField(default=True, verbose_name=_("Şablon Etkin"))

    # Atama: null → herkese, dolu → sadece belirtilen kullanıcıya
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_prep_templates',
        verbose_name=_('Atanan Kişi'),
        help_text=_('Boş bırakılırsa herkese atanır.'),
    )

    # Sisteme kayıtlı olmayan kişiler için manuel isim girişi
    display_name = models.CharField(
        max_length=200,
        blank=True,
        default='',
        verbose_name=_('Görünen İsim'),
        help_text=_('Sisteme kayıtlı olmayan kişiler için manuel isim girişi. assigned_to ile birlikte kullanılmaz.'),
    )

    product = models.ForeignKey(
        'menu.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='prep_templates',
        verbose_name=_('Ürün'),
        help_text=_('Bu şablonun bağlı olduğu ürün. Yeni görev oluşturulurken PrepTask.product\'a kopyalanır.'),
    )

    class Meta:
        verbose_name = _("Hazırlık Şablonu")
        verbose_name_plural = _("Hazırlık Şablonları")

class PrepSmartRule(BaseModel):
    """Akıllı hazırlık kuralları (Satış tahminine dayalı)"""
    branch = models.ForeignKey('branches.Branch', on_delete=models.CASCADE, related_name='prep_smart_rules')
    
    title = models.CharField(max_length=255, verbose_name=_("Kural Adı"))
    
    # Baz alınacak ürün (örneğin Burger)
    base_product = models.ForeignKey('menu.Product', on_delete=models.CASCADE, related_name='prep_rules')
    
    # Hazırlanacak hedef (örneğin Köfte - Bu bir metin veya başka bir model olabilir, şimdilik metin tutalım)
    target_item = models.CharField(max_length=255, verbose_name=_("Hazırlanacak Malzeme"))
    
    # Oran (1 Burger için 1.2 adet köfte gibi)
    ratio = models.DecimalField(max_digits=10, decimal_places=3, default=1.0)
    
    unit = models.CharField(max_length=50, null=True, blank=True)
    
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = _("Akıllı Hazırlık Kuralı")
        verbose_name_plural = _("Akıllı Hazırlık Kuralları")

    def __str__(self):
        return f"{self.title}: {self.base_product.name} -> {self.target_item}"


class PrepBranchSettings(BaseModel):
    """Şube bazlı hazırlık modülü ayarları (yönetim ekranı davranışı vb.)."""

    branch = models.OneToOneField(
        Branch,
        on_delete=models.CASCADE,
        related_name="prep_branch_settings",
        verbose_name=_("Şube"),
    )
    management_hide_old_completed = models.BooleanField(
        default=False,
        verbose_name=_("Yönetimde eski tamamlananları gizle"),
        help_text=_(
            "Açıkken hazırlık yönetimi görev listesi operasyon modunda davranır: "
            "önceki gün oluşturulmuş tamamlanan görevler listelenmez."
        ),
    )

    class Meta:
        verbose_name = _("Hazırlık şube ayarı")
        verbose_name_plural = _("Hazırlık şube ayarları")

    def __str__(self):
        return f"PrepSettings {self.branch_id}"
