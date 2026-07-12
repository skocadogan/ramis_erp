"""
Standart DRF API yanıt yardımcıları.

Basit hata/başarı mesajları için tek sözleşme:
- Hata: ``detail`` (+ isteğe bağlı ``code``)
- Başarı mesajı: ``detail`` veya veri + ``detail``

Geriye dönük uyumluluk için ``error`` anahtarı isteğe bağlı yansıtılabilir.
"""

from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.response import Response


def detail_response(
    detail: str,
    *,
    http_status: int = status.HTTP_400_BAD_REQUEST,
    code: str | None = None,
    mirror_error_key: bool = False,
    **extra: Any,
) -> Response:
    """Tek cümlelik hata veya bilgi yanıtı."""
    body: dict[str, Any] = {"detail": detail}
    if code:
        body["code"] = code
    if mirror_error_key:
        body["error"] = detail
    body.update(extra)
    return Response(body, status=http_status)


def ok_response(
    *,
    detail: str | None = None,
    data: Any = None,
    http_status: int = status.HTTP_200_OK,
    **extra: Any,
) -> Response:
    """Başarı yanıtı; toast için ``detail`` string kullanılabilir."""
    body: dict[str, Any] = {}
    if detail:
        body["detail"] = detail
    if data is not None:
        body["data"] = data
    body.update(extra)
    return Response(body, status=http_status)
