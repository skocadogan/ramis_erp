"""
Faturalar modülü — Global Arama konfigürasyonu.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like
from core.branch_scope import branch_filter_qs


def search_invoices(query: str, user, request) -> list[dict]:
    """Faturalarda numara, müşteri adı/vergi no veya UUID ile arama yapar."""
    from apps.invoices.models import Invoice

    qs = (
        Invoice.objects.filter(is_active=True)
        .select_related("branch")
        .only(
            "id",
            "invoice_number",
            "customer_name",
            "total_amount",
            "branch__name",
        )
    )

    qs = branch_filter_qs(qs, request, field="branch_id")

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(invoice_number__icontains=query)
            | Q(customer_name__icontains=query)
            | Q(customer_tax_id__icontains=query)
        )

    return [
        {
            "id": str(inv.id),
            "title": inv.invoice_number,
            "subtitle": inv.customer_name or inv.branch.name,
        }
        for inv in qs[:7]
    ]


def register_search_modules() -> None:
    register(
        SearchableModule(
            key="invoices",
            label="Faturalar",
            icon="FileText",
            required_permissions=["invoices.view_invoice", "invoices.manage_invoice"],
            search_fn=search_invoices,
            result_url_template="/invoices",
            branch_scope_field=None,
        )
    )
