"""
RBAC çok katmanlı cache modülü.
Kullanıcı izinleri için TTL tabanlı cache; versioned key ile invalidation.
Rol/izin değişiminde sadece version artırılır, per-user delete yerine tüm eski key'ler otomatik geçersiz kalır.

Per-user ve per-role invalidation: Global version bump yerine ilgili kullanıcı(lar)ın
özel version'ı artırılarak diğer kullanıcıların cache'ine dokunulmaz (RAPOR-3 O-1).

Optimizasyon: Redis round-trip azaltma
- get_many ile version lookup'ları batch'lenir (2→1 round-trip)
- incr ile atomik version bump (2→1 round-trip)
- set_many ile toplu role invalidation (N*2→2 round-trip)
"""
import logging
from typing import Optional, Set

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

CACHE_PREFIX = 'rbac:user_perms:'
VERSION_KEY = 'rbac:perms_version'
CACHE_TTL = getattr(settings, 'RBAC_CACHE_TTL', 300)  # 5 dakika varsayılan. 0 = cache devre dışı

# Per-user version prefix (RAPOR-3 O-1)
USER_VERSION_PREFIX = 'rbac:user_perm_ver:'


def _version_keys(user):
    """Global ve per-user version key'lerini döndür (batch lookup için)."""
    return VERSION_KEY, f'{USER_VERSION_PREFIX}{user.pk}'


def _get_versions(user):
    """Her iki version'ı tek round-trip ile al (get_many)."""
    gv_key, uv_key = _version_keys(user)
    versions = cache.get_many([gv_key, uv_key])
    gv = int(versions.get(gv_key, 0))
    uv = int(versions.get(uv_key, 0))
    return gv, uv


def _cache_key(user, gv, uv) -> str:
    """Versioned cache anahtarı - global + per-user version."""
    return f"{CACHE_PREFIX}gv{gv}:uv{uv}:{user.pk}"


def _incr_or_set(key, delta=1, timeout=None):
    """Atomik version artırma. Key yoksa oluşturur."""
    try:
        cache.incr(key, delta=delta)
    except ValueError:
        # Key mevcut değilse, oluştur
        cache.set(key, delta, timeout=timeout)


def get_cached_user_permissions(user) -> Optional[Set[str]]:
    """
    Kullanıcı izinlerini cache'den alır.
    2 Redis round-trip: get_many (versions) + get (data).
    Cache yoksa veya TTL dolmuşsa None döner.
    RBAC_CACHE_TTL=0 ise cache devre dışıdır.
    """
    if not user or not user.pk or CACHE_TTL <= 0:
        return None
    try:
        gv, uv = _get_versions(user)
        key = _cache_key(user, gv, uv)
        cached = cache.get(key)
        if cached is not None:
            return set(cached) if isinstance(cached, (list, tuple)) else cached
    except Exception as e:
        logger.debug("RBAC cache okuma hatası: %s", e)
    return None


def set_cached_user_permissions(user, permissions: Set[str]) -> None:
    """Kullanıcı izinlerini cache'e yazar. 2 Redis round-trip."""
    if not user or not user.pk or CACHE_TTL <= 0:
        return
    try:
        gv, uv = _get_versions(user)
        key = _cache_key(user, gv, uv)
        cache.set(key, list(permissions), timeout=CACHE_TTL)
    except Exception as e:
        logger.debug("RBAC cache yazma hatası: %s", e)


def invalidate_user_permissions(user) -> None:
    """Tek kullanıcı invalidation - 1 Redis round-trip (atomic incr)."""
    if not user or not user.pk:
        return
    try:
        _, uv_key = _version_keys(user)
        _incr_or_set(uv_key, delta=1, timeout=None)
    except Exception as e:
        logger.debug("RBAC per-user cache version bump hatası: %s", e)


def invalidate_users_with_role(role) -> None:
    """
    Rol/izin değişiminde ilgili rolü taşıyan tüm kullanıcıların cache'ini geçersiz kılar.
    2 Redis round-trip: get_many + set_many (kullanıcı sayısından bağımsız).
    """
    if not role:
        return
    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user_ids = list(User.objects.filter(
            roles=role, is_active=True
        ).values_list('pk', flat=True))

        if not user_ids:
            return

        # Tüm user version'ları tek round-trip ile oku
        uv_keys = [f'{USER_VERSION_PREFIX}{uid}' for uid in user_ids]
        versions = cache.get_many(uv_keys)

        # Her birini 1 artır ve toplu yaz
        updates = {}
        for uid, key in zip(user_ids, uv_keys):
            v = int(versions.get(key, 0))
            updates[key] = v + 1

        cache.set_many(updates, timeout=None)
    except Exception as e:
        logger.debug("RBAC role-based cache invalidation hatası: %s", e)


def bump_cache_version() -> None:
    """Cache version artır; tüm mevcut user_perms key'leri otomatik geçersiz kalır.
    1 Redis round-trip (atomic incr)."""
    try:
        _incr_or_set(VERSION_KEY, delta=1, timeout=None)
    except Exception as e:
        logger.debug("RBAC cache version bump hatası: %s", e)


def invalidate_all_permission_cache() -> None:
    """Tüm RBAC izin cache'ini temizler (version bump)."""
    bump_cache_version()
