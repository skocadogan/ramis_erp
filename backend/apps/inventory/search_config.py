"""
Envanter modülü — Global Arama konfigürasyonu.

Stok kalemleri: ad, SKU, barkod veya UUID prefix ile aranır.
Tedarikçiler: ad, iletişim kişisi veya e-posta ile aranır.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like


def search_stock_items(query: str, user, request) -> list[dict]:
    """Stok kalemlerinde ad, SKU, barkod veya UUID prefix ile arama yapar."""
    from apps.inventory.models import StockItem

    qs = (
        StockItem.objects.filter(is_active=True)
        .select_related("category")
        .only("id", "name", "sku", "unit", "category__name")
    )

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(name__icontains=query)
            | Q(sku__icontains=query)
            | Q(barcode__icontains=query)
            | Q(category__name__icontains=query)
        )

    return [
        {
            "id": str(item.id),
            "title": f"{item.name} ({item.sku})",
            "subtitle": item.category.name if item.category_id else "Kategorisiz",
        }
        for item in qs[:7]
    ]


def search_suppliers(query: str, user, request) -> list[dict]:
    """Tedarikçilerde ad, iletişim kişisi veya e-posta ile arama yapar."""
    from apps.inventory.models import Supplier

    qs = Supplier.objects.filter(is_active=True).only(
        "id", "name", "contact_person", "phone"
    )

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(name__icontains=query)
            | Q(contact_person__icontains=query)
            | Q(email__icontains=query)
        )

    return [
        {
            "id": str(s.id),
            "title": s.name,
            "subtitle": s.contact_person or s.phone or "Tedarikçi",
        }
        for s in qs[:7]
    ]


def register_search_modules() -> None:
    register(
        SearchableModule(
            key="inventory_items",
            label="Stok Kalemleri",
            icon="Package",
            required_permissions=[
                "inventory.view_stock_item",
                "inventory.manage_stock_item",
            ],
            search_fn=search_stock_items,
            result_url_template="/inventory",
            branch_scope_field=None,  # StockItem şube FK'sı yok; warehouse üzerinden kapsam
        )
    )
    register(
        SearchableModule(
            key="inventory_suppliers",
            label="Tedarikçiler",
            icon="Truck",
            required_permissions=[
                "inventory.view_supplier",
                "inventory.manage_supplier",
            ],
            search_fn=search_suppliers,
            result_url_template="/inventory",
            branch_scope_field=None,
        )
    )
