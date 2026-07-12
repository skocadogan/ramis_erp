import os
import uuid
from decimal import Decimal
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver
from core.models import BaseModel

def product_image_path(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return f"products/{uuid.uuid4()}.{ext}"

class MenuTag(BaseModel):
    """Menü ürünü ve kategorileri için şubeye özel etiket (#yaz_menusu vb.)."""
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='menu_tags',
        verbose_name=_('Şube'),
    )
    name = models.CharField(max_length=100, verbose_name=_('Etiket Adı'))

    class Meta:
        ordering = ['name']
        verbose_name = _('Menü Etiketi')
        verbose_name_plural = _('Menü Etiketleri')
        constraints = [
            models.UniqueConstraint(fields=['branch', 'name'], name='menu_menutag_branch_name_uniq'),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        raw = (self.name or '').strip()
        if raw and not raw.startswith('#'):
            raw = f'#{raw}'
        self.name = raw
        super().save(*args, **kwargs)


class MenuCatalogSettings(BaseModel):
    """Şube bazlı aktif menü etiket filtresi."""
    branch = models.OneToOneField(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='menu_catalog_settings',
        verbose_name=_('Şube'),
    )
    active_tag = models.ForeignKey(
        MenuTag,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name=_('Aktif Etiket'),
    )
    filter_untagged = models.BooleanField(
        default=False,
        verbose_name=_('Etiketsiz filtresi'),
        help_text=_('True ise yalnızca etiketsiz ürün ve kategoriler gösterilir.'),
    )

    class Meta:
        verbose_name = _('Menü Katalog Ayarı')
        verbose_name_plural = _('Menü Katalog Ayarları')

    def __str__(self):
        if self.filter_untagged:
            return _('Etiketsiz')
        if self.active_tag_id:
            return str(self.active_tag)
        return _('Filtre yok')


class Category(BaseModel):
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        verbose_name=_('Üst Kategori'),
    )
    order = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=20, default='#3b82f6', blank=True)
    station = models.ForeignKey(
        'branches.KitchenStation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='categories',
        verbose_name=_('Mutfak İstasyonu'),
        help_text=_('Bu kategorideki ürünlerin hazırlanacağı mutfak istasyonu.'),
    )
    tags = models.ManyToManyField(
        MenuTag,
        blank=True,
        related_name='categories',
        verbose_name=_('Etiketler'),
    )

    class Meta:
        ordering = ['parent_id', 'order', 'name']
        verbose_name = _('Kategori')
        verbose_name_plural = _('Kategoriler')

    def __str__(self):
        return self.name

class Product(BaseModel):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='products')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    base_price = models.DecimalField(max_digits=12, decimal_places=4)
    gross_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name=_('Brüt Fiyat (KDV hariç)'),
        help_text=_('Vergi hariç birim fiyat; net satış ile birlikte saklanır.'),
    )
    tax_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        verbose_name=_('Vergi Oranı (%)'),
        help_text=_('KDV / satış vergisi yüzdesi (örn. 20).'),
    )
    discount_rate = models.DecimalField(
        max_digits=6,
        decimal_places=3,
        default=0,
        verbose_name=_('İndirim Oranı (%)'),
        help_text=_('0–100 arasında yüzdelik indirim oranı. 0 = indirim yok.'),
    )
    discounted_price_cached = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        verbose_name=_('İndirimli Fiyat (Cache)'),
        help_text=_('Sık hesaplamaları önlemek için kaydedilen indirimli fiyat.'),
    )
    image = models.ImageField(upload_to=product_image_path, blank=True, null=True)
    order = models.PositiveIntegerField(default=0)
    calories = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name=_('Kalori (kCal)'),
        help_text=_('Porsiyon başına enerji değeri (kCal).'),
    )
    show_on_pos = models.BooleanField(
        default=True,
        verbose_name=_("POS'ta göster"),
        help_text=_("Kapalıysa ürün POS satış ekranında listelenmez."),
    )
    is_show_on_menu = models.BooleanField(
        default=True,
        verbose_name=_("Menüde Göster"),
        help_text=_("Kapalıysa ürün menüden kaldırılır ancak sistemde silinmiş sayılmaz."),
    )
    is_featured = models.BooleanField(
        default=False,
        verbose_name=_("Öne Çıkar"),
        help_text=_("İşaretlenirse ürün POS ekranında en üstte 'Öne Çıkanlar' kategorisinde gösterilir."),
    )
    is_popular = models.BooleanField(
        default=False,
        verbose_name=_("Popüler"),
        help_text=_("İşaretlenirse ürün dijital menüde 'Popüler' etiketiyle gösterilir."),
    )
    is_chef_recommendation = models.BooleanField(
        default=False,
        verbose_name=_("Şefin Önerisi"),
        help_text=_("İşaretlenirse ürün dijital menüde 'Şefin Önerisi' etiketiyle gösterilir."),
    )
    is_combined = models.BooleanField(
        default=False,
        verbose_name=_("Birleşik Ürün"),
        help_text=_("Birden fazla ürünün birleştirilmesiyle oluşan paket ürün."),
    )
    branches = models.ManyToManyField(
        'branches.Branch',
        blank=True,
        related_name='products',
        verbose_name=_('Satışa Sunulacak Şubeler')
    )
    tags = models.ManyToManyField(
        MenuTag,
        blank=True,
        related_name='products',
        verbose_name=_('Etiketler'),
    )

    class Meta:
        ordering = ['order', 'name']
        verbose_name = _('Ürün')
        verbose_name_plural = _('Ürünler')
        indexes = [
            models.Index(fields=['is_active']),
            models.Index(fields=['is_active', 'show_on_pos']),  # POS listesinin temel filtresi
            models.Index(fields=['category', 'order']),
            models.Index(fields=['name']),                       # arama
        ]

    def __str__(self):
        return self.name

    def align_gross_from_net(self):
        """Kayıtlı vergi oranına göre brüt fiyatı net satış (base_price) üzerinden günceller."""
        from decimal import Decimal
        tax = self.tax_rate if self.tax_rate is not None else Decimal('0')
        bp = self.base_price
        denom = Decimal('1') + (Decimal(str(tax)) / Decimal('100'))
        if denom <= 0:
            self.gross_price = bp.quantize(Decimal('0.01'))
        else:
            self.gross_price = (bp / denom).quantize(Decimal('0.01'))

    def update_discounted_price_cache(self):
        """İndirim oranına göre indirimli fiyatı hesaplayıp cache alanına yazar."""
        from decimal import Decimal
        if not self.has_discount:
            self.discounted_price_cached = self.base_price
        else:
            factor = Decimal('1') - (Decimal(str(self.discount_rate)) / Decimal('100'))
            self.discounted_price_cached = (self.base_price * factor).quantize(Decimal('0.0001'))

    def save(self, *args, **kwargs):
        update_fields = kwargs.get('update_fields')
        if update_fields is None:
            self.align_gross_from_net()
            self.update_discounted_price_cache()
        else:
            fields = set(update_fields)
            if any(f in fields for f in ('base_price', 'tax_rate')):
                self.align_gross_from_net()
                fields.add('gross_price')
            if any(f in fields for f in ('base_price', 'discount_rate')):
                self.update_discounted_price_cache()
                fields.add('discounted_price_cached')
            kwargs['update_fields'] = list(dict.fromkeys(list(fields)))
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Ürün silindiğinde reçetesini boşa çıkart (soft veya hard delete fark etmeksizin)
        if hasattr(self, 'recipe') and self.recipe is not None:
            self.recipe.product = None
            self.recipe.save(update_fields=['product', 'updated_at'])
        return super().delete(*args, **kwargs)


    @property
    def has_discount(self) -> bool:
        return bool(self.discount_rate and self.discount_rate > 0)

    @property
    def discounted_price(self):
        """İndirim uygulanmış fiyat (cached alandan)."""
        return self.discounted_price_cached

@receiver(post_delete, sender=Product)
def delete_product_image_on_delete(sender, instance, **kwargs):
    if instance.image:
        if os.path.isfile(instance.image.path):
            os.remove(instance.image.path)

@receiver(pre_save, sender=Product)
def delete_old_product_image_on_change(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old_image = Product.objects.get(pk=instance.pk).image
    except Product.DoesNotExist:
        return

    new_image = instance.image
    if old_image and old_image != new_image:
        if os.path.isfile(old_image.path):
            os.remove(old_image.path)

class ProductVariant(BaseModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    name = models.CharField(max_length=100) # e.g. "Small", "Large"
    price_adjustment = models.DecimalField(max_digits=12, decimal_places=4, default=0.00)

    def __str__(self):
        return f"{self.product.name} - {self.name}"

class ModifierGroup(BaseModel):
    name = models.CharField(max_length=150) # e.g. "Cheese Extras", "Milk Choices"
    is_multiple = models.BooleanField(default=False)
    is_required = models.BooleanField(default=False)
    products = models.ManyToManyField(Product, blank=True, related_name='modifier_groups')

    class Meta:
        # Pagination (DRF) + admin panel + tüm queryset kullanımları için tutarlı sıralama.
        # ordering tanımsız queryset'lerde UnorderedObjectListWarning + tutarsız sayfalama olur.
        ordering = ['name']

    def __str__(self):
        return self.name

class Modifier(BaseModel):
    group = models.ForeignKey(ModifierGroup, on_delete=models.CASCADE, related_name='modifiers')
    name = models.CharField(max_length=150) # e.g. "Extra Cheddar", "Oat Milk"
    price_adjustment = models.DecimalField(max_digits=12, decimal_places=4, default=0.00)

    class Meta:
        # ModifierGroup içindeki seçenekler de sayfalama/listeleme için sıralı olmalı.
        ordering = ['name']

    def __str__(self):
        return f"{self.group.name}: {self.name}"

class ProductUnit(BaseModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='units')
    name = models.CharField(max_length=100, verbose_name='Birim Adı')
    multiplier = models.DecimalField(
        max_digits=10, 
        decimal_places=4, 
        default=1.00,
        verbose_name=_('Fiyat Çarpanı'),
        help_text=_('Ürün ana fiyatı ile çarpılır (örn: 1.50). Özel fiyat girildiyse dikkate alınmaz.')
    )
    price_override = models.DecimalField(
        max_digits=12, 
        decimal_places=4, 
        null=True, 
        blank=True,
        verbose_name=_('Özel Fiyat'),
        help_text=_('Birim için sabit fiyat. Girilirse çarpan hesabı yerine bu fiyat kullanılır.')
    )
    order = models.PositiveIntegerField(default=0, verbose_name='Sıralama')

    class Meta:
        ordering = ['order', 'name']
        verbose_name = _('Ürün Birimi')
        verbose_name_plural = _('Ürün Birimleri')

    def __str__(self):
        return f"{self.product.name} - {self.name}"

    @property
    def calculated_price(self):
        """Birim için net satış fiyatı."""
        if self.price_override is not None:
            return self.price_override
        from decimal import Decimal
        return (self.product.base_price * Decimal(str(self.multiplier))).quantize(Decimal('0.0001'))

class CombinedProductItem(BaseModel):
    """Birleşik ürünü oluşturan alt ürünler."""
    parent_product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE, 
        related_name='combined_items',
        verbose_name=_("Birleşik Ürün")
    )
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE, 
        related_name='used_in_combined',
        verbose_name=_("Alt Ürün")
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("1"),
        verbose_name=_("Miktar"),
    )
    product_unit = models.ForeignKey(
        ProductUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='combined_usages',
        verbose_name=_('Satış Birimi'),
        help_text=_('Alt ürünün satış birimi (örn. tam / yarım porsiyon). Boş bırakılırsa çarpan 1 kabul edilir.'),
    )

    class Meta:
        verbose_name = _("Birleşik Ürün Kalemi")
        verbose_name_plural = _("Birleşik Ürün Kalemleri")

    def __str__(self):
        unit = f" ({self.product_unit.name})" if self.product_unit_id else ""
        return f"{self.quantity}x {self.product.name}{unit} ({self.parent_product.name})"


class ProductRecommendation(BaseModel):
    """Menü ürünü için yanında önerilen ürünler (ör. bonfile → şarap)."""
    source_product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='recommendations',
        verbose_name=_('Kaynak Ürün'),
    )
    recommended_product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='recommended_for_sources',
        verbose_name=_('Önerilen Ürün'),
    )
    product_unit = models.ForeignKey(
        ProductUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recommendation_usages',
        verbose_name=_('Satış Birimi'),
        help_text=_('Boş bırakılırsa standart birim (ana fiyat) kullanılır.'),
    )
    order = models.PositiveIntegerField(default=0, verbose_name=_('Sıra'))

    class Meta:
        verbose_name = _('Ürün Önerisi')
        verbose_name_plural = _('Ürün Önerileri')
        ordering = ['order', 'created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['source_product', 'recommended_product'],
                name='menu_productrecommendation_unique_source_recommended',
            ),
        ]

    def __str__(self):
        unit = f" ({self.product_unit.name})" if self.product_unit_id else ""
        return f"{self.source_product.name} → {self.recommended_product.name}{unit}"
