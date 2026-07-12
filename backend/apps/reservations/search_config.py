"""
Rezervasyonlar modülü — Global Arama konfigürasyonu.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like
from core.branch_scope import branch_filter_qs


def search_reservations(query: str, user, request) -> list[dict]:
    """Rezervasyonlarda müşteri adı, telefon, e-posta veya UUID ile arama yapar."""
    from apps.reservations.models import Reservation

    qs = (
        Reservation.objects.filter(is_active=True)
        .select_related("branch")
        .only(
            "id",
            "customer_name",
            "customer_phone",
            "scheduled_date",
            "status",
            "branch__name",
        )
    )

    qs = branch_filter_qs(qs, request, field="branch_id")

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(customer_name__icontains=query)
            | Q(customer_phone__icontains=query)
            | Q(customer_email__icontains=query)
        )

    STATUS_LABELS = {
        "PENDING": "Bekliyor",
        "CONFIRMED": "Onaylandı",
        "SEATED": "Oturdu",
        "COMPLETED": "Tamamlandı",
        "CANCELLED": "İptal",
        "NO_SHOW": "Gelmedi",
    }

    return [
        {
            "id": str(r.id),
            "title": r.customer_name,
            "subtitle": (
                f"{r.scheduled_date} — {STATUS_LABELS.get(r.status, r.status)}"
            ),
        }
        for r in qs[:7]
    ]


def register_search_modules() -> None:
    register(
        SearchableModule(
            key="reservations",
            label="Rezervasyonlar",
            icon="CalendarCheck",
            required_permissions=[
                "reservations.view_reservation",
                "reservations.manage_reservation",
            ],
            search_fn=search_reservations,
            result_url_template="/reservations",
            branch_scope_field=None,  # search_fn içinde branch_filter_qs uygulanıyor
        )
    )
