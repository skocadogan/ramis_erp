"""
Redis bakım — asılı kalan / gereksiz anahtarları temizler.

Üç mantıksal DB hedeflenir (settings'teki URL ayrımı):
  - broker (/0): Celery sonuç meta anahtarları
  - cache (/1): Django cache artıkları (RBAC, sipariş sayacı, satış özeti)
  - channels (/2): TTL'siz channels_redis anahtarları

SCAN + pipeline kullanır; KEYS komutu yok.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Iterator

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

SCAN_COUNT = 500

# Django RedisCache sürüm öneki (KEY_PREFIX boş, VERSION=1)
_DJANGO_CACHE_KEY_PREFIX = ":1:"

_PROTECTED_KEY_SUBSTRINGS = frozenset(
    {
        "sales_summary_cache_gen",
        "rbac:perms_version",
    }
)

_BRANCH_ORDER_KEY_RE = re.compile(
    r"branch_order_num:(?P<branch>[^:]+):(?P<day>\d{4}-\d{2}-\d{2})"
)
_RBAC_PERM_KEY_RE = re.compile(r"rbac:user_perms:v(?P<version>\d+):")
_SALES_SUMMARY_KEY_RE = re.compile(r"sales_summary_(?P<gen>\d+)_")


@dataclass
class RedisTargetStats:
    scanned: int = 0
    deleted: int = 0
    skipped_protected: int = 0
    errors: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "scanned": self.scanned,
            "deleted": self.deleted,
            "skipped_protected": self.skipped_protected,
            "errors": self.errors,
        }


@dataclass
class RedisMaintenanceReport:
    skipped: bool = False
    reason: str = ""
    broker: RedisTargetStats = field(default_factory=RedisTargetStats)
    cache: RedisTargetStats = field(default_factory=RedisTargetStats)
    channels: RedisTargetStats = field(default_factory=RedisTargetStats)

    def to_dict(self) -> dict[str, Any]:
        if self.skipped:
            return {"skipped": True, "reason": self.reason}
        return {
            "skipped": False,
            "broker": self.broker.to_dict(),
            "cache": self.cache.to_dict(),
            "channels": self.channels.to_dict(),
            "total_deleted": self.broker.deleted + self.cache.deleted + self.channels.deleted,
        }


def _redis_enabled() -> bool:
    return bool(getattr(settings, "REDIS_URL", "") or getattr(settings, "REDIS_BROKER_URL", ""))


def _make_client(url: str):
    if not url:
        return None
    try:
        import redis
    except ImportError:
        logger.warning("redis paketi yok; bakım atlandı")
        return None
    return redis.from_url(url, decode_responses=False)


def _decode_key(raw: bytes | str) -> str:
    if isinstance(raw, bytes):
        return raw.decode("utf-8", errors="replace")
    return str(raw)


def _is_protected(key: str) -> bool:
    return any(fragment in key for fragment in _PROTECTED_KEY_SUBSTRINGS)


def _scan_keys(client, match: str) -> Iterator[str]:
    cursor = 0
    while True:
        cursor, keys = client.scan(cursor=cursor, match=match, count=SCAN_COUNT)
        for raw in keys:
            yield _decode_key(raw)
        if cursor == 0:
            break


def _delete_keys(client, keys: list[str], stats: RedisTargetStats, *, dry_run: bool) -> None:
    if not keys:
        return
    stats.deleted += len(keys)
    if dry_run:
        return
    try:
        pipe = client.pipeline(transaction=False)
        for key in keys:
            pipe.delete(key)
        pipe.execute()
    except Exception:
        stats.errors += 1
        stats.deleted -= len(keys)
        logger.exception("Redis anahtar silme hatası (%d anahtar)", len(keys))


def _flush_batch(
    client,
    batch: list[str],
    stats: RedisTargetStats,
    *,
    dry_run: bool,
    batch_size: int = 200,
) -> None:
    while len(batch) >= batch_size:
        chunk = batch[:batch_size]
        del batch[:batch_size]
        _delete_keys(client, chunk, stats, dry_run=dry_run)


def _clean_celery_result_meta(client, stats: RedisTargetStats, *, dry_run: bool) -> None:
    """Broker DB — celery-task-meta-* (ignore_result=True olsa da birikebilir)."""
    batch: list[str] = []
    for key in _scan_keys(client, "celery-task-meta-*"):
        stats.scanned += 1
        batch.append(key)
        _flush_batch(client, batch, stats, dry_run=dry_run)
    _delete_keys(client, batch, stats, dry_run=dry_run)


def _clean_celery_result_meta_by_idle(
    client,
    stats: RedisTargetStats,
    *,
    dry_run: bool,
    max_idle_seconds: int,
) -> None:
    """OBJECT IDLETIME destekleyen broker'larda eski meta anahtarları."""
    batch: list[str] = []
    for key in _scan_keys(client, "celery-task-meta-*"):
        stats.scanned += 1
        try:
            idle = client.object("idletime", key)
            if idle is not None and int(idle) >= max_idle_seconds:
                batch.append(key)
        except Exception:
            batch.append(key)
        _flush_batch(client, batch, stats, dry_run=dry_run)
    _delete_keys(client, batch, stats, dry_run=dry_run)


def _current_rbac_version() -> int:
    from django.core.cache import cache

    from rbac.cache import VERSION_KEY

    try:
        value = cache.get(VERSION_KEY)
        return int(value) if value is not None else 0
    except Exception:
        return 0


def _current_sales_summary_generation() -> int:
    from django.core.cache import cache

    from apps.sales.services import SALES_SUMMARY_CACHE_GEN_KEY

    try:
        value = cache.get(SALES_SUMMARY_CACHE_GEN_KEY)
        return int(value) if value is not None else 0
    except Exception:
        return 0


def _clean_cache_db(
    client,
    stats: RedisTargetStats,
    *,
    dry_run: bool,
    order_counter_retention_days: int,
    rbac_versions_to_keep: int,
    sales_generations_to_keep: int,
) -> None:
    cutoff_day = timezone.localdate() - timedelta(days=order_counter_retention_days)
    rbac_floor = max(0, _current_rbac_version() - max(rbac_versions_to_keep - 1, 0))
    sales_floor = max(0, _current_sales_summary_generation() - max(sales_generations_to_keep - 1, 0))

    batch: list[str] = []
    for key in _scan_keys(client, f"*{_DJANGO_CACHE_KEY_PREFIX}*"):
        stats.scanned += 1
        if _is_protected(key):
            stats.skipped_protected += 1
            continue

        logical = key.split(_DJANGO_CACHE_KEY_PREFIX, 1)[-1] if _DJANGO_CACHE_KEY_PREFIX in key else key

        if logical.startswith("branch_order_num:"):
            match = _BRANCH_ORDER_KEY_RE.search(logical)
            if match:
                try:
                    key_day = date.fromisoformat(match.group("day"))
                except ValueError:
                    continue
                if key_day < cutoff_day:
                    batch.append(key)
            continue

        rbac_match = _RBAC_PERM_KEY_RE.search(logical)
        if rbac_match:
            version = int(rbac_match.group("version"))
            if version < rbac_floor:
                batch.append(key)
            continue

        sales_match = _SALES_SUMMARY_KEY_RE.match(logical)
        if sales_match:
            generation = int(sales_match.group("gen"))
            if generation < sales_floor:
                batch.append(key)
            continue

        # Eski anahtar biçimi (nesil sürümü öncesi): sales_summary_all_* / sales_summary_{branch}_*
        if logical.startswith("sales_summary_all_"):
            batch.append(key)
        elif logical.startswith("sales_summary_") and not _SALES_SUMMARY_KEY_RE.match(logical):
            batch.append(key)

        _flush_batch(client, batch, stats, dry_run=dry_run)

    _delete_keys(client, batch, stats, dry_run=dry_run)


def _clean_channels_without_ttl(client, stats: RedisTargetStats, *, dry_run: bool) -> None:
    """channels_redis anahtarları expiry ile yaşar; TTL=-1 olanlar sızıntıdır."""
    batch: list[str] = []
    for key in _scan_keys(client, "asgi:*"):
        stats.scanned += 1
        try:
            ttl = client.ttl(key)
        except Exception:
            stats.errors += 1
            continue
        if ttl == -1:
            batch.append(key)
        _flush_batch(client, batch, stats, dry_run=dry_run)
    _delete_keys(client, batch, stats, dry_run=dry_run)


def run_redis_maintenance(*, dry_run: bool = False) -> dict[str, Any]:
    """
    Tüm Redis hedeflerinde bakım çalıştırır.
    REDIS_MAINTENANCE_ENABLED=False ise atlar.
    """
    if not getattr(settings, "REDIS_MAINTENANCE_ENABLED", True):
        return {"skipped": True, "reason": "REDIS_MAINTENANCE_ENABLED=false"}

    if not _redis_enabled():
        return {"skipped": True, "reason": "redis_not_configured"}

    report = RedisMaintenanceReport()
    max_idle = int(getattr(settings, "REDIS_CELERY_RESULT_MAX_IDLE_SECONDS", 3600))
    order_retention = int(getattr(settings, "REDIS_ORDER_COUNTER_RETENTION_DAYS", 3))
    rbac_keep = int(getattr(settings, "REDIS_RBAC_PERM_VERSIONS_TO_KEEP", 2))
    sales_keep = int(getattr(settings, "REDIS_SALES_SUMMARY_GENERATIONS_TO_KEEP", 3))

    broker_url = getattr(settings, "REDIS_BROKER_URL", "") or getattr(settings, "CELERY_BROKER_URL", "")
    cache_url = getattr(settings, "REDIS_CACHE_URL", "")
    channels_url = getattr(settings, "REDIS_CHANNELS_URL", "")

    broker_client = _make_client(broker_url)
    if broker_client is not None:
        _ensure_lru_policy(broker_client)
        try:
            if max_idle > 0:
                _clean_celery_result_meta_by_idle(
                    broker_client, report.broker, dry_run=dry_run, max_idle_seconds=max_idle
                )
            else:
                _clean_celery_result_meta(broker_client, report.broker, dry_run=dry_run)
        except Exception:
            report.broker.errors += 1
            logger.exception("Redis broker bakım hatası")
        finally:
            broker_client.close()

    cache_client = _make_client(cache_url)
    if cache_client is not None:
        _ensure_lru_policy(cache_client)
        try:
            _clean_cache_db(
                cache_client,
                report.cache,
                dry_run=dry_run,
                order_counter_retention_days=order_retention,
                rbac_versions_to_keep=rbac_keep,
                sales_generations_to_keep=sales_keep,
            )
        except Exception:
            report.cache.errors += 1
            logger.exception("Redis cache bakım hatası")
        finally:
            cache_client.close()

    channels_client = _make_client(channels_url)
    if channels_client is not None and channels_url != cache_url:
        try:
            _clean_channels_without_ttl(channels_client, report.channels, dry_run=dry_run)
        except Exception:
            report.channels.errors += 1
            logger.exception("Redis channels bakım hatası")
        finally:
            channels_client.close()

    result = report.to_dict()
    logger.info("Redis bakım tamamlandı: %s", result)
    return result


def collect_redis_diagnostics() -> dict[str, Any]:
    """Bellek ve anahtar sayısı özeti — optimizasyon önerileri için."""
    if not _redis_enabled():
        return {"available": False, "reason": "redis_not_configured"}

    diagnostics: dict[str, Any] = {"available": True, "targets": {}}
    targets: list[tuple[str, str]] = [
        ("broker", getattr(settings, "REDIS_BROKER_URL", "") or getattr(settings, "CELERY_BROKER_URL", "")),
        ("cache", getattr(settings, "REDIS_CACHE_URL", "")),
        ("channels", getattr(settings, "REDIS_CHANNELS_URL", "")),
    ]

    for name, url in targets:
        if not url:
            continue
        client = _make_client(url)
        if client is None:
            continue
        try:
            info = client.info(section="memory")
            keyspace = client.info(section="keyspace")
            db_stats: dict[str, Any] = {
                "used_memory_human": info.get("used_memory_human"),
                "used_memory_peak_human": info.get("used_memory_peak_human"),
                "maxmemory_human": info.get("maxmemory_human") or None,
                "maxmemory_policy": info.get("maxmemory_policy"),
            }
            for db_key, db_val in (keyspace or {}).items():
                if isinstance(db_val, dict):
                    db_stats[db_key] = db_val
            diagnostics["targets"][name] = db_stats
        except Exception as exc:
            diagnostics["targets"][name] = {"error": str(exc)}
        finally:
            client.close()

    diagnostics["recommendations"] = _build_recommendations(diagnostics)
    return diagnostics


def _parse_connected_at(connected_at_str: str | None) -> Any | None:
    """ISO format connected_at string'ini timezone-aware datetime'a çevirir."""
    if not connected_at_str:
        return None
    try:
        dt = timezone.datetime.fromisoformat(connected_at_str)
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_default_timezone())
        return dt
    except (ValueError, TypeError):
        return None


def clean_stale_pos_connections(*, dry_run: bool = False, max_hours: int = 24) -> dict[str, Any]:
    """
    POS terminal WebSocket bağlantı cache'inde asılı kalmış kayıtları temizler.

    ``pos_connections_{terminal_id}`` anahtarlarındaki ``connected_at`` değeri
    ``max_hours`` saatten eski olan girişleri kaldırır. Tüm girişler eskiyse
    cache anahtarını tamamen siler.

    Parameters
    ----------
    dry_run: Silme yapmadan sadece tarama yap.
    max_hours: connected_at'i bu saat kadar eski olan kayıtları temizle.

    Returns
    -------
    İstatistik sözlüğü: scanned, cleaned, deleted_keys, errors.
    """
    from django.core.cache import cache as django_cache

    cache_url = getattr(settings, "REDIS_CACHE_URL", "")
    if not cache_url:
        return {"skipped": True, "reason": "cache_not_configured"}

    client = _make_client(cache_url)
    if client is None:
        return {"skipped": True, "reason": "redis_unavailable"}

    cutoff = timezone.now() - timedelta(hours=max_hours)
    stats: dict[str, Any] = {"scanned": 0, "cleaned": 0, "deleted_keys": 0, "errors": 0}

    try:
        for raw_key in _scan_keys(client, "*pos_connections_*"):
            stats["scanned"] += 1
            decoded = _decode_key(raw_key)

            # Django cache version prefix'ini temizle (örn. ":1:pos_connections_1")
            cache_key = decoded
            if _DJANGO_CACHE_KEY_PREFIX in cache_key:
                cache_key = cache_key.split(_DJANGO_CACHE_KEY_PREFIX, 1)[-1]

            try:
                connections = django_cache.get(cache_key, {})
                if not isinstance(connections, dict) or not connections:
                    continue

                before = len(connections)
                fresh = {}
                for ch, data in connections.items():
                    if not isinstance(data, dict):
                        continue
                    connected_at = _parse_connected_at(data.get("connected_at"))
                    if connected_at is None or connected_at >= cutoff:
                        fresh[ch] = data
                    # connected_at yoksa veya cutoff öncesiyse → atla (temizle)

                after = len(fresh)

                if after == 0 and before > 0:
                    if not dry_run:
                        django_cache.delete(cache_key)
                    stats["deleted_keys"] += 1
                    stats["cleaned"] += before
                elif after < before:
                    if not dry_run:
                        django_cache.set(cache_key, fresh, timeout=86400)
                    stats["cleaned"] += before - after
            except Exception:
                stats["errors"] += 1
                logger.exception("POS bağlantı temizleme hatası: key=%s", cache_key)

        logger.info("POS bağlantı temizliği tamamlandı: %s", stats)
        return stats
    except Exception:
        logger.exception("POS bağlantı temizleme tarama hatası")
        raise
    finally:
        client.close()


def _ensure_lru_policy(client) -> bool:
    """
    Redis maxmemory-policy 'noeviction' ise 'allkeys-lru' olarak değiştirir.

    noeviction: bellek dolunca yazma hataları → WS bağlantıları kopar, Celery task gönderilemez.
    allkeys-lru: eski anahtarları otomatik temizler, sistem çökmez.

    Returns:
        True if policy was changed, False otherwise.
    """
    try:
        current_raw = client.config_get('maxmemory-policy')
        current = current_raw.get('maxmemory-policy') if isinstance(current_raw, dict) else str(current_raw)
        if current and 'noeviction' in current.lower():
            client.config_set('maxmemory-policy', 'allkeys-lru')
            logger.warning(
                'Redis maxmemory-policy noeviction → allkeys-lru olarak değiştirildi. '
                'Bellek dolunca Redis en eski anahtarları otomatik siler.'
            )
            return True
        if current and 'lru' not in current.lower() and 'lfu' not in current.lower():
            logger.info(
                'Redis maxmemory-policy=%s (LRU/LFU değil). Önerilen: allkeys-lru',
                current
            )
        return False
    except Exception:
        logger.exception("Redis maxmemory-policy okunurken/değiştirilirken hata")
        return False


def _build_recommendations(diagnostics: dict[str, Any]) -> list[str]:
    recs: list[str] = []

    if getattr(settings, "CELERY_RESULT_BACKEND", None) == getattr(settings, "CELERY_BROKER_URL", None):
        recs.append(
            "CELERY result backend broker ile aynı DB (/0); CELERY_RESULT_EXPIRES düşük tutulmalı "
            "veya ayrı DB kullanılmalı."
        )

    if not getattr(settings, "CELERY_RESULT_EXPIRES", None):
        recs.append("CELERY_RESULT_EXPIRES tanımlı değil; celery-task-meta-* anahtarları birikebilir.")

    for target in diagnostics.get("targets", {}).values():
        if not isinstance(target, dict):
            continue
        policy = target.get("maxmemory_policy")
        if policy == "noeviction":
            recs.append(
                "Redis maxmemory-policy=noeviction: bellek dolunca yazma hataları oluşur; "
                "cache DB için allkeys-lru veya volatile-lru önerilir."
            )
            break

    channel_expiry = int(getattr(settings, "CHANNEL_LAYER_EXPIRY", 120))
    if channel_expiry > 600:
        recs.append(
            f"CHANNEL_LAYER_EXPIRY={channel_expiry}s yüksek; channels DB bellek kullanımını artırır."
        )

    return recs
