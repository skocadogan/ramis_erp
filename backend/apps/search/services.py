"""
Global Arama Servisi — koordinatör katman.

Sadece kayıt defteri (registry) üzerinden çalışır; hiçbir domain modeline doğrudan bağımlı değildir.
Güvenlik katmanları sırasıyla:
  1. Kullanıcı kimlik doğrulaması (view katmanında IsAuthenticated ile sağlanır)
  2. Modül bazlı RBAC izin kontrolü
  3. Branch scope filtresi (her modülün branch_scope_field'ına göre)
  4. Soft delete filtresi (her search_fn kendi is_active=True filtresini uygular)
  5. Modül başına sonuç limiti
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from core.branch_scope import branch_filter_qs

from .registry import get_all, get_by_keys, SearchableModule

logger = logging.getLogger(__name__)

# Minimum sorgu uzunluğu — daha kısa sorgular çok geniş sonuç üretir
MIN_QUERY_LENGTH = 2

# UUID pattern: 4+ hex karakteri (kısa prefix'e kadar)
_UUID_RE = re.compile(r"^[0-9a-fA-F]{4,32}(-[0-9a-fA-F]*)*$")


def is_uuid_like(query: str) -> bool:
    """
    Sorgunun tam veya kısmi bir UUID olup olmadığını tespit eder.
    Bu sayede ID aramaları istartswith ile indeksli sorguya yönlendirilir.

    Örnekler:
        "550e8400"               → True  (kısmi UUID prefix)
        "550e8400-e29b-41d4-..."  → True  (tam UUID)
        "kebap"                  → False (metin araması)
    """
    clean = query.replace("-", "")
    return bool(re.match(r"^[0-9a-fA-F]{2,32}$", clean))


def _user_has_any_permission(user: object, codes: list[str]) -> bool:
    """RBAC OR mantığı: listteki kodlardan en az biri yeterliydi."""
    if getattr(user, "is_superuser", False):
        return True
    for code in codes:
        # RBACUserMixin.has_permission() tercih edilir;
        # yoksa role M2M üzerinden doğrudan kontrol yapılır.
        if hasattr(user, "has_permission"):
            if user.has_permission(code):
                return True
        else:
            try:
                if user.roles.filter(
                    is_active=True, permissions__code=code
                ).exists():
                    return True
            except (AttributeError, TypeError):
                pass
    return False


class SearchService:
    """
    Arama sistemi koordinatörü.

    Registry'deki kayıtlı modülleri yineler; RBAC ve branch scope'u uygulayarak
    her modülün search_fn fonksiyonunu çağırır ve sonuçları birleştirir.
    """

    @staticmethod
    def search(
        query: str,
        user: object,
        request: object,
        module_filter: list[str] | None = None,
    ) -> dict:
        """
        Kullanıcının yetkileri dahilinde tüm kayıtlı modüllerde arama yapar.

        Args:
            query:         Arama terimi (minimum 2 karakter).
            user:          Django kullanıcı nesnesi (is_authenticated kontrol edilmiş olmalı).
            request:       DRF request — branch_filter_qs için gerekli.
            module_filter: Belirtilirse yalnızca bu key'lerdeki modüllerde arama yapılır.

        Returns:
            {
                "query": str,
                "is_uuid": bool,
                "total_count": int,
                "results": {
                    "<module_key>": {
                        "label": str,
                        "icon": str,
                        "url": str,
                        "count": int,
                        "items": [{"id": str, "title": str, "subtitle": str}]
                    }
                }
            }
        """
        query = (query or "").strip()

        if len(query) < MIN_QUERY_LENGTH:
            return {
                "query": query,
                "is_uuid": False,
                "total_count": 0,
                "results": {},
            }

        uuid_mode = is_uuid_like(query)

        # Modül filtresi uygulanmışsa yalnızca o modüller; yoksa tümü
        modules: list[SearchableModule] = (
            get_by_keys(module_filter) if module_filter else get_all()
        )

        aggregated: dict = {}
        total_count = 0

        # RBAC filtrele — yetkisiz modülleri ele (paralel öncesi)
        authorized_modules = [
            m for m in modules if _user_has_any_permission(user, m.required_permissions)
        ]

        # Paralel arama: ThreadPoolExecutor ile tüm modülleri eşzamanlı çalıştır (RAPOR-3 D-1)
        def _search_module(module: SearchableModule) -> tuple | None:
            try:
                items = module.search_fn(query, user, request)
                if not items:
                    return None
                return (module, items)
            except Exception:
                logger.exception(
                    "Search failed for module=%s query=%r", module.key, query
                )
                return None

        with ThreadPoolExecutor(max_workers=min(len(authorized_modules) or 1, 8)) as executor:
            futures = {executor.submit(_search_module, m): m for m in authorized_modules}
            for future in as_completed(futures):
                result = future.result()
                if result is None:
                    continue
                module, items = result
                count = len(items)
                aggregated[module.key] = {
                    "label": module.label,
                    "icon": module.icon,
                    "url": module.result_url_template,
                    "count": count,
                    "items": items,
                }
                total_count += count

        return {
            "query": query,
            "is_uuid": uuid_mode,
            "total_count": total_count,
            "results": aggregated,
        }
