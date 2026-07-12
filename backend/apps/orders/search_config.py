"""
Siparişler modülü — Global Arama konfigürasyonu.

Siparişlerde UUID (ID prefix), masa adı veya durum etiketiyle arama yapılır.
Branch scope: branch_filter_qs branch_id FK alanı üzerinden uygulanır.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like
from core.branch_scope import branch_filter_qs


def search_orders(query: str, user, request) -> list[dict]:
    """Siparişlerde UUID prefix, masa adı veya durum ile arama yapar."""
    from apps.orders.models import Order

    qs = (
        Order.objects.filter(is_active=True)
        .select_related("table__zone", "branch")
        .only("id", "status", "order_type", "table__name", "table__zone__name", "branch__name")
    )

    # Branch scope — branch_filter_qs ile şube izolasyonu
    qs = branch_filter_qs(qs, request, field="branch_id")

    filters = Q(table__name__icontains=query) | Q(status__icontains=query)
    
    # UUID / ID prefix araması
    if is_uuid_like(query):
        filters |= Q(id__istartswith=query.replace("-", ""))
    
    qs = qs.filter(filters)

    STATUS_LABELS = {
        "PENDING": "Bekliyor",
        "PREPARING": "Hazırlanıyor",
        "READY": "Hazır",
        "DELIVERED": "Teslim Edildi",
        "COMPLETED": "Tamamlandı",
        "CANCELLED": "İptal Edildi",
    }

    results = []
    for o in qs[:7]:
        if o.table_id:
            table_label = f"Masa {o.table.name}"
        else:
            table_label = "Paket"
        results.append(
            {
                "id": str(o.id),
                "title": f"Sipariş #{str(o.id)[:8].upper()}",
                "subtitle": f"{table_label} — {STATUS_LABELS.get(o.status, o.status)}",
            }
        )
    return results


def register_search_modules() -> None:
    register(
        SearchableModule(
            key="orders",
            label="Siparişler",
            icon="ShoppingCart",
            required_permissions=["orders.view_order", "orders.manage_order"],
            search_fn=search_orders,
            result_url_template="/tables",
            branch_scope_field=None,  # search_fn içinde branch_filter_qs zaten uygulanıyor
        )
    )
