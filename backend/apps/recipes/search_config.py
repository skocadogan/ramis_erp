"""
Reçeteler modülü — Global Arama konfigürasyonu.

Reçeteler: isim veya UUID ile aranır. Ürün adresi aranabilir.
Branch scope uygulaması: reçetelerin branch M2M bağlantısı vardır, ancak basitleştirmek adına sadece izin kontrolü ile tüm kullanıcılara veya erişimi kısıtlı şubelere verilebilir.
Şu an için basit isim araması.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like


def search_recipes(query: str, user, request) -> list[dict]:
    """Reçetelerde ad, bağlı ürün adı veya UUID ile arama yapar."""
    from apps.recipes.models import Recipe

    qs = (
        Recipe.objects.filter(is_active=True)
        .select_related("product")
        .only("id", "name", "product__name")
    )

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(name__icontains=query) | 
            Q(product__name__icontains=query) |
            Q(ingredients__stock_item__name__icontains=query) |
            Q(ingredients__stock_item__sku__icontains=query)
        ).distinct()


    return [
        {
            "id": str(r.id),
            "title": r.name,
            "subtitle": r.product.name if r.product_id else "Ürüne Bağlı Değil",
        }
        for r in qs[:7]
    ]


def register_search_modules() -> None:
    register(
        SearchableModule(
            key="recipes",
            label="Reçeteler",
            icon="ClipboardList",
            required_permissions=["recipes.view_recipe", "recipes.manage_recipe"],
            search_fn=search_recipes,
            result_url_template="/recipes",
            branch_scope_field=None,
        )
    )
