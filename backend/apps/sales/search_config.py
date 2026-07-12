"""
Satışlar modülü — Global Arama konfigürasyonu.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like
from core.branch_scope import branch_filter_qs


def search_sales(query: str, user, request) -> list[dict]:
    """Satışlarda UUID prefix veya ödeme yöntemi ile arama yapar."""
    from apps.sales.models import Sale
    from apps.reporting.utils import get_currency_symbol

    qs = (
        Sale.objects.filter(is_active=True)
        .select_related("branch")
        .only("id", "payment_method", "total_amount", "branch__name")
    )

    qs = branch_filter_qs(qs, request, field="branch_id")

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(payment_method__icontains=query)

    PAYMENT_LABELS = {
        "CASH": "Nakit",
        "CARD": "Kredi Kartı",
        "OTHER": "Diğer",
    }

    return [
        {
            "id": str(s.id),
            "title": f"Satış #{str(s.id)[:8].upper()} — {s.total_amount} {get_currency_symbol(request.LANGUAGE_CODE)}",
            "subtitle": f"{s.branch.name} — {PAYMENT_LABELS.get(s.payment_method, s.payment_method)}",
        }
        for s in qs[:7]
    ]


def register_search_modules() -> None:
    register(
        SearchableModule(
            key="sales",
            label="Satışlar",
            icon="ShoppingCart",
            required_permissions=["sales.view_sale", "sales.manage_sale"],
            search_fn=search_sales,
            result_url_template="/sales",
            branch_scope_field=None,
        )
    )
