"""
Celery Beat görev kataloğu — Monitor ve ayar arayüzleri için ortak metadata.

Zamanlama backend/config/celery_beat_schedule.py ile aynı env anahtarlarını kullanır.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class BeatJobSpec:
    beat_key: str
    task_name: str
    title_tr: str
    title_en: str
    desc_tr: str
    desc_en: str
    schedule_kind: Literal["crontab", "minutes", "seconds"]
    hour_key: str = ""
    minute_key: str = ""
    default_hour: int = 0
    default_minute: int = 0
    interval_key: str = ""
    default_interval: int = 1


BEAT_JOBS: tuple[BeatJobSpec, ...] = (
    BeatJobSpec(
        "cleanup-redis-stale-keys",
        "core.tasks.cleanup_redis_stale_keys",
        "Redis asılı anahtar temizliği",
        "Redis stale key cleanup",
        "Celery meta, eski cache nesilleri, TTL'siz channel anahtarları",
        "Celery meta, old cache generations, channel keys without TTL",
        "crontab",
        hour_key="BEAT_REDIS_CLEANUP_HOUR",
        minute_key="BEAT_REDIS_CLEANUP_MINUTE",
        default_hour=2,
        default_minute=30,
    ),
    BeatJobSpec(
        "cleanup-reservations-nightly",
        "apps.inventory.tasks.cleanup_expired_reservations",
        "Süresi dolmuş stok ayırmaları",
        "Expired stock holds cleanup",
        "STOCK_RESERVATION_EXPIRY_HOURS sonrası RESERVED → RELEASED",
        "Marks stale RESERVED holds as RELEASED after STOCK_RESERVATION_EXPIRY_HOURS",
        "crontab",
        hour_key="BEAT_CLEANUP_RESERVATIONS_HOUR",
        minute_key="BEAT_CLEANUP_RESERVATIONS_MINUTE",
        default_hour=3,
        default_minute=0,
    ),
    BeatJobSpec(
        "rollup-product-station-timing-nightly",
        "apps.orders.tasks.roll_up_product_station_timing_stats",
        "Smart Firing EMA rollup",
        "Smart Firing EMA rollup",
        "Ürün/istasyon pişirme süresi istatistikleri",
        "Product/station prep time statistics",
        "crontab",
        hour_key="BEAT_ROLLUP_PRODUCT_STATION_TIMING_HOUR",
        minute_key="BEAT_ROLLUP_PRODUCT_STATION_TIMING_MINUTE",
        default_hour=3,
        default_minute=15,
    ),
    BeatJobSpec(
        "sync-printer-statuses-periodically",
        "apps.printing.tasks.sync_all_printer_statuses",
        "Yazıcı durum senkronu",
        "Printer status sync",
        "Aktif yazıcıların online/offline kontrolü",
        "Online/offline check for active printers",
        "minutes",
        interval_key="PRINTER_STATUS_SYNC_INTERVAL_MINUTES",
        default_interval=5,
    ),
    BeatJobSpec(
        "maintain-print-job-queue",
        "apps.printing.tasks.maintain_print_job_queue",
        "PrintJob kuyruk bakımı",
        "PrintJob queue maintenance",
        "Eski PENDING yeniden kuyruk, takılı PROCESSING temizliği",
        "Re-queue stale PENDING jobs; fail stuck PROCESSING rows",
        "seconds",
        interval_key="PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS",
        default_interval=30,
    ),
    BeatJobSpec(
        "scan-kitchen-low-stock-nightly",
        "apps.warehouse.tasks.scan_kitchen_low_stock_deficiencies",
        "Mutfak düşük stok taraması",
        "Kitchen low-stock scan",
        "Mutfak deposu minimum seviye uyarıları",
        "Minimum level alerts for kitchen warehouse",
        "crontab",
        hour_key="BEAT_SCAN_KITCHEN_LOW_STOCK_HOUR",
        minute_key="BEAT_SCAN_KITCHEN_LOW_STOCK_MINUTE",
        default_hour=4,
        default_minute=0,
    ),
    BeatJobSpec(
        "scan-overdue-purchase-orders-nightly",
        "apps.warehouse.tasks.scan_overdue_purchase_orders_daily",
        "Geciken satın alma siparişi taraması",
        "Overdue purchase order scan",
        "Beklenen tarihi geçmiş açık PO'lar için depo uyarısı",
        "Warehouse alerts for open POs past expected delivery date",
        "crontab",
        hour_key="BEAT_SCAN_OVERDUE_PO_HOUR",
        minute_key="BEAT_SCAN_OVERDUE_PO_MINUTE",
        default_hour=5,
        default_minute=0,
    ),
    BeatJobSpec(
        "scan-expiring-lots-daily",
        "apps.inventory.tasks.scan_expiring_lots_daily",
        "SKT lot taraması",
        "Expiry lot scan",
        "Son kullanma tarihi risk lotları",
        "Lots nearing or past expiry",
        "crontab",
        hour_key="BEAT_SCAN_EXPIRING_LOTS_HOUR",
        minute_key="BEAT_SCAN_EXPIRING_LOTS_MINUTE",
        default_hour=4,
        default_minute=30,
    ),
    BeatJobSpec(
        "sweep-stale-cleaning-tables",
        "apps.branches.tasks.sweep_stale_cleaning_tables",
        "Takılı temizlik masaları",
        "Stuck cleaning tables",
        "CLEANING durumunda kalan masaları serbest bırakır",
        "Frees tables stuck in CLEANING state",
        "minutes",
        interval_key="BEAT_SWEEP_STALE_CLEANING_TABLES_INTERVAL_MINUTES",
        default_interval=1,
    ),
    BeatJobSpec(
        "notify-due-reservations",
        "apps.reservations.tasks.notify_due_reservations",
        "Rezervasyon hatırlatması",
        "Reservation reminders",
        "Rezervasyon saati gelen masalar için POS/garson uyarısı",
        "POS/waiter alerts when reservation time arrives",
        "minutes",
        interval_key="BEAT_NOTIFY_DUE_RESERVATIONS_INTERVAL_MINUTES",
        default_interval=1,
    ),
    BeatJobSpec(
        "cancel-overdue-prep-tasks",
        "apps.prep.tasks.cancel_overdue_prep_tasks",
        "Süresi geçmiş hazırlık görevleri temizliği",
        "Cancel overdue prep tasks",
        "Deadline'ı geçmiş PENDING/IN_PROGRESS görevleri CANCELLED yapar",
        "Cancels PENDING/IN_PROGRESS prep tasks past their deadline",
        "minutes",
        interval_key="BEAT_CANCEL_OVERDUE_PREP_TASKS_INTERVAL_MINUTES",
        default_interval=15,
    ),
    BeatJobSpec(
        "auto-close-active-tables-nightly",
        "apps.orders.tasks.auto_close_active_tables_task",
        "Masaları otomatik kapat",
        "Auto close active tables",
        "Hesabı kapanmamış masaları otomatik olarak kapatır",
        "Automatically closes tables with unclosed accounts",
        "crontab",
        hour_key="BEAT_AUTO_CLOSE_TABLES_HOUR",
        minute_key="BEAT_AUTO_CLOSE_TABLES_MINUTE",
        default_hour=2,
        default_minute=0,
    ),
    BeatJobSpec(
        "purge-expired-86-nightly",
        "apps.production_planning.tasks.purge_expired_product_day_availability",
        "Geçmiş Ürün Kalmadı (86) temizliği",
        "Purge expired out-of-stock (86) records",
        "Bugün hariç geçmiş 86 kayıtlarını siler; BEAT_PURGE_EXPIRED_86_ENABLED ile açılır",
        "Deletes past 86 records except today; gated by BEAT_PURGE_EXPIRED_86_ENABLED",
        "crontab",
        hour_key="BEAT_PURGE_EXPIRED_86_HOUR",
        minute_key="BEAT_PURGE_EXPIRED_86_MINUTE",
        default_hour=5,
        default_minute=0,
    ),
    BeatJobSpec(
        "repair-orphan-deficiency-reports-nightly",
        "apps.warehouse.tasks.repair_orphan_deficiency_reports",
        "Eksik listesi yetim kayıt onarımı",
        "Orphan deficiency report repair",
        "ORDERED ama PO'su olmayan veya bayat açık eksik listelerini onarır/siler",
        "Repairs ORDERED reports without PO or stale open deficiency reports",
        "crontab",
        hour_key="BEAT_DEFICIENCY_REPAIR_HOUR",
        minute_key="BEAT_DEFICIENCY_REPAIR_MINUTE",
        default_hour=4,
        default_minute=45,
    ),
)


def env_int(
    values: dict[str, str],
    key: str,
    default: int,
    *,
    min_value: int | None = None,
    max_value: int | None = None,
) -> int:
    raw = values.get(key, "").strip()
    if not raw:
        value = default
    else:
        try:
            value = int(raw)
        except ValueError:
            value = default
    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


def format_job_schedule(spec: BeatJobSpec, values: dict[str, str], *, lang: str = "tr") -> str:
    tr = lang == "tr"
    if spec.schedule_kind == "crontab":
        hour = env_int(values, spec.hour_key, spec.default_hour, min_value=0, max_value=23)
        minute = env_int(values, spec.minute_key, spec.default_minute, min_value=0, max_value=59)
        if tr:
            return f"Her gün {hour}:{minute:02d} (Europe/Istanbul)"
        return f"Daily at {hour}:{minute:02d} (Europe/Istanbul)"
    if spec.schedule_kind == "minutes":
        every = env_int(values, spec.interval_key, spec.default_interval, min_value=1)
        if tr:
            return f"Her {every} dakikada"
        return f"Every {every} minute(s)"
    every = env_int(values, spec.interval_key, spec.default_interval, min_value=1)
    if tr:
        return f"Her {every} saniyede"
    return f"Every {every} second(s)"


def job_title(spec: BeatJobSpec, *, lang: str = "tr") -> str:
    return spec.title_tr if lang == "tr" else spec.title_en


def job_description(spec: BeatJobSpec, *, lang: str = "tr") -> str:
    return spec.desc_tr if lang == "tr" else spec.desc_en
