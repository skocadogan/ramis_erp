"""
Yazıcı başına ESC/POS gönderimini serileştirir.

Üretimde (DEBUG=False) Redis (REDIS_LOCK_URL) ile dağıtık kilit; yoksa veya redis
paketi yoksa iş parçacığı kilidi (tek Celery worker süreci).

Geliştirmede (DEBUG=True) her zaman iş parçacığı kilidi — yerel makinede Redis
çalışmasını zorunlu kılmaz.
"""

from __future__ import annotations

import logging
import threading
from contextlib import contextmanager

from django.conf import settings

logger = logging.getLogger(__name__)

_thread_locks: dict[str, threading.Lock] = {}
_thread_guard = threading.Lock()


def _local_lock(printer_id: str) -> threading.Lock:
    with _thread_guard:
        if printer_id not in _thread_locks:
            _thread_locks[printer_id] = threading.Lock()
        return _thread_locks[printer_id]


@contextmanager
def printer_escpos_lock(printer_id: str, *, blocking_timeout: float = 300.0, hold_timeout: int = 120):
    """
    Aynı printer_id için eşzamanlı olarak yalnızca bir bağlam bu bloğu çalıştırabilir.
    """
    if getattr(settings, "DEBUG", False):
        lk = _local_lock(printer_id)
        if not lk.acquire(timeout=blocking_timeout):
            raise TimeoutError(f"Yazıcı kilidi alınamadı (yerel timeout): {printer_id}")
        try:
            yield
        finally:
            lk.release()
        return

    lock_url = getattr(settings, "REDIS_LOCK_URL", None) or ""
    lock_url_s = lock_url if isinstance(lock_url, str) else str(lock_url)

    if lock_url_s.startswith("redis://") or lock_url_s.startswith("rediss://"):
        try:
            import redis
        except ImportError:
            redis = None  # noqa: N806
        if redis is not None:
            client = redis.from_url(lock_url_s)
            from redis.lock import Lock

            lock = Lock(
                client,
                name=f"ramis:escpos:printer:{printer_id}",
                timeout=hold_timeout,
                blocking_timeout=blocking_timeout,
            )
            acquired = False
            try:
                acquired = lock.acquire(blocking=True)
                if not acquired:
                    raise TimeoutError(f"Yazıcı kilidi alınamadı (redis): {printer_id}")
                yield
            finally:
                if acquired:
                    try:
                        lock.release()
                    except Exception:  # noqa: BLE001
                        logger.debug("Lock release (redis)", exc_info=True)
            return

    lk = _local_lock(printer_id)
    if not lk.acquire(timeout=blocking_timeout):
        raise TimeoutError(f"Yazıcı kilidi alınamadı (yerel timeout): {printer_id}")
    try:
        yield
    finally:
        lk.release()
