"""
Kullanıcılar modülü — Global Arama konfigürasyonu.

Yalnızca users.view_user veya users.manage_user iznine sahip kullanıcılar
(genellikle SystemAdmin ve BranchManager) bu sonuçları görebilir.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like


def search_users(query: str, user, request) -> list[dict]:
    """Kullanıcılarda kullanıcı adı, ad soyad veya e-posta ile arama yapar."""
    from apps.users.models import User as UserModel

    qs = UserModel.objects.filter(is_active=True).only(
        "id", "username", "first_name", "last_name", "email"
    )

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(username__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(email__icontains=query)
        )

    return [
        {
            "id": str(u.id),
            "title": u.get_full_name() or u.username,
            "subtitle": u.email or u.username,
        }
        for u in qs[:7]
    ]


def register_search_modules() -> None:
    register(
        SearchableModule(
            key="users",
            label="Kullanıcılar",
            icon="Users",
            required_permissions=["users.view_user", "users.manage_user"],
            search_fn=search_users,
            result_url_template="/admin?tab=users",
            branch_scope_field=None,
        )
    )
