from django.db.models import QuerySet, Prefetch

from .models import Category, Product, ProductVariant, ModifierGroup, Modifier


def get_active_categories() -> QuerySet[Category]:
    """Aktif kategorileri sıralı getirir."""
    return Category.objects.filter(is_active=True).order_by('order', 'name')


def get_active_products(category_id=None) -> QuerySet[Product]:
    """Aktif ürünleri getirir."""
    qs = Product.objects.filter(is_active=True).select_related('category', 'category__station').prefetch_related(
        Prefetch('variants', queryset=ProductVariant.objects.all()),
        Prefetch(
            'modifier_groups',
            queryset=ModifierGroup.objects.prefetch_related('modifiers'),
        ),
    )
    if category_id:
        qs = qs.filter(category_id=category_id)
    return qs.order_by('category__order', 'name')


def get_product_by_id(product_id) -> Product | None:
    """ID ile ürün getirir."""
    try:
        return Product.objects.select_related('category', 'category__station').prefetch_related(
            'variants',
            Prefetch(
                'modifier_groups',
                queryset=ModifierGroup.objects.prefetch_related('modifiers'),
            ),
        ).get(id=product_id)
    except Product.DoesNotExist:
        return None


def get_modifier_groups() -> QuerySet[ModifierGroup]:
    """Değiştirici gruplarını getirir."""
    return ModifierGroup.objects.prefetch_related('modifiers', 'products')
