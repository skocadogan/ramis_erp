import hashlib
import os

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework_simplejwt.authentication import JWTAuthentication

_JWT_AUTH_CACHE_SECONDS = int(os.environ.get('JWT_AUTH_CACHE_SECONDS', '60'))


def _jwt_user_cache_key(validated_token) -> str:
    user_id = validated_token.get('user_id')
    jti = validated_token.get('jti', '')
    if jti:
        return f'jwt_auth:user:{user_id}:{jti}'
    token_str = str(validated_token)
    digest = hashlib.sha256(token_str.encode('utf-8')).hexdigest()[:32]
    return f'jwt_auth:user:{user_id}:{digest}'


class CookieJWTAuthentication(JWTAuthentication):
    """JWT + cookie; kullanıcı nesnesi kısa süre cache'te (her istekte DB sorgusu yok)."""

    def authenticate(self, request):
        header_result = super().authenticate(request)
        if header_result is not None:
            return header_result

        raw_token = request.COOKIES.get('access_token')
        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token

    def get_user(self, validated_token):
        User = get_user_model()
        cache_key = _jwt_user_cache_key(validated_token)
        cached_user = cache.get(cache_key)
        if cached_user is not None:
            if getattr(cached_user, 'is_active', False):
                return cached_user
            cache.delete(cache_key)

        user = super().get_user(validated_token)
        cache.set(cache_key, user, timeout=_JWT_AUTH_CACHE_SECONDS)
        return user
