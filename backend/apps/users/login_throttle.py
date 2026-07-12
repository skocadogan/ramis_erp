"""
Login rate limit (DRF LoginRateThrottle) önbellek yardımcıları.

DRF `LoginRateThrottle` anahtarları: throttle_login_<client_ip>
Paylaşılan endpoint'ler: /auth/token/, /auth/check-pin/, /auth/token/pin/
"""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache


class LoginThrottleClearError(Exception):
    """clear_login_throttle çağrısı geçersiz veya desteklenmiyor."""


def _redis_client():
    try:
        return cache._cache.get_client()  # type: ignore[attr-defined]
    except AttributeError:
        return None


def clear_login_throttle_keys(*, ip: str | None = None) -> list[str]:
    """Throttle kayıtlarını sil; silinen Redis/cache anahtarlarını döndür."""
    deleted: list[str] = []
    client = _redis_client()

    if client is not None:
        pattern = f"*throttle_login_{ip}*" if ip else "*throttle_login_*"
        for raw_key in client.scan_iter(match=pattern, count=200):
            key = raw_key.decode() if isinstance(raw_key, bytes) else str(raw_key)
            client.delete(raw_key)
            deleted.append(key)
        return deleted

    if ip:
        plain = f"throttle_login_{ip}"
        if cache.delete(plain):
            deleted.append(plain)
        return deleted

    backend = settings.CACHES.get("default", {}).get("BACKEND", "")
    raise LoginThrottleClearError(
        f"Redis yok ({backend}) — tüm kayıtlar için --all desteklenmez. "
        "Belirli IP ile deneyin veya uvicorn/daphne yeniden başlatın."
    )


def clear_login_throttle(*, ip: str | None = None, clear_all: bool = False) -> list[str]:
    if not ip and not clear_all:
        raise LoginThrottleClearError("IP veya clear_all gerekli")
    if ip and clear_all:
        raise LoginThrottleClearError("IP ve clear_all birlikte kullanılamaz")
    return clear_login_throttle_keys(ip=ip if not clear_all else None)
