"""
Menü modülü — Global Arama konfigürasyonu.

Bu modül search sistemine 2 arama tanımı kayıt eder:
  - menu_products : Ürünler (ad, SKU, kategori adı ile)
  - menu_categories: Kategoriler (ad ile)

apps.py ready() içinden çağrılır; search/registry.py dışında hiçbir search bağımlılığı yoktur.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like


def search_products(query: str, user, request) -> list[dict]:
    """Menü ürünlerinde ad, kategori adı veya UUID prefix ile arama yapar."""
    from apps.menu.models import Product

    qs = (
        Product.objects.filter(is_active=True)
        .select_related("category", "category__station")
        .only("id", "name", "category__name")
    )

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(name__icontains=query) | Q(category__name__icontains=query)
        )

    return [
        {
            "id": str(p.id),
            "title": p.name,
            "subtitle": p.category.name if p.category_id else "Kategorisiz",
        }
        for p in qs[:7]
    ]


def search_categories(query: str, user, request) -> list[dict]:
    """Menü kategorilerinde ad veya UUID prefix ile arama yapar."""
    from apps.menu.models import Category

    qs = Category.objects.filter(is_active=True).only("id", "name")

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(name__icontains=query)

    return [
        {
            "id": str(c.id),
            "title": c.name,
            "subtitle": "Menü Kategorisi",
        }
        for c in qs[:7]
    ]


def register_search_modules() -> None:
    """SearchableModule'leri global kayıt defterine ekler."""
    register(
        SearchableModule(
            key="menu_products",
            label="Ürünler",
            icon="UtensilsCrossed",
            required_permissions=["menu.view_product", "menu.manage_product"],
            search_fn=search_products,
            result_url_template="/menu-management",
            branch_scope_field=None,  # Ürünler branches M2M; search_fn yetki bazlı döner
        )
    )
    register(
        SearchableModule(
            key="menu_categories",
            label="Kategoriler",
            icon="FolderOpen",
            required_permissions=["menu.view_category", "menu.manage_category"],
            search_fn=search_categories,
            result_url_template="/menu-management",
            branch_scope_field=None,
        )
    )
