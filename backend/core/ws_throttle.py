"""WebSocket yayınları için şube/kanal bazlı throttle ve birleştirme (asyncio-native scheduler).

Eski threading.Timer yaklaşımı yerine tek bir arka plan thread'inde
çalışan asyncio event loop'u kullanır. Bu sayede:
- Her throttle için yeni thread oluşturulmaz (thread churn yok)
- Tek scheduler thread, tek event loop
- Sync run() callback'leri thread pool executor'da çalışır
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import threading
from typing import Callable

from django.core.cache import cache

logger = logging.getLogger(__name__)

_KDS_STATS_THROTTLE_SECONDS = float(os.environ.get("WS_KDS_STATS_THROTTLE_SECONDS", "2"))
# WS bağlantı rate limit (bkz. check_ws_connection_throttle)
_WS_CONN_MAX_PER_MINUTE = int(os.environ.get("WS_CONN_MAX_PER_MINUTE", "20"))
# Maksimum eşzamanlı pending task sayısı.
# Bu limit aşılırsa en eski task iptal edilir.
_MAX_PENDING_TIMERS = int(os.environ.get("WS_MAX_PENDING_TIMERS", "1000"))

# ── Asyncio scheduler (tek thread, tek event loop) ──────────────

_scheduler_loop: asyncio.AbstractEventLoop | None = None
_scheduler_thread: threading.Thread | None = None
_scheduler_lock = threading.Lock()


def _ensure_scheduler() -> asyncio.AbstractEventLoop:
    """İlk çağrıda scheduler thread'ini ve event loop'u başlatır."""
    global _scheduler_loop, _scheduler_thread
    if _scheduler_loop is not None:
        return _scheduler_loop
    with _scheduler_lock:
        if _scheduler_loop is not None:
            return _scheduler_loop
        _scheduler_loop = asyncio.new_event_loop()
        _scheduler_thread = threading.Thread(
            target=_scheduler_loop.run_forever,
            daemon=True,
            name="ws-throttle-scheduler",
        )
        _scheduler_thread.start()
        logger.info(
            "WS throttle scheduler started (thread=%s tid=%d)",
            _scheduler_thread.name, _scheduler_thread.native_id,
        )
    return _scheduler_loop


# ── Pending task takibi (sadece scheduler thread'inden erişilir) ─

_pending_tasks: dict[str, asyncio.Task] = {}


def _cleanup_task(timer_key: str, completed_task: asyncio.Task) -> None:
    """Task tamamlanınca sözlükten temizle (sadece hâlâ kayıtlıysa).

    NOT: `_schedule()` eski task'i iptal edip yerine yenisini koyar.
    Eski task'in done callback'i, 'timer_key' hâlâ eski task'a
    işaret ediyorsa çalışır. Eğer yeni bir task gelmişse, dokunmaz.
    """
    current = _pending_tasks.get(timer_key)
    if current is completed_task:
        _pending_tasks.pop(timer_key, None)


# ── Anahtar yardımcıları ────────────────────────────────────────


def _throttle_key(prefix: str, branch_id: str) -> str:
    return f"ws:throttle:{prefix}:{branch_id}"


def _pending_key(prefix: str, branch_id: str) -> str:
    return f"ws:pending:{prefix}:{branch_id}"


def _run_db_safe(callback: Callable[[], None]) -> None:
    """Thread pool callback'lerinde stale/kapalı Django DB oturumunu yeniler."""
    from django.db import close_old_connections, connection

    from core.postgres_connection import resolve_postgres_conn_max_age

    close_old_connections()
    try:
        callback()
    finally:
        close_old_connections()
        if resolve_postgres_conn_max_age() == 0:
            connection.close()


# ── Ana throttle fonksiyonu (sync, geriye uyumlu) ───────────────


def throttle_coalesced(
    prefix: str,
    branch_id: str,
    *,
    throttle_seconds: float | None = None,
    run: Callable[[], None],
) -> None:
    """
    ``run`` en fazla ``throttle_seconds`` aralığında bir kez çalışır.

    Pencere içinde gelen ek çağrılar ``pending`` işaretler; pencere bitince
    bir kez daha çalıştırılır.

    Thread-safe. Scheduling asyncio-native scheduler thread üzerinde yapılır.
    ``run`` callback'i thread pool executor'da çalışır (bloklamaz).
    """
    bid = str(branch_id).strip()
    if not bid:
        return

    window = throttle_seconds if throttle_seconds is not None else _KDS_STATS_THROTTLE_SECONDS
    tkey = _throttle_key(prefix, bid)
    pkey = _pending_key(prefix, bid)

    if cache.get(tkey):
        cache.set(pkey, 1, timeout=max(int(window * 3), 5))
        return

    try:
        run()
    except Exception:
        logger.exception("WS throttle run failed (prefix=%s branch_id=%s)", prefix, bid)
        return

    cache.set(tkey, 1, timeout=max(int(window), 1))
    _schedule_flush(prefix, bid, window, run)


# ── Async scheduler ─────────────────────────────────────────────


def _schedule_flush(
    prefix: str,
    branch_id: str,
    window: float,
    run: Callable[[], None],
) -> None:
    """Scheduler thread'inde bir flush task'ı programlar."""
    loop = _ensure_scheduler()
    timer_key = f"{prefix}:{branch_id}"

    async def _flush() -> None:
        """Flush: sleep sonrası pending kontrolü ve callback çalıştırma.

        NOT: ``_pending_tasks`` temizliği ``_cleanup_task`` done callback'i
        tarafından yapılır. Burada dokunulmaz, çünkü araya yeni bir task
        girmiş olabilir (callback identity kontrolü yapar).
        """
        try:
            await asyncio.sleep(window)

            pkey = _pending_key(prefix, branch_id)
            tkey = _throttle_key(prefix, branch_id)

            if not cache.get(pkey):
                return
            cache.delete(pkey)
            if cache.get(tkey):
                return

            # Sync callback'i thread pool'da çalıştır (scheduler'ı bloklama)
            current_loop = asyncio.get_running_loop()
            await current_loop.run_in_executor(None, lambda: _run_db_safe(run))

            cache.set(tkey, 1, timeout=max(int(window), 1))
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception(
                "WS throttle flush failed (prefix=%s branch_id=%s)",
                prefix, branch_id,
            )

    async def _schedule() -> None:
        # Önceki task varsa iptal et
        existing = _pending_tasks.pop(timer_key, None)
        if existing is not None and not existing.done():
            existing.cancel()

        # Timer limit aşımı kontrolü: en eski task'ı temizle
        if len(_pending_tasks) >= _MAX_PENDING_TIMERS:
            try:
                oldest_key = next(iter(_pending_tasks))
                oldest = _pending_tasks.pop(oldest_key)
                if not oldest.done():
                    oldest.cancel()
                    logger.warning(
                        "WS throttle limit aşıldı (%d). En eski task iptal edildi: %s",
                        _MAX_PENDING_TIMERS, oldest_key,
                    )
            except (StopIteration, RuntimeError):
                pass

        # Yeni task oluştur
        task = asyncio.create_task(_flush())
        _pending_tasks[timer_key] = task
        task.add_done_callback(lambda t: _cleanup_task(timer_key, t))

    # Scheduler thread'inde programla
    asyncio.run_coroutine_threadsafe(_schedule(), loop)


# ── WS bağlantı rate limit (async) ──────────────────────────────


def _ws_client_key(scope: dict) -> str:
    """
    WS istemci kimliği: IP adresi veya JWT user_id (kimliği doğrulanmışsa).

    Öncelik:
    1. JWT doğrulaması yapılmış kullanıcı ID'si (scope['user'] varsa)
    2. İstemci IP adresi (scope['client'])
    3. Bilinmiyorsa 'unknown'
    """
    user = scope.get('user')
    if user and user.is_authenticated:
        return f"user:{user.id}"
    client_info = scope.get('client')
    if client_info and len(client_info) > 0:
        ip = client_info[0]
        return f"ip:{ip}"
    return "unknown"


async def check_ws_connection_throttle(
    scope: dict, max_connections: int | None = None, window_seconds: int = 60
) -> bool:
    """
    WS bağlantı rate limit kontrolü.

    Bir istemci (IP veya kullanıcı) belirtilen zaman penceresinde
    max_connections'dan fazla bağlantı açamaz.

    Args:
        scope: Channels connection scope
        max_connections: Maksimum bağlantı sayısı (None=ortam değişkeninden okur)
        window_seconds: Zaman penceresi saniye (varsayılan: 60)

    Returns:
        True if allowed, False if rate limited.
    """
    from django.core.cache import cache

    if max_connections is None:
        max_connections = _WS_CONN_MAX_PER_MINUTE

    client_key = _ws_client_key(scope)
    cache_key = f"ws:conn_rate:{hashlib.sha256(client_key.encode()).hexdigest()[:16]}"

    try:
        current = cache.get(cache_key, 0)
        if current >= max_connections:
            logger.warning(
                "WS rate limit tetiklendi: key=%s current=%d max=%d",
                cache_key, current, max_connections,
            )
            return False
        # Pipeline ile atomic increment
        cache.set(cache_key, current + 1, timeout=window_seconds)
        return True
    except Exception:
        # Cache hatası durumunda bağlantıya izin ver (fail-open)
        return True
