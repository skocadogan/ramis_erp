"""
Global Arama — Thin View.

GET /api/v1/search/?q=<sorgu>
GET /api/v1/search/?q=<sorgu>&modules=menu_products,orders

Yetkilendirme: IsAuthenticated (giriş yapmış herkes endpoint'e ulaşabilir).
Sonuç filtrelemesi: her modül kendi RBAC ve branch scope'unu servis katmanında uygular.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import SearchService


class GlobalSearchView(APIView):
    """
    Kullanıcının yetkileri dahilinde tüm kayıtlı modüllerde arama yapar.

    Query parametreleri:
        q       — Arama terimi (zorunlu, minimum 2 karakter)
        modules — Virgülle ayrılmış modül key listesi (opsiyonel filtre)
                  Örn: ?q=kebap&modules=menu_products,inventory_items
    """

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        query: str = request.query_params.get("q", "").strip()
        modules_raw: str = request.query_params.get("modules", "").strip()
        module_filter: list[str] | None = (
            [m.strip() for m in modules_raw.split(",") if m.strip()] or None
        )

        result = SearchService.search(
            query=query,
            user=request.user,
            request=request,
            module_filter=module_filter,
        )
        return Response(result)
