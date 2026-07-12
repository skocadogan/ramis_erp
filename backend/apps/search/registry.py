"""
Arama modülü kayıt defteri — Registry Pattern.

Her aranabilir modül, kendi search_config.py dosyasında bir SearchableModule tanımlar
ve apps.py ready() metodunda register() çağırır.

search/services.py bu kayıt defterini okur; hiçbir domain app'ini doğrudan import etmez.
Böylece bağımlılık yönü tek taraflıdır: domain → registry ← service.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Any


@dataclass
class SearchableModule:
    """
    Bir modülün arama sistemine kaydını temsil eden değer nesnesi.

    Alanlar:
        key: Modülün tekil tanımlayıcısı (frontend result key'i olarak kullanılır).
            Örn: "menu_products", "orders"
        label: Arayüzde gösterilecek Türkçe etiket. Örn: "Ürünler"
        icon: Frontend'de kullanılacak Lucide React ikon adı. Örn: "UtensilsCrossed"
        required_permissions: RBAC izin kodları listesi — OR mantığı, en az biri yeterli.
        search_fn: (query: str, user, request) → list[dict] imzalı salt-okuma fonksiyonu.
            Her dict en az {"id": str, "title": str, "subtitle": str} içermelidir.
        result_url_template: Frontend yönlendirme yolu. Örn: "/menu-management"
        branch_scope_field: QuerySet üzerinde uygulanacak şube FK alan adı.
            None ise SearchService branch filtresi uygulamaz (modül kendi scope'unu yönetir).
        max_results: Modül başına döndürülecek maksimum sonuç sayısı.
    """

    key: str
    label: str
    icon: str
    required_permissions: list[str]
    search_fn: Callable[..., list[dict[str, Any]]]
    result_url_template: str
    branch_scope_field: str | None = "branch_id"
    max_results: int = 7


# Global kayıt defteri — uygulama başlangıcında ready() çağrılarıyla doldurulur.
_registry: list[SearchableModule] = []


def register(module: SearchableModule) -> None:
    """
    Bir SearchableModule'ü global kayıt defterine ekler.
    apps.py ready() içinden çağrılmalıdır.
    """
    # Aynı key ile tekrar kayıt önleme (hot-reload senaryoları için)
    if any(m.key == module.key for m in _registry):
        return
    _registry.append(module)


def get_all() -> list[SearchableModule]:
    """Kayıtlı tüm arama modüllerini döndürür."""
    return list(_registry)


def get_by_keys(keys: list[str]) -> list[SearchableModule]:
    """Belirtilen key listesindeki modülleri döndürür (modül filtresi için)."""
    key_set = set(keys)
    return [m for m in _registry if m.key in key_set]
