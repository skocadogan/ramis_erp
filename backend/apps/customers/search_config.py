"""
Müşteriler modülü — Global Arama konfigürasyonu.
"""

from __future__ import annotations
from django.db.models import Q
from apps.search.registry import SearchableModule, register
from core.branch_scope import branch_filter_qs

def search_customers(query: str, user, request) -> list[dict]:
    """Müşterilerde isim, telefon veya e-posta ile arama yapar."""
    from apps.customers.models import Customer

    qs = Customer.objects.filter(is_active=True)
    
    # Müşteriler şubeye bağlı olmadığından branch_filter_qs genelde boş veya tümü için çalışır,
    # ancak sistemin branch_filter_qs fonksiyonuna uyum sağlıyoruz.
    # Eğer Customer modelinde branch alanı yoksa field parametresi boş geçilir.
    # Biz genel arama yapıyoruz.
    
    qs = qs.filter(
        Q(name__icontains=query) |
        Q(phone__icontains=query) |
        Q(email__icontains=query) |
        Q(tax_no__icontains=query) |
        Q(tc_no__icontains=query)
    )

    return [
        {
            "id": str(c.id),
            "title": c.name,
            "subtitle": f"{c.get_customer_type_display()} — {c.phone or c.email or ''}",
        }
        for c in qs[:7]
    ]

def register_search_modules() -> None:
    register(
        SearchableModule(
            key="customers",
            label="Müşteriler",
            icon="Users",
            required_permissions=["customers.view_customer", "customers.manage_customer"],
            search_fn=search_customers,
            result_url_template="/customers",
            branch_scope_field=None,
        )
    )
