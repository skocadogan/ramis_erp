"""Field metadata and service restart hints for Ramis env settings."""

from __future__ import annotations

from dataclasses import dataclass


def parse_time_of_day(value: str) -> tuple[int, int] | None:
    """SS:DD veya S:DD → (saat, dakika). Geçersiz girişte None."""
    text = (value or "").strip()
    if not text:
        return None
    if ":" in text:
        hour_part, minute_part = text.split(":", 1)
    elif text.isdigit() and len(text) in (3, 4):
        hour_part, minute_part = text[:-2], text[-2:]
    else:
        return None
    try:
        hour = int(hour_part.strip())
        minute = int(minute_part.strip())
    except ValueError:
        return None
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour, minute


def format_time_of_day(hour: int, minute: int) -> str:
    return f"{hour}:{minute:02d}"


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label_tr: str
    label_en: str
    field_type: str  # text | password | bool | int | time
    group: str
    hint_tr: str = ""
    hint_en: str = ""
    default: str = ""
    min_value: int | None = None
    max_value: int | None = None
    hour_key: str = ""
    minute_key: str = ""
    default_time: str = ""


BACKEND_CORE_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec("DJANGO_DEBUG", "Hata ayıklama (DEBUG)", "Debug mode", "bool", "security"),
    FieldSpec(
        "DJANGO_SECRET_KEY",
        "Django gizli anahtar",
        "Django secret key",
        "password",
        "security",
        hint_tr="Üretimde openssl rand -hex 48 ile üretin.",
        hint_en="Use openssl rand -hex 48 in production.",
    ),
    FieldSpec(
        "ALLOWED_HOSTS",
        "İzin verilen host'lar",
        "Allowed hosts",
        "text",
        "security",
        hint_tr="Virgülle ayrılmış (boşluksuz).",
        hint_en="Comma-separated, no spaces.",
    ),
    FieldSpec("CSRF_TRUSTED_ORIGINS", "CSRF güvenilir origin'ler", "CSRF trusted origins", "text", "security"),
    FieldSpec("CORS_EXTRA_ORIGINS", "Ek CORS origin'leri", "Extra CORS origins", "text", "security"),
    FieldSpec("SECURE_SSL_REDIRECT", "HTTPS yönlendirme", "SSL redirect", "bool", "security"),
    FieldSpec("SECURE_HSTS_SECONDS", "HSTS süresi (sn)", "HSTS seconds", "int", "security", min_value=0),
    FieldSpec("SECURE_HSTS_INCLUDE_SUBDOMAINS", "HSTS alt domain", "HSTS include subdomains", "bool", "security"),
    FieldSpec("SECURE_HSTS_PRELOAD", "HSTS preload", "HSTS preload", "bool", "security"),
    FieldSpec("POSTGRES_DB", "Veritabanı adı", "Database name", "text", "postgres"),
    FieldSpec("POSTGRES_USER", "Veritabanı kullanıcısı", "Database user", "text", "postgres"),
    FieldSpec("POSTGRES_PASSWORD", "Veritabanı parolası", "Database password", "password", "postgres"),
    FieldSpec("POSTGRES_HOST", "Veritabanı sunucusu", "Database host", "text", "postgres"),
    FieldSpec("POSTGRES_PORT", "Veritabanı portu", "Database port", "int", "postgres", min_value=1, max_value=65535),
    FieldSpec("POSTGRES_CONNECT_TIMEOUT", "Bağlantı zaman aşımı (sn)", "Connect timeout (s)", "int", "postgres", min_value=1),
    FieldSpec(
        "POSTGRES_CONN_MAX_AGE",
        "Kalıcı bağlantı süresi (sn); split ASGI'de 0",
        "Conn max age (s); 0 for split ASGI",
        "int",
        "postgres",
        min_value=0,
        hint_tr="Uvicorn+Daphne ayrı süreçlerde 0 önerilir (varsayılan otomatik).",
        hint_en="Use 0 with separate Uvicorn+Daphne processes (auto default).",
    ),
    FieldSpec("REDIS_URL", "Redis URL (broker)", "Redis URL (broker)", "text", "redis"),
    FieldSpec("REDIS_CACHE_URL", "Redis cache URL", "Redis cache URL", "text", "redis"),
    FieldSpec("REDIS_CHANNELS_URL", "Redis Channels URL", "Redis Channels URL", "text", "redis"),
    FieldSpec("REDIS_LOCK_URL", "Redis kilit URL", "Redis lock URL", "text", "redis"),
    FieldSpec("CELERY_BROKER_URL", "Celery broker URL", "Celery broker URL", "text", "redis"),
    FieldSpec("REDIS_SOCKET_CONNECT_TIMEOUT", "Redis bağlantı timeout (sn)", "Redis connect timeout (s)", "int", "redis", min_value=1),
    FieldSpec(
        "REDIS_CHANNELS_SOCKET_TIMEOUT",
        "Channels Redis okuma timeout (sn)",
        "Channels Redis read timeout (s)",
        "int",
        "redis",
        min_value=6,
        default="30",
        hint_tr="channels_redis BRPOP ~5 sn; daha düşük değerlerde WS Timeout reading hatası.",
        hint_en="channels_redis BRPOP ~5s; lower values cause WS timeout reading errors.",
    ),
    FieldSpec(
        "REDIS_MAINTENANCE_ENABLED",
        "Redis gece temizliği",
        "Redis nightly cleanup",
        "bool",
        "redis",
        default="true",
        hint_tr="Kapalıysa cleanup_redis_stale_keys görevi çalışır ama silme yapmaz.",
        hint_en="When off, cleanup_redis_stale_keys runs but performs no deletions.",
    ),
    FieldSpec(
        "REDIS_CELERY_RESULT_MAX_IDLE_SECONDS",
        "Celery meta idle eşiği (sn)",
        "Celery meta idle threshold (s)",
        "int",
        "redis",
        default="3600",
        min_value=0,
        hint_tr="Broker'daki celery-task-meta-* anahtarları bu süreden uzun idle ise silinir. 0 = hepsini sil.",
        hint_en="Deletes celery-task-meta-* keys idle longer than this. 0 = delete all.",
    ),
    FieldSpec(
        "CELERY_RESULT_EXPIRES_SECONDS",
        "Celery sonuç meta TTL (sn)",
        "Celery result meta TTL (s)",
        "int",
        "redis",
        default="3600",
        min_value=60,
        hint_tr="Celery'nin result backend'inde meta anahtarlarının otomatik süresi.",
        hint_en="Automatic expiry for result-backend meta keys.",
    ),
    FieldSpec(
        "REDIS_ORDER_COUNTER_RETENTION_DAYS",
        "Sipariş sayacı saklama (gün)",
        "Order counter retention (days)",
        "int",
        "redis",
        default="3",
        min_value=1,
        hint_tr="branch_order_num:* cache anahtarları bu günden eski olanlar temizlenir.",
        hint_en="Purges branch_order_num:* cache keys older than this many days.",
    ),
    FieldSpec(
        "REDIS_RBAC_PERM_VERSIONS_TO_KEEP",
        "RBAC cache nesil sayısı",
        "RBAC cache generations to keep",
        "int",
        "redis",
        default="2",
        min_value=1,
        hint_tr="Gece temizlikte kaç RBAC izin cache nesli tutulacağı.",
        hint_en="How many RBAC permission cache generations to retain during nightly cleanup.",
    ),
    FieldSpec(
        "REDIS_SALES_SUMMARY_GENERATIONS_TO_KEEP",
        "Satış özeti nesil sayısı",
        "Sales summary generations to keep",
        "int",
        "redis",
        default="3",
        min_value=1,
        hint_tr="Gece temizlikte kaç sales_summary nesli tutulacağı.",
        hint_en="How many sales_summary cache generations to retain during nightly cleanup.",
    ),
    FieldSpec("CHANNEL_LAYER_CAPACITY", "Channel layer kapasitesi", "Channel layer capacity", "int", "websocket", min_value=100),
    FieldSpec("CHANNEL_LAYER_EXPIRY", "Channel mesaj TTL (sn)", "Channel message TTL (s)", "int", "websocket", min_value=1),
    FieldSpec("WS_AUTH_CACHE_SECONDS", "WS auth önbellek (sn)", "WS auth cache (s)", "int", "websocket", min_value=0),
    FieldSpec("WS_KDS_STATS_THROTTLE_SECONDS", "KDS stats throttle (sn)", "KDS stats throttle (s)", "int", "websocket", min_value=0),
    FieldSpec(
        "WS_CONN_MAX_PER_MINUTE",
        "WS bağlantı limiti (/dakika)",
        "WS connection limit (/minute)",
        "int",
        "websocket",
        default="20",
        min_value=1,
        hint_tr="Bir istemcinin (IP/kullanıcı) dakikada yapabileceği maksimum WebSocket bağlantı sayısı. 0 = sınırsız.",
        hint_en="Max WebSocket connections per minute per client (IP/user). 0 = unlimited.",
    ),
    FieldSpec(
        "WS_MAX_PENDING_TIMERS",
        "WS throttle timer limiti",
        "WS throttle timer limit",
        "int",
        "websocket",
        default="1000",
        min_value=100,
        hint_tr="Eşzamanlı throttle timer sayısı üst sınırı. Aşılınca en eski timer iptal edilir. Düşük RAM'de 500'e düşürülebilir.",
        hint_en="Max concurrent throttle timers. Oldest timer is cancelled when exceeded. Lower to 500 on low-RAM systems.",
    ),
    FieldSpec(
        "WS_BYPASS_CELERY",
        "Celery Bypass (Düşük Gecikme)",
        "Bypass Celery (Low Latency)",
        "bool",
        "websocket",
        default="false",
        hint_tr="Açıldığında, POS-KDS-Garson arası WebSocket yayınları Celery kuyruğu yerine doğrudan Redis üzerinden iletilir. Gecikmeyi <10ms seviyesine düşürür.",
        hint_en="When enabled, WebSocket broadcasts between POS-KDS-Waiter bypass Celery and go directly via Redis. Reduces latency to <10ms.",
    ),
    FieldSpec(
        "WS_MENU_CATALOG_THROTTLE_SECONDS",
        "Menü kataloğu broadcast throttle (sn)",
        "Menu catalog broadcast throttle (s)",
        "int",
        "websocket",
        default="5",
        min_value=1,
        max_value=30,
        hint_tr="Menü değişikliklerinde tüm şubelere yayın patlamasını önler. Bu sürede gelen ek değişiklikler birleştirilir.",
        hint_en="Prevents broadcast fan-out to all branches on every menu change. Extra changes within this window are coalesced.",
    ),
    FieldSpec("DAPHNE_INSTANCES", "Daphne süreç sayısı", "Daphne instances", "int", "websocket", min_value=1, max_value=4),
    FieldSpec(
        "UVICORN_INSTANCES",
        "Uvicorn süreç sayısı (HTTP API)",
        "Uvicorn instances (HTTP API)",
        "int",
        "websocket",
        default="4",
        min_value=1,
        max_value=8,
        hint_tr="Split mimaride HTTP API için Uvicorn worker sayısı. Her worker :9000+ portunda çalışır. Nginx /api/ ve /admin/ isteklerini bu worker'lara yönlendirir.",
        hint_en="Number of Uvicorn workers for the HTTP API in split architecture. Each worker listens on :9000+. Nginx routes /api/ and /admin/ to these workers.",
    ),
    FieldSpec(
        "KDS_RECALL_WINDOW_MINUTES",
        "Gönderi geri çağır penceresi (dk)",
        "Sent-order recall window (min)",
        "int",
        "kds",
        default="15",
        hint_tr="Servise gönderilmiş (READY/DELIVERED) kalemlerin KDS geri çağır listesinde kalma süresi.",
        hint_en="How long READY/DELIVERED items stay recallable on the KDS sent-orders drawer.",
        min_value=1,
        max_value=120,
    ),
    FieldSpec(
        "KDS_ACTIVE_CACHE_TTL",
        "KDS aktif sipariş önbellek (sn)",
        "KDS active order cache TTL (s)",
        "int",
        "kds",
        default="3600",
        min_value=0,
        hint_tr="count_active_and_overdue API'inin önbellekte kalma süresi. Yüksek trafikte Redis yükünü azaltır. 0 = önbellek kapalı.",
        hint_en="How long the count_active_and_overdue response stays cached. Reduces Redis load in high traffic. 0 = disable cache.",
    ),
    FieldSpec("JWT_REFRESH_TOKEN_DAYS", "Refresh token ömrü (gün)", "Refresh token days", "int", "auth", min_value=1),
    FieldSpec("SESSION_COOKIE_AGE_SECONDS", "Oturum çerezi süresi (sn)", "Session cookie age (s)", "int", "auth", min_value=60),
    FieldSpec("RBAC_CACHE_TTL", "RBAC önbellek TTL (sn)", "RBAC cache TTL (s)", "int", "auth", min_value=0),
    FieldSpec(
        "DASHBOARD_CACHE_TIMEOUT",
        "Dashboard önbellek süresi (sn)",
        "Dashboard cache timeout (s)",
        "int",
        "auth",
        default="120",
        min_value=10,
        hint_tr="Dashboard özet verilerinin önbellekte kalma süresi. Düşük RAM'de 300 önerilir.",
        hint_en="How long dashboard summary data stays cached. 300s recommended for low-RAM.",
    ),
    FieldSpec("POS_DISPLAY_WS_TOKEN_MAX_AGE", "Müşteri ekranı WS token (sn)", "Customer display WS token (s)", "int", "auth", min_value=60),
    FieldSpec(
        "FISCAL_WEBHOOK_BASE_URL",
        "Mali webhook taban URL",
        "Fiscal webhook base URL",
        "text",
        "fiscal",
        hint_tr="Token X-Connect webhook kökü (path yok). Örn: https://api.ornek.com — POS ayarlarında terminal webhook URL'si türetilir.",
        hint_en="Token X-Connect webhook root (no path). E.g. https://api.example.com — terminal webhook URL is derived in POS settings.",
    ),
    FieldSpec(
        "DISABLE_PDF_EXPORT",
        "PDF dışa aktarmayı devre dışı bırak",
        "Disable PDF export",
        "bool",
        "printing",
        default="false",
        hint_tr="Açılırsa ramis_export PDF çıktısı üretmez. Düşük RAM'de yazdırma/PDF kilitlenmelerini önler.",
        hint_en="When enabled, ramis_export skips PDF generation. Prevents print/PDF freezes on low-RAM systems.",
    ),
    FieldSpec(
        "PDF_EXPORT_ASYNC_ENABLED",
        "Async PDF dışa aktarımı",
        "Async PDF export",
        "bool",
        "printing",
        default="true",
        hint_tr="Kapalıysa tüm PDF'ler senkron üretilir (Gunicorn worker bloklanır). Celery worker pdf_export kuyruğu ile çalışır.",
        hint_en="When off, all PDFs are generated synchronously (blocks Gunicorn workers). Requires Celery worker with pdf_export queue.",
    ),
    FieldSpec(
        "PDF_EXPORT_CACHE_TTL",
        "PDF export cache TTL (sn)",
        "PDF export cache TTL (s)",
        "int",
        "printing",
        default="600",
        min_value=60,
        hint_tr="Async PDF sonucunun önbellekte kalma süresi. Bu sürede indirilmeyen PDF'ler expire olur.",
        hint_en="How long async PDF results stay in cache. Undownloaded PDFs expire after this period.",
    ),
    FieldSpec(
        "PDF_EXPORT_CACHE_MAX_BYTES",
        "PDF cache max boyut (byte)",
        "PDF cache max size (bytes)",
        "int",
        "printing",
        default="20971520",
        min_value=1048576,
        hint_tr="Bu boyutun üstündeki PDF'ler cache yerine dosyaya yazılır. 20971520 = 20 MB.",
        hint_en="PDFs larger than this are saved to file instead of cache. 20971520 = 20 MB.",
    ),
    FieldSpec(
        "CELERY_PDF_EXPORT_WORKER_CONCURRENCY",
        "PDF export worker eşzamanlılık",
        "PDF export worker concurrency",
        "int",
        "printing",
        default="2",
        min_value=1,
        max_value=4,
        hint_tr="ramis-worker-pdf servisi aynı anda kaç PDF üretir. WeasyPrint CPU yoğun; 2-4 arası önerilir. Kayıt sonrası systemd birimi güncellenir.",
        hint_en="How many PDFs ramis-worker-pdf generates in parallel. WeasyPrint is CPU-intensive; 2-4 recommended. The systemd unit is regenerated on save.",
    ),
    FieldSpec(
        "PREP_TASK_CANCEL_OVERDUE_MINUTES",
        "Hazırlık görevi deadline aşım eşiği (dk)",
        "Prep task overdue threshold (min)",
        "int",
        "prep",
        default="60",
        min_value=1,
        max_value=1440,
        hint_tr="PENDING/IN_PROGRESS hazırlık görevi deadline'ı geçtikten kaç dk sonra otomatik CANCELLED olacağı. Günde 1'den fazla çalıştırmak istemiyorsanız 1440 (24sa) yapabilirsiniz.",
        hint_en="Minutes past deadline before PENDING/IN_PROGRESS prep tasks are auto-cancelled. Set to 1440 (24h) if you want it to run at most once daily.",
    ),
    FieldSpec("STOCK_RESERVATION_ENABLED", "Stok rezervasyonu", "Stock reservation", "bool", "business"),
    FieldSpec(
        "STOCK_RESERVATION_EXPIRY_HOURS",
        "Rezervasyon süresi (saat)",
        "Reservation expiry (hours)",
        "int",
        "business",
        min_value=1,
        hint_tr="Sipariş/masa için ayrılan stok en fazla kaç saat tutulur; süre dolunca gece temizlik işi ayırmayı kaldırır.",
        hint_en="How long stock stays reserved for an order/table; the nightly cleanup job releases holds after this period.",
    ),
    FieldSpec(
        "FEFO_COSTING_ENABLED",
        "FEFO lot maliyetlendirme",
        "FEFO lot costing",
        "bool",
        "business",
        default="false",
        hint_tr="Lot bazlı FEFO (önce SKT'si dolacak) tüketimde ağırlıklı ortalama birim maliyet hesaplar.",
        hint_en="Enables weighted-average unit cost calculation for FEFO (first-expiry-first-out) lot consumption.",
    ),
    FieldSpec(
        "EXPIRY_WARNING_DAYS_DEFAULT",
        "SKT uyarı günü (varsayılan)",
        "Expiry warning days (default)",
        "int",
        "business",
        default="3",
        min_value=1,
        hint_tr="SKT risk listesinde varsayılan kaç gün öncesinden uyarı verileceği.",
        hint_en="Default number of days ahead to warn about expiring lots.",
    ),
    FieldSpec(
        "EXPIRY_WARNING_DAYS_OPTIONS",
        "SKT uyarı gün seçenekleri",
        "Expiry warning days options",
        "text",
        "business",
        default="3,7",
        hint_tr="Virgülle ayrılmış gün seçenekleri. Örn: 3,7,14,30. SKT tarama ve uyarı arayüzünde kullanılır.",
        hint_en="Comma-separated day options. Example: 3,7,14,30. Used in expiry scanning and warning UI.",
    ),
    FieldSpec(
        "EXPIRY_ACTION_AUTOMATION_ENABLED",
        "SKT aksiyon otomasyonu",
        "Expiry action automation",
        "bool",
        "business",
        default="false",
        hint_tr="Açıkken Öncelikli Tüketim, Transfer Öner ve Plan Notu aksiyonları otomasyon yan etkisi üretir.",
        hint_en="When enabled, expiry actions apply automation side effects (FEFO boost, draft transfer, plan notes).",
    ),
    FieldSpec(
        "EXPIRY_FEFO_BOOST_VALUE",
        "SKT FEFO boost değeri",
        "Expiry FEFO boost value",
        "int",
        "business",
        default="100",
        min_value=1,
        hint_tr="Öncelikli tüketim aksiyonunda lot FEFO öncelik boost miktarı.",
        hint_en="FEFO priority boost applied to lots on priority consume action.",
    ),
    FieldSpec(
        "EXPIRY_FEFO_BOOST_HOURS",
        "SKT FEFO boost süresi (saat)",
        "Expiry FEFO boost hours",
        "int",
        "business",
        default="48",
        min_value=1,
        hint_tr="FEFO boost geçerlilik süresi (saat).",
        hint_en="How long the FEFO priority boost remains active (hours).",
    ),
    FieldSpec(
        "EXPIRY_PREP_PRIORITY_DELTA",
        "SKT prep görev öncelik artışı",
        "Expiry prep task priority delta",
        "int",
        "business",
        default="5",
        min_value=1,
        hint_tr="Öncelikli tüketimde mevcut prep görevlerine eklenen priority delta (max 99).",
        hint_en="Priority delta added to existing prep tasks on priority consume.",
    ),
    FieldSpec(
        "EXPIRY_TRANSFER_IDEMPOTENCY_HOURS",
        "SKT transfer idempotency (saat)",
        "Expiry transfer idempotency hours",
        "int",
        "business",
        default="24",
        min_value=1,
        hint_tr="Aynı lot için tekrar DRAFT transfer önerisini engelleme penceresi (saat).",
        hint_en="Window (hours) to block duplicate draft transfer suggestions for the same lot.",
    ),
    FieldSpec("ENABLE_SMART_FIRING_V2", "Smart Firing v2", "Smart Firing v2", "bool", "smart_firing"),
    FieldSpec("SMART_FIRING_QUEUE_DEPTH_THRESHOLD", "Kuyruk derinlik eşiği", "Queue depth threshold", "int", "smart_firing", min_value=1),
    FieldSpec("SMART_FIRING_BACKLOG_MINUTE_FACTOR", "Geri yük dakika çarpanı", "Backlog minute factor", "int", "smart_firing", min_value=1),
    FieldSpec("SMART_FIRING_QUEUE_BUFFER_CAP", "Tampon üst sınır", "Queue buffer cap", "int", "smart_firing", min_value=1),
    FieldSpec("SMART_FIRING_LEARNED_MIN_SAMPLES", "EMA min örnek", "Learned min samples", "int", "smart_firing", min_value=1),
    FieldSpec("SMART_FIRING_UI_BUSY_THRESHOLD", "Yoğunluk eşiği (dk)", "Busy threshold (min)", "int", "smart_firing", min_value=1, max_value=120),
    FieldSpec("PRINT_THERMAL_SYNC", "Senkron termal baskı", "Synchronous thermal print", "bool", "printing"),
    FieldSpec(
        "CELERY_PRINTING_WORKER_CONCURRENCY",
        "Printing worker eşzamanlılık",
        "Printing worker concurrency",
        "int",
        "printing",
        default="4",
        min_value=1,
        max_value=16,
        hint_tr="ramis-worker (printing kuyruğu) aynı anda kaç baskı işi işler. Kayıt sonrası systemd birimi otomatik güncellenir ve worker yeniden başlatılır.",
        hint_en="How many print jobs ramis-worker (printing queue) runs in parallel. The systemd unit is regenerated on save and the worker is restarted.",
    ),
    FieldSpec(
        "PRINT_JOB_REQUEUE_PENDING_SECONDS",
        "Eski PENDING işleri yeniden kuyruk (sn)",
        "Re-queue stale PENDING jobs (s)",
        "int",
        "printing",
        default="45",
        min_value=15,
        hint_tr="Beat bakım görevi, bu süreden uzun süredir bekleyen PENDING PrintJob kayıtlarını yeniden kuyruğa alır.",
        hint_en="Beat maintenance re-queues PENDING PrintJob rows older than this many seconds.",
    ),
    FieldSpec(
        "PRINT_JOB_STALE_PROCESSING_SECONDS",
        "Takılı PROCESSING eşiği (sn)",
        "Stale PROCESSING threshold (s)",
        "int",
        "printing",
        default="180",
        min_value=60,
        hint_tr="Bu süreden uzun süredir PROCESSING kalan işler FAILED olarak işaretlenir (yazıcı/kilit takılması).",
        hint_en="Jobs stuck in PROCESSING longer than this are marked FAILED (printer/lock hang).",
    ),
    FieldSpec(
        "PRINT_JOB_MAINTENANCE_BATCH_SIZE",
        "Kuyruk bakımı batch boyutu",
        "Queue maintenance batch size",
        "int",
        "printing",
        default="100",
        min_value=1,
        max_value=500,
        hint_tr="Her bakım turunda en fazla kaç PrintJob kaydı taranır.",
        hint_en="Maximum PrintJob rows processed per maintenance run.",
    ),
)

BEAT_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec(
        "BEAT_CLEANUP_RESERVATIONS_TIME",
        "Süresi dolmuş stok ayırmalarını temizle",
        "Clear expired stock holds",
        "time",
        "beat",
        hour_key="BEAT_CLEANUP_RESERVATIONS_HOUR",
        minute_key="BEAT_CLEANUP_RESERVATIONS_MINUTE",
        default_time="3:00",
        hint_tr="Her gece bu saatte, kullanılmayan sipariş/masa stok ayırmaları kaldırılır. Ne kadar süre tutulacağı «Stok → Rezervasyon süresi» ayarından gelir.",
        hint_en="Runs nightly at this time to release unused order/table stock holds. How long holds last is set under Inventory → Reservation expiry.",
    ),
    FieldSpec(
        "BEAT_ROLLUP_PRODUCT_STATION_TIMING_TIME",
        "Mutfak pişirme sürelerini öğren (Smart Firing)",
        "Learn kitchen prep times (Smart Firing)",
        "time",
        "beat",
        hour_key="BEAT_ROLLUP_PRODUCT_STATION_TIMING_HOUR",
        minute_key="BEAT_ROLLUP_PRODUCT_STATION_TIMING_MINUTE",
        default_time="3:15",
        hint_tr="Gece çalışır; ürünlerin istasyon bazlı ortalama hazırlık sürelerini günceller. Ertesi gün mutfak ekranındaki tahminler buna göre iyileşir.",
        hint_en="Runs nightly; updates average prep times per product and station. Kitchen display estimates improve the next day.",
    ),
    FieldSpec(
        "PRINTER_STATUS_SYNC_INTERVAL_MINUTES",
        "Yazıcı bağlantı kontrolü (dakika)",
        "Printer connection check (minutes)",
        "int",
        "beat",
        default="5",
        min_value=1,
        hint_tr="Yazıcıların çevrimiçi mi çevrimdışı mı olduğu bu aralıkla kontrol edilir; POS’taki yazıcı durumu buna göre güncellenir.",
        hint_en="How often the system checks whether printers are online; POS printer status reflects the result.",
    ),
    FieldSpec(
        "PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS",
        "PrintJob kuyruk bakımı (saniye)",
        "PrintJob queue maintenance (seconds)",
        "int",
        "beat",
        default="30",
        min_value=15,
        hint_tr="Eski PENDING yeniden kuyruk ve takılı PROCESSING temizliği bu aralıkla çalışır (maintain_print_job_queue).",
        hint_en="How often maintain_print_job_queue runs to re-queue stale PENDING jobs and fail stuck PROCESSING rows.",
    ),
    FieldSpec(
        "BEAT_SCAN_KITCHEN_LOW_STOCK_TIME",
        "Mutfak stok uyarı taraması",
        "Kitchen low-stock alert scan",
        "time",
        "beat",
        hour_key="BEAT_SCAN_KITCHEN_LOW_STOCK_HOUR",
        minute_key="BEAT_SCAN_KITCHEN_LOW_STOCK_MINUTE",
        default_time="4:00",
        hint_tr="Gece çalışır; mutfak deposunda minimum seviyenin altına düşen malzemeler için uyarı oluşturur.",
        hint_en="Runs nightly; creates alerts when kitchen warehouse items fall below their minimum level.",
    ),
    FieldSpec(
        "BEAT_SCAN_OVERDUE_PO_TIME",
        "Geciken satın alma siparişi taraması",
        "Overdue purchase order scan",
        "time",
        "beat",
        hour_key="BEAT_SCAN_OVERDUE_PO_HOUR",
        minute_key="BEAT_SCAN_OVERDUE_PO_MINUTE",
        default_time="5:00",
        hint_tr="Gece çalışır; beklenen teslimat tarihi geçmiş açık satın alma siparişleri taranır ve depo uyarısı gönderilir.",
        hint_en="Runs nightly; scans open purchase orders past their expected delivery date and sends warehouse alerts.",
    ),
    FieldSpec(
        "BEAT_SCAN_EXPIRING_LOTS_TIME",
        "Son kullanma tarihi (SKT) kontrolü",
        "Expiry date (best-before) check",
        "time",
        "beat",
        hour_key="BEAT_SCAN_EXPIRING_LOTS_HOUR",
        minute_key="BEAT_SCAN_EXPIRING_LOTS_MINUTE",
        default_time="4:30",
        hint_tr="Gece çalışır; son kullanma tarihi yaklaşan veya geçmiş stok lotları taranır ve uyarı üretilir.",
        hint_en="Runs nightly; scans lots nearing or past expiry and raises alerts.",
    ),
    FieldSpec(
        "BEAT_SWEEP_STALE_CLEANING_TABLES_INTERVAL_MINUTES",
        "Takılı «temizleniyor» masalarını düzelt (dakika)",
        "Fix stuck «cleaning» tables (minutes)",
        "int",
        "beat",
        default="1",
        min_value=1,
        hint_tr="Temizlik süresi dolmuş ama hâlâ «temizleniyor» görünen masalar bu aralıkla otomatik serbest bırakılır.",
        hint_en="Tables still marked cleaning after their timer expires are automatically freed at this interval.",
    ),
    FieldSpec(
        "BEAT_NOTIFY_DUE_RESERVATIONS_INTERVAL_MINUTES",
        "Masa rezervasyonu hatırlatması (dakika)",
        "Table reservation reminders (minutes)",
        "int",
        "beat",
        default="1",
        min_value=1,
        hint_tr="Rezervasyon saati gelen masalar için garson ve POS ekranına ne sıklıkla hatırlatma gönderileceği.",
        hint_en="How often to remind staff on POS when a table reservation’s time has arrived.",
    ),
    FieldSpec(
        "BEAT_CANCEL_OVERDUE_PREP_TASKS_INTERVAL_MINUTES",
        "Süresi geçmiş hazırlık görevlerini temizle (dakika)",
        "Cancel overdue prep tasks (minutes)",
        "int",
        "beat",
        default="15",
        min_value=5,
        hint_tr="Deadline'ı geçmiş PENDING/IN_PROGRESS hazırlık görevleri bu aralıkla CANCELLED yapılır. Ne kadar süre geçtikten sonra iptal edileceği «Prep → Hazırlık görevi deadline aşım eşiği» ayarından gelir.",
        hint_en="Interval for auto-cancelling PENDING/IN_PROGRESS prep tasks past deadline. How long past deadline is set under Prep → Prep task overdue threshold.",
    ),
    FieldSpec(
        "BEAT_REDIS_CLEANUP_TIME",
        "Redis asılı anahtar temizliği",
        "Redis stale key cleanup",
        "time",
        "beat",
        hour_key="BEAT_REDIS_CLEANUP_HOUR",
        minute_key="BEAT_REDIS_CLEANUP_MINUTE",
        default_time="2:30",
        hint_tr="Celery meta, eski cache nesilleri ve TTL'siz channel anahtarlarını temizler. Eşikler «Redis ve Celery» sekmesindedir.",
        hint_en="Purges stale Celery meta, old cache generations, and channel keys without TTL. Thresholds are under Redis & Celery.",
    ),
    FieldSpec(
        "BEAT_AUTO_CLOSE_TABLES_TIME",
        "Masaları otomatik kapat",
        "Auto close active tables",
        "time",
        "beat",
        hour_key="BEAT_AUTO_CLOSE_TABLES_HOUR",
        minute_key="BEAT_AUTO_CLOSE_TABLES_MINUTE",
        default_time="2:00",
        hint_tr="Her gece bu saatte, hesabı kapanmamış masaların hesapları kapatılır.",
        hint_en="Runs nightly at this time to close tables with unclosed accounts.",
    ),
    FieldSpec(
        "BEAT_PURGE_EXPIRED_86_ENABLED",
        "Geçmiş Ürün Kalmadı (86) temizliği",
        "Purge expired out-of-stock (86) records",
        "bool",
        "beat",
        default="false",
        hint_tr="Açıkken belirtilen saatte bugün hariç geçmiş 86 kayıtları silinir ve denetim kaydına yazılır.",
        hint_en="When enabled, deletes past 86 records (excluding today) at the scheduled time and writes audit logs.",
    ),
    FieldSpec(
        "BEAT_PURGE_EXPIRED_86_TIME",
        "Geçmiş 86 temizliği saati",
        "Expired 86 purge time",
        "time",
        "beat",
        hour_key="BEAT_PURGE_EXPIRED_86_HOUR",
        minute_key="BEAT_PURGE_EXPIRED_86_MINUTE",
        default_time="5:00",
        hint_tr="Gece çalışır; effective_date bugünden önce olan aktif 86 kayıtları soft-delete edilir.",
        hint_en="Runs nightly; soft-deletes active 86 records whose effective_date is before today.",
    ),
    FieldSpec(
        "NEGATIVE_LOT_CLEANUP_ENABLED",
        "Negatif stok lot temizleme",
        "Negative stock lot cleanup",
        "bool",
        "beat",
        default="true",
        hint_tr="Açıkken belirtilen saatte allow_negative_stock ile oluşan negatif lotlar pozitif lotlarla konsolide edilir.",
        hint_en="When enabled, consolidates negative lots created via allow_negative_stock with positive lots at the scheduled time.",
    ),
    FieldSpec(
        "BEAT_CLEANUP_NEGATIVE_LOTS_TIME",
        "Negatif stok lot temizleme saati",
        "Negative lot cleanup time",
        "time",
        "beat",
        hour_key="BEAT_CLEANUP_NEGATIVE_LOTS_HOUR",
        minute_key="BEAT_CLEANUP_NEGATIVE_LOTS_MINUTE",
        default_time="3:00",
        hint_tr="Her gece bu saatte, negatif stok lotları aynı kalem/depodaki pozitif lotlarla kapatılır.",
        hint_en="Runs nightly at this time to offset negative stock lots against positive lots of the same item/warehouse.",
    ),
    FieldSpec(
        "DEFICIENCY_REPAIR_ENABLED",
        "Eksik listesi yetim kayıt onarımı",
        "Orphan deficiency report repair",
        "bool",
        "beat",
        default="false",
        hint_tr="Açıkken belirtilen saatte ORDERED ama bağlı PO'su olmayan veya bayat açık eksik listeleri onarılır.",
        hint_en="When enabled, repairs ORDERED reports without linked POs or stale open deficiency reports at the scheduled time.",
    ),
    FieldSpec(
        "BEAT_DEFICIENCY_REPAIR_TIME",
        "Eksik listesi onarım saati",
        "Deficiency repair time",
        "time",
        "beat",
        hour_key="BEAT_DEFICIENCY_REPAIR_HOUR",
        minute_key="BEAT_DEFICIENCY_REPAIR_MINUTE",
        default_time="4:45",
        hint_tr="Gece çalışır; yetim ORDERED ve isteğe bağlı bayat PENDING/APPROVED kayıtları işlenir.",
        hint_en="Runs nightly; processes orphan ORDERED and optional stale PENDING/APPROVED records.",
    ),
    FieldSpec(
        "DEFICIENCY_REPAIR_MIN_AGE_HOURS",
        "Eksik listesi onarım minimum yaşı (saat)",
        "Deficiency repair minimum age (hours)",
        "int",
        "beat",
        default="24",
        min_value=0,
        hint_tr="Bu süreden daha yeni güncellenen kayıtlara dokunulmaz.",
        hint_en="Reports updated more recently than this are not touched.",
    ),
    FieldSpec(
        "DEFICIENCY_REPAIR_ORDERED_ACTION",
        "Yetim ORDERED kayıt işlemi",
        "Orphan ORDERED report action",
        "text",
        "beat",
        default="revert_to_approved",
        hint_tr="revert_to_approved | cancel | soft_delete — ORDERED ama aktif PO'su olmayan kayıtlar için.",
        hint_en="revert_to_approved | cancel | soft_delete — for ORDERED reports without an active purchase order.",
    ),
    FieldSpec(
        "DEFICIENCY_REPAIR_STALE_ENABLED",
        "Bayat açık eksik listelerini temizle",
        "Clean stale open deficiency reports",
        "bool",
        "beat",
        default="false",
        hint_tr="Açıkken tüm kalemleri minimum üstünde olan PENDING/APPROVED kayıtlar işlenir.",
        hint_en="When enabled, processes PENDING/APPROVED reports whose items are all above minimum stock.",
    ),
    FieldSpec(
        "DEFICIENCY_REPAIR_STALE_ACTION",
        "Bayat açık eksik listesi işlemi",
        "Stale open deficiency report action",
        "text",
        "beat",
        default="cancel",
        hint_tr="cancel | soft_delete — bayat PENDING/APPROVED kayıtlar için.",
        hint_en="cancel | soft_delete — for stale PENDING/APPROVED reports.",
    ),
)

BACKEND_FIELDS: tuple[FieldSpec, ...] = BACKEND_CORE_FIELDS + BEAT_FIELDS

FRONTEND_FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec(
        "NEXT_PUBLIC_API_URL",
        "API adresi",
        "API URL",
        "text",
        "frontend",
        hint_tr="Mutlaka /api/v1 ile bitmeli.",
        hint_en="Must end with /api/v1.",
    ),
    FieldSpec("NEXT_PUBLIC_POS_OFFLINE_QUEUE", "POS çevrimdışı kuyruk", "POS offline queue", "bool", "frontend"),
    FieldSpec("NEXT_PUBLIC_API_INTERCEPTOR_TOASTS", "API hata toast'ları", "API interceptor toasts", "bool", "frontend"),
    FieldSpec("PORT", "Frontend portu", "Frontend port", "int", "frontend", min_value=1, max_value=65535),
)

BACKEND_GROUPS: dict[str, tuple[str, str]] = {
    "security": ("Güvenlik", "Security"),
    "postgres": ("PostgreSQL", "PostgreSQL"),
    "redis": ("Redis ve Celery", "Redis & Celery"),
    "websocket": ("WebSocket / Daphne", "WebSocket / Daphne"),
    "kds": ("KDS (Mutfak Ekranı)", "KDS (Kitchen Display)"),
    "prep": ("Hazırlık Görevleri (Prep)", "Prep Tasks"),
    "auth": ("JWT ve oturum", "JWT & session"),
    "fiscal": ("Mali entegrasyon (ÖKC)", "Fiscal integration (OKC)"),
    "business": ("Stok", "Inventory"),
    "smart_firing": ("Smart Firing v2", "Smart Firing v2"),
    "printing": ("Yazdırma", "Printing"),
}

BEAT_GROUPS: dict[str, tuple[str, str]] = {
    "beat": ("", ""),
}

BACKEND_GROUP_DESCRIPTIONS: dict[str, tuple[str, str]] = {
    "beat": (
        "Sistemin siz müdahale etmeden otomatik yaptığı işler. «Saat» alanlarına günün hangi saatinde çalışacağını yazın (ör. 3:00). «Dakika» alanları tekrar aralığını belirler.",
        "Tasks the system runs automatically without manual action. Time fields use HH:MM (e.g. 3:00). Minute fields set how often a repeating job runs.",
    ),
}

FRONTEND_GROUPS: dict[str, tuple[str, str]] = {
    "frontend": ("Next.js istemcisi", "Next.js client"),
}

DAPHNE_MAX = 4
UVICORN_MAX = 8


def uvicorn_units(count: int) -> list[str]:
    count = max(1, min(UVICORN_MAX, count))
    units = ["ramis-uvicorn.service"]
    for index in range(1, count):
        units.append(f"ramis-uvicorn-{9000 + index}.service")
    return units


def env_keys_for_field(spec: FieldSpec) -> frozenset[str]:
    """Form alanının backend.env'deki gerçek anahtarları."""
    if spec.field_type == "time":
        return frozenset({spec.hour_key, spec.minute_key})
    return frozenset({spec.key})


# Anahtar -> restart kategorisi
KEY_RESTART_CATEGORY: dict[str, str] = {
    "DAPHNE_INSTANCES": "daphne_scale",
    "UVICORN_INSTANCES": "daphne_scale",
    "REDIS_URL": "redis",
    "REDIS_CACHE_URL": "redis",
    "REDIS_CHANNELS_URL": "redis",
    "REDIS_LOCK_URL": "redis",
    "CELERY_BROKER_URL": "redis",
    "REDIS_SOCKET_CONNECT_TIMEOUT": "redis",
    "REDIS_CHANNELS_SOCKET_TIMEOUT": "redis",
    "REDIS_MAINTENANCE_ENABLED": "workers",
    "REDIS_CELERY_RESULT_MAX_IDLE_SECONDS": "workers",
    "CELERY_RESULT_EXPIRES_SECONDS": "workers",
    "REDIS_ORDER_COUNTER_RETENTION_DAYS": "workers",
    "REDIS_RBAC_PERM_VERSIONS_TO_KEEP": "workers",
    "REDIS_SALES_SUMMARY_GENERATIONS_TO_KEEP": "workers",
    "CHANNEL_LAYER_CAPACITY": "redis",
    "CHANNEL_LAYER_EXPIRY": "redis",
    "WS_AUTH_CACHE_SECONDS": "daphne",
    "WS_KDS_STATS_THROTTLE_SECONDS": "daphne",
    "WS_CONN_MAX_PER_MINUTE": "daphne",
    "WS_MAX_PENDING_TIMERS": "daphne",
    "WS_MENU_CATALOG_THROTTLE_SECONDS": "daphne",
    "WS_BYPASS_CELERY": "backend_default",
    "PDF_EXPORT_ASYNC_ENABLED": "workers",
    "PDF_EXPORT_CACHE_TTL": "workers",
    "PDF_EXPORT_CACHE_MAX_BYTES": "workers",
    "CELERY_PDF_EXPORT_WORKER_CONCURRENCY": "pdf_worker",
    "PRINT_THERMAL_SYNC": "workers",
    "CELERY_PRINTING_WORKER_CONCURRENCY": "printing_worker",
    "PRINT_JOB_REQUEUE_PENDING_SECONDS": "workers",
    "PRINT_JOB_STALE_PROCESSING_SECONDS": "workers",
    "PRINT_JOB_MAINTENANCE_BATCH_SIZE": "workers",
    "PRINTER_STATUS_SYNC_INTERVAL_MINUTES": "beat",
    "PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS": "beat",
    "BEAT_CLEANUP_RESERVATIONS_HOUR": "beat",
    "BEAT_CLEANUP_RESERVATIONS_MINUTE": "beat",
    "BEAT_ROLLUP_PRODUCT_STATION_TIMING_HOUR": "beat",
    "BEAT_ROLLUP_PRODUCT_STATION_TIMING_MINUTE": "beat",
    "BEAT_SCAN_KITCHEN_LOW_STOCK_HOUR": "beat",
    "BEAT_SCAN_KITCHEN_LOW_STOCK_MINUTE": "beat",
    "BEAT_SCAN_OVERDUE_PO_HOUR": "beat",
    "BEAT_SCAN_OVERDUE_PO_MINUTE": "beat",
    "BEAT_SCAN_EXPIRING_LOTS_HOUR": "beat",
    "BEAT_SCAN_EXPIRING_LOTS_MINUTE": "beat",
    "BEAT_SWEEP_STALE_CLEANING_TABLES_INTERVAL_MINUTES": "beat",
    "BEAT_NOTIFY_DUE_RESERVATIONS_INTERVAL_MINUTES": "beat",
    "PREP_TASK_CANCEL_OVERDUE_MINUTES": "workers",
    "BEAT_CANCEL_OVERDUE_PREP_TASKS_INTERVAL_MINUTES": "beat",
    "BEAT_REDIS_CLEANUP_HOUR": "beat",
    "BEAT_REDIS_CLEANUP_MINUTE": "beat",
    "BEAT_AUTO_CLOSE_TABLES_HOUR": "beat",
    "BEAT_AUTO_CLOSE_TABLES_MINUTE": "beat",
    "BEAT_PURGE_EXPIRED_86_ENABLED": "beat",
    "BEAT_PURGE_EXPIRED_86_HOUR": "beat",
    "BEAT_PURGE_EXPIRED_86_MINUTE": "beat",
    "NEGATIVE_LOT_CLEANUP_ENABLED": "beat",
    "BEAT_CLEANUP_NEGATIVE_LOTS_HOUR": "beat",
    "BEAT_CLEANUP_NEGATIVE_LOTS_MINUTE": "beat",
    "DEFICIENCY_REPAIR_ENABLED": "beat",
    "BEAT_DEFICIENCY_REPAIR_HOUR": "beat",
    "BEAT_DEFICIENCY_REPAIR_MINUTE": "beat",
    "DEFICIENCY_REPAIR_MIN_AGE_HOURS": "beat",
    "DEFICIENCY_REPAIR_ORDERED_ACTION": "beat",
    "DEFICIENCY_REPAIR_STALE_ENABLED": "beat",
    "DEFICIENCY_REPAIR_STALE_ACTION": "beat",
    "FISCAL_WEBHOOK_BASE_URL": "backend_default",
    "NEXT_PUBLIC_API_URL": "frontend",
    "NEXT_PUBLIC_POS_OFFLINE_QUEUE": "frontend_runtime",
    "NEXT_PUBLIC_API_INTERCEPTOR_TOASTS": "frontend_runtime",
    "PORT": "frontend",
}

DEFAULT_BACKEND_RESTART = ("daphne", "workers", "beat")
DEFAULT_FRONTEND_RESTART = ("frontend",)


def daphne_units(count: int) -> list[str]:
    count = max(1, min(DAPHNE_MAX, count))
    units = ["ramis-daphne.service"]
    for index in range(1, count):
        units.append(f"ramis-daphne-{8000 + index}.service")
    return units


def collect_restart_units(
    backend_before: dict[str, str],
    backend_after: dict[str, str],
    frontend_before: dict[str, str],
    frontend_after: dict[str, str],
) -> tuple[list[str], set[str]]:
    """Return systemd units and special actions (runtime_sync)."""
    categories: set[str] = set()

    for key in set(backend_before) | set(backend_after):
        if backend_before.get(key) != backend_after.get(key):
            categories.add(KEY_RESTART_CATEGORY.get(key, "backend_default"))

    for key in set(frontend_before) | set(frontend_after):
        if frontend_before.get(key) != frontend_after.get(key):
            categories.add(KEY_RESTART_CATEGORY.get(key, "frontend_default"))

    special: set[str] = set()
    units: list[str] = []
    seen: set[str] = set()

    def add_unit(name: str) -> None:
        if name not in seen:
            seen.add(name)
            units.append(name)

    daphne_count = 1
    try:
        daphne_count = int(backend_after.get("DAPHNE_INSTANCES", backend_before.get("DAPHNE_INSTANCES", "1")))
    except ValueError:
        daphne_count = 1
    uvicorn_count = 4
    try:
        uvicorn_count = int(backend_after.get("UVICORN_INSTANCES", backend_before.get("UVICORN_INSTANCES", "4")))
    except ValueError:
        uvicorn_count = 4

    if "backend_default" in categories or "daphne" in categories:
        for unit in daphne_units(daphne_count):
            add_unit(unit)
        for unit in uvicorn_units(uvicorn_count):
            add_unit(unit)
        add_unit("ramis-worker.service")
        add_unit("ramis-worker-maintenance.service")
        add_unit("ramis-worker-broadcast.service")
        add_unit("ramis-worker-pdf.service")

    if "redis" in categories or "daphne_scale" in categories:
        for unit in daphne_units(daphne_count):
            add_unit(unit)
        for unit in uvicorn_units(uvicorn_count):
            add_unit(unit)
        add_unit("ramis-worker.service")
        add_unit("ramis-worker-maintenance.service")
        add_unit("ramis-worker-broadcast.service")
        add_unit("ramis-worker-pdf.service")
        add_unit("nginx.service")

    if "beat" in categories:
        add_unit("ramis-beat.service")
        special.add("beat_sync")

    if "workers" in categories:
        add_unit("ramis-worker.service")
        add_unit("ramis-worker-maintenance.service")
        add_unit("ramis-worker-broadcast.service")
        add_unit("ramis-worker-pdf.service")

    if "pdf_worker" in categories:
        add_unit("ramis-worker-pdf.service")
        special.add("printing_worker_sync")

    if "printing_worker" in categories:
        add_unit("ramis-worker.service")
        special.add("printing_worker_sync")

    if "frontend" in categories or "frontend_default" in categories:
        add_unit("ramis-frontend.service")

    if "frontend_runtime" in categories:
        special.add("runtime_sync")

    if not units and not special and (backend_before != backend_after or frontend_before != frontend_after):
        for unit in daphne_units(daphne_count):
            add_unit(unit)
        for unit in uvicorn_units(uvicorn_count):
            add_unit(unit)
        add_unit("ramis-worker.service")
        add_unit("ramis-worker-maintenance.service")
        add_unit("ramis-worker-broadcast.service")
        add_unit("ramis-worker-pdf.service")

    return units, special
