from __future__ import annotations

from dataclasses import dataclass

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .ws_tokens import verify_prep_display_token


@dataclass
class PrepDisplayPrincipal:
    branch_id: str
    station_id: str

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False

    @property
    def is_superuser(self) -> bool:
        return False

    def has_permission(self, _code: str) -> bool:
        return False


class PrepDisplayTokenAuthentication(BaseAuthentication):
    """Header `X-Prep-Display-Token` veya query `t` ile kiosk oturumu."""

    keyword = "PrepDisplay"

    def authenticate(self, request):
        token = (
            request.headers.get("X-Prep-Display-Token")
            or request.query_params.get("t")
            or request.query_params.get("display_token")
        )
        if not token:
            return None

        parsed = verify_prep_display_token(str(token))
        if not parsed:
            raise AuthenticationFailed("Geçersiz veya süresi dolmuş hazırlık ekranı token'ı.")

        branch_id, station_id = parsed
        principal = PrepDisplayPrincipal(branch_id=branch_id, station_id=station_id)
        return (principal, token)
