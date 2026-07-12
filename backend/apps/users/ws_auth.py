"""WebSocket el sıkışması için JWT kullanıcı çözümlemesi (Channels scope)."""

from __future__ import annotations

import base64
import hashlib
import os
from urllib.parse import parse_qs

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractBaseUser
from django.core.cache import cache
from rest_framework_simplejwt.tokens import AccessToken

_WS_AUTH_CACHE_SECONDS = int(os.environ.get("WS_AUTH_CACHE_SECONDS", "60"))


def _try_decode_base64_token(raw: str) -> str:
    """
    Base64 encode edilmiş token'ı decode et.
    
    Güvenlik: 
    - Mobile client token'ı base64 ile encode ederek log'lardan gizler
    - Decode edilemezse ham token'ı kullan (geriye dönük uyumluluk)
    
    Not: True security için backend'de kısa ömürlü WS token desteği önerilir.
    """
    if not raw:
        return raw
    
    # Base64 decode dene
    try:
        # Padding eksik olabilir
        padded = raw + "=" * (-len(raw) % 4)
        decoded = base64.b64decode(padded).decode("utf-8")
        
        # Decode edilen string JWT formatına benziyorsa kullan
        if "." in decoded and len(decoded) > 20:
            return decoded
    except Exception:
        pass
    
    # Decode edilemezse ham token'ı dön (geriye dönük uyumluluk)
    return raw


def _tokens_from_scope(scope: dict) -> tuple[str | None, str | None]:
    """
    (cookie_token, query_token) — ikisi de ham string veya None.
    
    Query string'den gelen token base64 encode edilmiş olabilir.
    Decode edip JWT doğrulamasına hazır hale getirir.
    """
    query_raw = scope.get("query_string", b"").decode("utf-8")
    qs = parse_qs(query_raw)
    query_vals = qs.get("token")
    query_tok = query_vals[0] if query_vals else None
    
    # Base64 encode edilmiş token'ı decode et
    if query_tok:
        query_tok = _try_decode_base64_token(query_tok)

    cookies = scope.get("cookies") or {}
    cookie_tok = cookies.get("access_token")

    return cookie_tok, query_tok


def _cache_key_for_token(raw: str) -> str:
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]
    return f"ws_auth:user:{digest}"


def get_user_for_websocket(scope: dict) -> AbstractBaseUser | None:
    """
    İstemci önce ?token= ile sonra HttpOnly cookie ile gönderebilir.
    Doğrulama sonucu kısa süre önbellekte tutulur (yoğun reconnect yükünü azaltır).
    Öncelik: cookie (genelde daha güncel), ardından query string.
    """
    User = get_user_model()
    cookie_tok, query_tok = _tokens_from_scope(scope)

    candidates: list[str] = []
    seen: set[str] = set()
    for raw in (cookie_tok, query_tok):
        if raw and raw not in seen:
            seen.add(raw)
            candidates.append(raw)

    for raw in candidates:
        ck = _cache_key_for_token(raw)
        cached_user_id = cache.get(ck)
        if cached_user_id is not None:
            try:
                return User.objects.get(pk=cached_user_id, is_active=True)
            except User.DoesNotExist:
                cache.delete(ck)

        try:
            validated = AccessToken(raw)
            user_id = validated.get("user_id")
            user = User.objects.get(pk=user_id, is_active=True)
            cache.set(ck, user_id, timeout=_WS_AUTH_CACHE_SECONDS)
            return user
        except Exception:
            continue
    return None
