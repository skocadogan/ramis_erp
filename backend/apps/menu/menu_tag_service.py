"""Menü etiket filtreleme ve katalog ayarları (şube bazlı)."""
from __future__ import annotations

from django.db.models import Q, QuerySet
from django.utils import timezone

from .models import Category, MenuCatalogSettings, MenuTag, Product


def normalize_tag_name(raw: str) -> str:
    name = (raw or '').strip()
    if not name:
        return name
    if not name.startswith('#'):
        name = f'#{name}'
    return name


def get_or_create_catalog_settings(branch_id) -> MenuCatalogSettings | None:
    if not branch_id:
        return None
    settings, _ = MenuCatalogSettings.objects.select_related('active_tag').get_or_create(
        branch_id=branch_id,
    )
    return settings


def catalog_settings_payload(branch_id) -> dict:
    if not branch_id:
        return {
            'branch_id': None,
            'active_tag_id': None,
            'active_tag_name': None,
            'filter_untagged': False,
            'has_tags': False,
        }
    settings = get_or_create_catalog_settings(branch_id)
    tag = settings.active_tag if settings else None
    return {
        'branch_id': str(branch_id),
        'active_tag_id': str(tag.id) if tag else None,
        'active_tag_name': tag.name if tag else None,
        'filter_untagged': settings.filter_untagged if settings else False,
        'has_tags': MenuTag.objects.filter(is_active=True, branch_id=branch_id).exists(),
    }


def should_apply_tag_filter(branch_id) -> bool:
    if not branch_id:
        return False
    if not MenuTag.objects.filter(is_active=True, branch_id=branch_id).exists():
        return False
    settings = get_or_create_catalog_settings(branch_id)
    if not settings:
        return False
    return bool(settings.filter_untagged or settings.active_tag_id)


def _category_ancestor_ids(category_id) -> list:
    """Kategori ve tüm üst kategorilerinin id listesi (kök dahil)."""
    ids: list = []
    cat_id = category_id
    seen: set = set()
    while cat_id and cat_id not in seen:
        seen.add(cat_id)
        ids.append(cat_id)
        parent_id = (
            Category.objects.filter(pk=cat_id)
            .values_list('parent_id', flat=True)
            .first()
        )
        cat_id = parent_id
    return ids


def _categories_with_tag(tag_id, branch_id) -> set:
    """Şubeye ait etiketli kategoriler + alt kategorileri."""
    tagged_roots = set(
        Category.objects.filter(
            tags__id=tag_id,
            tags__branch_id=branch_id,
            is_active=True,
        ).values_list('id', flat=True)
    )
    if not tagged_roots:
        return set()

    all_cats = list(Category.objects.filter(is_active=True).values_list('id', 'parent_id'))
    children_map: dict = {}
    for cid, parent_id in all_cats:
        if parent_id:
            children_map.setdefault(parent_id, []).append(cid)

    result = set(tagged_roots)

    def collect_descendants(root_id):
        for child_id in children_map.get(root_id, []):
            if child_id not in result:
                result.add(child_id)
                collect_descendants(child_id)

    for root_id in tagged_roots:
        collect_descendants(root_id)
    return result


def _category_has_any_tag_for_branch(category_id, branch_id) -> bool:
    for cid in _category_ancestor_ids(category_id):
        if Category.tags.through.objects.filter(
            category_id=cid,
            menutag__branch_id=branch_id,
            menutag__is_active=True,
        ).exists():
            return True
    return False


def _cats_with_branch_tags_in_tree(branch_id) -> set:
    tagged_category_ids = set(
        Category.tags.through.objects.filter(
            menutag__branch_id=branch_id,
            menutag__is_active=True,
        ).values_list('category_id', flat=True)
    )
    all_cat_rows = list(Category.objects.filter(is_active=True).values_list('id', 'parent_id'))
    cats_with_tag_in_tree: set = set(tagged_category_ids)
    children_map: dict = {}
    for cid, parent_id in all_cat_rows:
        if parent_id:
            children_map.setdefault(parent_id, []).append(cid)

    def mark_descendants(root_id):
        for child_id in children_map.get(root_id, []):
            if child_id not in cats_with_tag_in_tree:
                cats_with_tag_in_tree.add(child_id)
                mark_descendants(child_id)

    for tcid in tagged_category_ids:
        mark_descendants(tcid)
    return cats_with_tag_in_tree


def filter_products_by_active_tag(qs: QuerySet[Product], branch_id=None) -> QuerySet[Product]:
    if not branch_id or not should_apply_tag_filter(branch_id):
        return qs

    settings = get_or_create_catalog_settings(branch_id)
    if not settings:
        return qs

    if settings.filter_untagged:
        tagged_product_ids = set(
            Product.tags.through.objects.filter(
                menutag__branch_id=branch_id,
                menutag__is_active=True,
            ).values_list('product_id', flat=True)
        )
        cats_with_tag_in_tree = _cats_with_branch_tags_in_tree(branch_id)
        return qs.exclude(
            Q(id__in=tagged_product_ids) | Q(category_id__in=cats_with_tag_in_tree)
        )

    tag_id = settings.active_tag_id
    return qs.filter(tags__id=tag_id, tags__branch_id=branch_id).distinct()


def filter_categories_by_active_tag(qs: QuerySet[Category], branch_id=None) -> QuerySet[Category]:
    if not branch_id or not should_apply_tag_filter(branch_id):
        return qs

    settings = get_or_create_catalog_settings(branch_id)
    if not settings:
        return qs

    if settings.filter_untagged:
        return qs.exclude(id__in=_cats_with_branch_tags_in_tree(branch_id))

    tag_id = settings.active_tag_id
    tagged_cats = _categories_with_tag(tag_id, branch_id)
    product_cat_ids = set(
        Product.objects.filter(
            is_active=True,
            tags__id=tag_id,
            tags__branch_id=branch_id,
        ).values_list('category_id', flat=True)
    )
    visible_ids = tagged_cats | product_cat_ids
    return qs.filter(id__in=visible_ids)


def activate_catalog_tag(*, branch_id, tag_id=None, filter_untagged: bool = False) -> MenuCatalogSettings:
    settings = get_or_create_catalog_settings(branch_id)
    if not settings:
        raise ValueError('branch_id is required')
    if filter_untagged:
        settings.active_tag = None
        settings.filter_untagged = True
    elif tag_id:
        tag = MenuTag.objects.get(pk=tag_id, is_active=True, branch_id=branch_id)
        settings.active_tag = tag
        settings.filter_untagged = False
    else:
        settings.active_tag = None
        settings.filter_untagged = False
    settings.save(update_fields=['active_tag', 'filter_untagged', 'updated_at'])
    return settings


def soft_delete_menu_tag(tag: MenuTag) -> None:
    """Etiketi pasifleştirir; kategori/ürün ilişkilerini ve aktif filtreyi temizler."""
    branch_id = tag.branch_id
    Category.tags.through.objects.filter(menutag_id=tag.id).delete()
    Product.tags.through.objects.filter(menutag_id=tag.id).delete()
    MenuCatalogSettings.objects.filter(branch_id=branch_id, active_tag_id=tag.id).update(
        active_tag_id=None,
        filter_untagged=False,
        updated_at=timezone.now(),
    )
    tag.is_active = False
    tag.save(update_fields=['is_active', 'updated_at'])
