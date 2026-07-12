"""
Şubeler modülü — Global Arama konfigürasyonu.

Şubeler: ad ve kod ile aranır.
Masalar: ad ve zone adı ile aranır — branch scope zone FK üzerinden.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like
from core.branch_scope import accessible_branch_id_strings


def search_branches(query: str, user, request) -> list[dict]:
    """Şubelerde ad, kod veya UUID prefix ile arama yapar."""
    from apps.branches.models import Branch

    qs = Branch.objects.filter(is_active=True).only("id", "name", "code", "address")

    # Süper kullanıcı değilse yalnızca erişilebilir şubeler
    allowed = accessible_branch_id_strings(user)
    if allowed is not None:
        if not allowed:
            return []
        qs = qs.filter(id__in=list(allowed))

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(Q(name__icontains=query) | Q(code__icontains=query))

    return [
        {
            "id": str(b.id),
            "title": b.name,
            "subtitle": b.code,
        }
        for b in qs[:7]
    ]


def search_tables(query: str, user, request) -> list[dict]:
    """Masalarda ad, zone adı veya UUID prefix ile arama yapar."""
    from apps.branches.models import Table
    from core.branch_scope import branch_filter_qs

    qs = (
        Table.objects.filter(is_active=True)
        .select_related("zone__branch")
        .only("id", "name", "status", "zone__name", "zone__branch__name")
    )

    # Zone üzerinden branch scope
    qs = branch_filter_qs(qs, request, field="zone__branch_id")

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(Q(name__icontains=query) | Q(zone__name__icontains=query))

    STATUS_LABELS = {
        "FREE": "Boş",
        "OCCUPIED": "Dolu",
        "RESERVED": "Rezerve",
        "OUT_OF_SERVICE": "Hizmet Dışı",
    }

    return [
        {
            "id": str(t.id),
            "title": f"{t.name} ({t.zone.name})",
            "subtitle": f"{t.zone.branch.name} — {STATUS_LABELS.get(t.status, t.status)}",
        }
        for t in qs[:7]
    ]


def register_search_modules() -> None:
    register(
        SearchableModule(
            key="branches",
            label="Şubeler",
            icon="Building2",
            required_permissions=["branches.view_branch", "branches.manage_branch"],
            search_fn=search_branches,
            result_url_template="/admin?tab=branches",
            branch_scope_field=None,  # search_fn içinde accessible_branch_id_strings ile scope
        )
    )
    register(
        SearchableModule(
            key="tables",
            label="Masalar",
            icon="Grid3X3",
            required_permissions=["branches.view_table", "branches.manage_table"],
            search_fn=search_tables,
            result_url_template="/tables",
            branch_scope_field=None,  # search_fn içinde branch_filter_qs ile scope
        )
    )
