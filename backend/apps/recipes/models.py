from decimal import Decimal

from core.decimal_constants import ZERO_MONEY
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel


class RecipeCategory(BaseModel):
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
        verbose_name = _('Reçete Kategorisi')
        verbose_name_plural = _('Reçete Kategorileri')
        ordering = ['name']

    def __str__(self):
        return f"{self.code} - {self.name}"


class Recipe(BaseModel):
    """Bir menü ürününe ait reçete (tarif)."""

    product = models.OneToOneField(
        'menu.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recipe',
        verbose_name=_('Ürün'),
    )
    category = models.ForeignKey(
        RecipeCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recipes',
        verbose_name=_('Kategori')
    )
    name = models.CharField(max_length=200, verbose_name=_('Reçete Adı'))
    description = models.TextField(blank=True, null=True, verbose_name=_('Açıklama'))
    servings = models.PositiveIntegerField(default=1, verbose_name=_('Porsiyon Sayısı'))
    serving_quantity = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True, verbose_name=_('Porsiyon Miktarı/Ağırlığı'),
        help_text=_('Örn: 250.000')
    )
    serving_unit = models.CharField(
        max_length=20, null=True, blank=True, verbose_name=_('Porsiyon Birimi'),
        help_text=_('Örn: g, ml')
    )
    prep_time_minutes = models.PositiveIntegerField(
        default=0, verbose_name=_('Hazırlık Süresi (dk)'),
    )
    cook_time_minutes = models.PositiveIntegerField(
        default=0, verbose_name=_('Pişirme Süresi (dk)'),
    )
    prep_time_per_serving = models.PositiveIntegerField(
        default=0, verbose_name=_('Porsiyon Başına Hazırlık (dk)'),
    )
    cook_time_per_serving = models.PositiveIntegerField(
        default=0, verbose_name=_('Porsiyon Başına Pişirme (dk)'),
    )
    instructions = models.TextField(blank=True, null=True, verbose_name=_('Hazırlanış Talimatları'))
    branches = models.ManyToManyField(
        'branches.Branch',
        blank=True,
        related_name='recipes',
        verbose_name=_('Kullanılacak Şubeler')
    )
    is_allergenic = models.BooleanField(
        default=False,
        verbose_name=_('Alerjen İçerir'),
        help_text=_('Malzemelerden otomatik hesaplanır.'),
    )
    allergens = models.ManyToManyField(
        'inventory.Allergen',
        blank=True,
        related_name='recipes',
        verbose_name=_('İçerdiği Alerjen Maddeler'),
    )

    class Meta:
        ordering = ['name']
        verbose_name = _('Reçete')
        verbose_name_plural = _('Reçeteler')

    def __str__(self) -> str:
        return f'{self.name} ({self.product.name})'

    @property
    def total_cost(self):
        """Reçetenin toplam maliyetini hesaplar (alt reçeteler dahil)."""
        from .recipe_expansion import compute_recipe_total_cost

        return compute_recipe_total_cost(self)

    @property
    def total_yield_normalized(self):
        """Toplam reçete çıktısı (serving_quantity × servings)."""
        from .recipe_expansion import recipe_total_yield_normalized

        return recipe_total_yield_normalized(self)

    @property
    def cost_per_serving(self):
        """Porsiyon başına maliyet."""
        if self.servings == 0:
            return 0
        return self.total_cost / self.servings


class RecipeIngredient(BaseModel):
    """Reçeteye ait bir malzeme (stok kalemi veya yarı mamül alt reçete)."""

    recipe = models.ForeignKey(
        Recipe,
        on_delete=models.CASCADE,
        related_name='ingredients',
        verbose_name=_('Reçete'),
    )
    stock_item = models.ForeignKey(
        'inventory.StockItem',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='recipe_ingredients',
        verbose_name=_('Stok Kalemi'),
    )
    sub_recipe = models.ForeignKey(
        Recipe,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='used_in_ingredients',
        verbose_name=_('Alt Reçete (Yarı Mamül)'),
    )
    quantity = models.DecimalField(
        max_digits=12, decimal_places=6, verbose_name=_('Miktar'),
    )
    unit = models.CharField(max_length=20, verbose_name=_('Birim'))
    normalized_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=6,
        verbose_name=_('Stok birimine göre miktar'),
        help_text=_(
            'Maliyet için stok kalemi birimine normalize edilmiş miktar (envanter birim dönüşümü ile).'
        ),
    )
    notes = models.CharField(
        max_length=255, blank=True, null=True, verbose_name=_('Notlar'),
    )

    class Meta:
        ordering = ['recipe', 'stock_item']
        verbose_name = _('Reçete Malzemesi')
        verbose_name_plural = _('Reçete Malzemeleri')
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(stock_item__isnull=False, sub_recipe__isnull=True)
                    | models.Q(stock_item__isnull=True, sub_recipe__isnull=False)
                ),
                name='recipe_ingredient_xor_stock_or_sub',
            ),
            models.UniqueConstraint(
                fields=['recipe', 'stock_item'],
                condition=models.Q(stock_item__isnull=False),
                name='unique_recipe_stock_item',
            ),
            models.UniqueConstraint(
                fields=['recipe', 'sub_recipe'],
                condition=models.Q(sub_recipe__isnull=False),
                name='unique_recipe_sub_recipe',
            ),
        ]

    def __str__(self) -> str:
        if self.sub_recipe_id:
            return f'{self.quantity} {self.unit} {self.sub_recipe.name}'
        return f'{self.quantity} {self.unit} {self.stock_item.name}'

    def clean(self):
        super().clean()
        has_stock = bool(self.stock_item_id)
        has_sub = bool(self.sub_recipe_id)
        if has_stock == has_sub:
            raise ValidationError(
                _('Malzeme satırı ya stok kalemi ya da alt reçete içermelidir.')
            )
        if self.sub_recipe_id and self.recipe_id == self.sub_recipe_id:
            raise ValidationError(_('Reçete kendisini alt reçete olarak kullanamaz.'))
        if self.sub_recipe_id and self.recipe_id:
            from .recipe_expansion import detect_recipe_cycle

            if detect_recipe_cycle(self.recipe_id, self.sub_recipe_id):
                raise ValidationError(
                    _('Alt reçete seçimi döngüsel bağımlılık oluşturur.')
                )

    def _get_stock_item_for_cost(self):
        if getattr(self, 'stock_item', None) is not None:
            return self.stock_item
        from apps.inventory.models import StockItem

        return StockItem.objects.filter(pk=self.stock_item_id).first()

    def _compute_normalized_quantity(self) -> Decimal:
        """Miktarı stok kaleminin birimine çevirir (InventoryService ile aynı mantık)."""
        from apps.inventory.services import InventoryService

        item = self._get_stock_item_for_cost()
        if not item:
            return self.quantity
        nq, _, _ = InventoryService._normalize_quantity_to_item_unit(
            item, self.quantity, self.unit
        )
        return nq

    def _sync_normalized_quantity(self) -> None:
        if self.sub_recipe_id:
            sub = self.sub_recipe
            target_unit = (sub.serving_unit if sub and sub.serving_unit else None) or self.unit
            try:
                from .recipe_expansion import normalize_quantity_between_units

                self.normalized_quantity = normalize_quantity_between_units(
                    self.quantity, self.unit, target_unit
                )
            except ValueError as exc:
                raise ValidationError(
                    {'unit': _('Birim dönüşümü yapılamadı: %(err)s') % {'err': str(exc)}}
                ) from exc
            return
        item = self._get_stock_item_for_cost()
        if not item:
            raise ValidationError(
                {'stock_item': _('Stok kalemi gerekli.')}
            )
        try:
            self.normalized_quantity = self._compute_normalized_quantity()
        except ValueError as exc:
            raise ValidationError(
                {'unit': _('Birim dönüşümü yapılamadı: %(err)s') % {'err': str(exc)}}
            ) from exc

    def save(self, *args, **kwargs):
        self.clean()
        self._sync_normalized_quantity()
        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            kwargs['update_fields'] = list(set(update_fields) | {'normalized_quantity'})
        super().save(*args, **kwargs)

    def line_cost_stock(self):
        """Stok kalemi satır maliyeti."""
        item = self._get_stock_item_for_cost()
        if not item:
            return ZERO_MONEY
        qty = self.normalized_quantity
        if qty is None:
            try:
                qty = self._compute_normalized_quantity()
            except ValueError:
                qty = self.quantity
        price = item.last_purchase_price or ZERO_MONEY
        return qty * price

    @property
    def line_cost(self):
        """Bu malzeme satırının maliyeti."""
        if self.sub_recipe_id:
            from .recipe_expansion import compute_sub_recipe_line_cost

            return compute_sub_recipe_line_cost(self)
        return self.line_cost_stock()

    @property
    def ingredient_type(self) -> str:
        return 'sub_recipe' if self.sub_recipe_id else 'stock_item'
