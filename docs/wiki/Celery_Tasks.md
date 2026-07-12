# Celery Tasks (Arka Plan Görevleri)

> **Özet:** Redis broker üzerinden çalışan Celery görevleri. Periyodik Beat zamanlamaları `backend.env` anahtarları ile yapılandırılır (varsayılan: gece 03:00–04:30 + 1–5 dk aralıklı görevler). Bkz. [[Backend_Environment#9. Celery Beat zamanlamaları]].
> **Kütüphaneler:** Celery, Redis, django-celery-beat
> **Bağlantılar:** [[Inventory]], [[Warehouse]], [[Django_Settings]], [[Deployment]], [[Orders]], [[Smart_Firing_v2]], [[Printing]], [[Celery_Beat_Sync]], [[Procurement_Intelligence]], [[Async_PDF_Export]], [[Invoices]]

---

## Konum
- `backend/config/celery.py` — Celery app tanımı
- `backend/config/settings.py` — broker, kuyruklar
- `backend/config/celery_beat_schedule.py` — Beat zamanlamaları (env → `CELERY_BEAT_SCHEDULE`)
- `backend/core/celery_beat_sync.py` — Beat DB senkronizasyonu
- `backend/core/redis_urls.py` — Redis db ayrımı yardımcıları
- `backend/core/redis_maintenance.py` — Redis asılı anahtar temizliği
- `backend/core/tasks.py` — `cleanup_redis_stale_keys`
- `backend/apps/inventory/tasks.py` — Stok rezervasyon temizliği, SKT lot gece taraması
- `backend/apps/orders/tasks.py` — Smart Firing v2 rollup
- `backend/apps/warehouse/tasks.py` — Mutfak düşük stok periyodik taraması
- `backend/apps/branches/tasks.py` — Masa temizlik ETA ve sweep
- `backend/apps/reservations/tasks.py` — Rezervasyon saati bildirimi
- `backend/apps/production_planning/tasks.py` — Geçmiş Ürün Kalmadı (86) kayıt temizliği

## Kuyruklar (systemd)

| Servis | Kuyruk | concurrency | Görevler |
|--------|--------|-------------|----------|
| `ramis-worker.service` | `printing` | 4 | `execute_receipt_print_job` (istasyon başına paralel; yazıcı başına kilit) |
| `ramis-worker-maintenance.service` | `maintenance`, `celery` | 1 | Beat görevleri, bakım |
| `ramis-worker-broadcast.service` | `broadcast` | 2 (`CELERY_BROADCAST_WORKER_CONCURRENCY`) | `broadcast_kds_refresh_task`, `broadcast_kitchen_order_status_changed_task` — KDS/POS gerçek zamanlı WS yayınları |
| `ramis-worker-pdf.service` | `pdf_export` | 2 (`CELERY_PDF_EXPORT_WORKER_CONCURRENCY`) | `generate_report_pdf_async`, `generate_invoice_pdf` — rapor/fatura PDF üretimi; WeasyPrint CPU yoğun, `--max-tasks-per-child=20` |

> **Önemli (Split mimari):** WS yayın task'ları `broadcast` kuyruğuna yönlendirilir (`settings.CELERY_BROADCAST_QUEUE`). Bu kuyruğu **yalnızca** `ramis-worker-broadcast.service` tüketir. Bu birim çalışmıyorsa KDS/POS/mobil arasındaki gerçek zamanlı iletişim tamamen durur (task'lar Redis'te birikir, `CELERY_TASK_CREATE_MISSING_QUEUES=True`). Kuyruk birikimi kontrolü: `redis-cli -n <broker_db> LLEN broadcast`.

## Periyodik görevler (Celery Beat)

Zamanlamalar ortam değişkenlerinden okunur; üretimde `sync_celery_beat_schedule` ile DB'ye yazılır. Saat dilimi: **Europe/Istanbul**.

| Beat anahtarı | Görev | Env (varsayılan) |
|---------------|-------|------------------|
| `cleanup-reservations-nightly` | `cleanup_expired_reservations` | `BEAT_CLEANUP_RESERVATIONS_HOUR/MINUTE` (3:00) |
| `rollup-product-station-timing-nightly` | `roll_up_product_station_timing_stats` | `BEAT_ROLLUP_PRODUCT_STATION_TIMING_HOUR/MINUTE` (3:15) |
| `sync-printer-statuses-periodically` | `sync_all_printer_statuses` | `PRINTER_STATUS_SYNC_INTERVAL_MINUTES` (5) |
| `maintain-print-job-queue` | `maintain_print_job_queue` | `PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS` (30) |
| `scan-kitchen-low-stock-nightly` | `scan_kitchen_low_stock_deficiencies` | `BEAT_SCAN_KITCHEN_LOW_STOCK_HOUR/MINUTE` (4:00) |
| `scan-overdue-purchase-orders-nightly` | `scan_overdue_purchase_orders_daily` | `BEAT_SCAN_OVERDUE_PO_HOUR/MINUTE` (5:00) |
| `scan-expiring-lots-daily` | `scan_expiring_lots_daily` | `BEAT_SCAN_EXPIRING_LOTS_HOUR/MINUTE` (4:30) |
| `sweep-stale-cleaning-tables` | `sweep_stale_cleaning_tables` | `BEAT_SWEEP_STALE_CLEANING_TABLES_INTERVAL_MINUTES` (1) |
| `notify-due-reservations` | `notify_due_reservations` | `BEAT_NOTIFY_DUE_RESERVATIONS_INTERVAL_MINUTES` (1) |
| `cleanup-redis-stale-keys` | `cleanup_redis_stale_keys` | `BEAT_REDIS_CLEANUP_HOUR/MINUTE` (2:30) |
| `purge-expired-86-nightly` | `purge_expired_product_day_availability` | `BEAT_PURGE_EXPIRED_86_HOUR/MINUTE` (5:00) + `BEAT_PURGE_EXPIRED_86_ENABLED` |
| `cleanup-negative-lots-nightly` | `cleanup_negative_lots` | `BEAT_CLEANUP_NEGATIVE_LOTS_HOUR/MINUTE` (3:00) + `NEGATIVE_LOT_CLEANUP_ENABLED` |

### `cleanup_expired_reservations`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_CLEANUP_RESERVATIONS_HOUR` / `MINUTE`
- **İşlev:** `STOCK_RESERVATION_EXPIRY_HOURS` (varsayılan 24) saat geçmiş RESERVED rezervasyonları RELEASED yapar

### `roll_up_product_station_timing_stats` (Smart Firing v2)
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_ROLLUP_PRODUCT_STATION_TIMING_HOUR` / `MINUTE`
- **İşlev:** `rollup_product_station_timing` komutunu çağırır; EMA güncellemesi
- Bkz. [[Smart_Firing_v2]]

### `sync_all_printer_statuses`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `PRINTER_STATUS_SYNC_INTERVAL_MINUTES`
- **İşlev:** Aktif yazıcıların online/offline durumunu kontrol eder; **PROCESSING** baskısı olan yazıcılar atlanır

### `maintain_print_job_queue`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS` (varsayılan 30 sn)
- **İşlev:** Celery mesajı kaybı / worker kesintisi sonrası eski **PENDING** `PrintJob` kayıtlarını yeniden kuyruğa alır; takılı **PROCESSING** kayıtlarını **FAILED** işaretler

### `scan_kitchen_low_stock_deficiencies`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_SCAN_KITCHEN_LOW_STOCK_HOUR` / `MINUTE`
- **Eşik:** `q_low_stock_warehouse_level()` — pozitif minimum ve `quantity < minimum_quantity`
- Bkz. [[Warehouse]], [[Inventory#Düşük / kritik stok eşiği]]

### `scan_overdue_purchase_orders_daily`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_SCAN_OVERDUE_PO_HOUR` / `MINUTE` (varsayılan 5:00)
- **İşlev:** `expected_date < bugün` ve durumu `ORDERED` / `PARTIALLY_RECEIVED` olan PO'ları tarar; geciken kayıt varsa depo WebSocket üzerinden `procurement.overdue_alert` yayınlar
- **Kaynak:** `backend/apps/warehouse/tasks.py`, `procurement_alert_selectors.py`
- **Ayar yöneticisi:** Ramis Beat sekmesi → `BEAT_SCAN_OVERDUE_PO_TIME`
- Bkz. [[Procurement_Intelligence]], [[Warehouse#Akıllı Satın Alma — Geciken PO uyarıları]]

### `scan_expiring_lots_daily`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_SCAN_EXPIRING_LOTS_HOUR` / `MINUTE`
- Bkz. [[Inventory]]

### `sweep_stale_cleaning_tables`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_SWEEP_STALE_CLEANING_TABLES_INTERVAL_MINUTES`
- **İşlev:** ETA kaçırılmış veya Redis/Celery kaybı sonrası takılı `CLEANING` masalarını kurtarır

### `notify_due_reservations`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_NOTIFY_DUE_RESERVATIONS_INTERVAL_MINUTES`
- **İşlev:** Rezervasyon saati gelen kayıtlar için POS/garson uyarısı ([[Reservation_Alerts]])

### `cleanup_redis_stale_keys`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_REDIS_CLEANUP_HOUR` / `MINUTE` (varsayılan 2:30)
- **İşlev:** Broker'da eski `celery-task-meta-*`; cache'de eski RBAC nesilleri, sipariş sayaçları, satış özeti anahtarları; channels'da TTL'siz `asgi:*` anahtarlarını temizler
- **Env:** `REDIS_MAINTENANCE_ENABLED`, `REDIS_CELERY_RESULT_MAX_IDLE_SECONDS`, `REDIS_ORDER_COUNTER_RETENTION_DAYS`, `REDIS_RBAC_PERM_VERSIONS_TO_KEEP`, `REDIS_SALES_SUMMARY_GENERATIONS_TO_KEEP`
- Kaynak: `backend/core/redis_maintenance.py`

### `purge_expired_product_day_availability`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_PURGE_EXPIRED_86_HOUR` / `MINUTE` (varsayılan 5:00)
- **Aç/Kapa:** `BEAT_PURGE_EXPIRED_86_ENABLED` (varsayılan `false`; kapalıyken görev çalışır ama silme yapmaz)
- **İşlev:** `effective_date < bugün` olan aktif `ProductDayAvailability` (86) kayıtlarını soft-delete eder; kayıt başına ve toplu özet [[Audit_Trail]] logu yazar; etkilenen şubelerde menü katalog WS yenilemesi gönderir
- **Kaynak:** `backend/apps/production_planning/services/availability_purge_service.py`
- Bkz. [[Production_Planning#ProductDayAvailability (86 Listesi)]]

### `cleanup_negative_lots`
- **Kuyruk:** `maintenance`
- **Zamanlama:** `BEAT_CLEANUP_NEGATIVE_LOTS_HOUR` / `MINUTE` (varsayılan 3:00)
- **Aç/Kapa:** `NEGATIVE_LOT_CLEANUP_ENABLED` (varsayılan `true`)
- **İşlev:** Negatif stok lotlarını pozitif lotlarla konsolide eder (miktar taşıma). Gece temizliğinde lot bazında FEFO sıralaması korunur.
- **Kaynak:** `backend/apps/inventory/tasks.py`
- Bkz. [[Inventory]]

## Olay tetikli görevler (Beat dışı)

### `execute_receipt_print_job`
- **Kuyruk:** `printing`
- **Tetikleyici:** `POST .../print_thermal/` (üretimde asenkron)
- **Paralellik:** Farklı `printer_id` için görevler aynı anda işlenebilir; aynı yazıcı `printer_escpos_lock` ile serileştirilir
- Bkz. [[Printing]]

### `generate_report_pdf_async` (Yeni)
- **Kuyruk:** `pdf_export`
- **Tetikleyici:** `POST .../generate/?async=true` → `enqueue_pdf_export()`
- **Retry:** max 3, backoff + jitter, `time_limit=300`, `soft_time_limit=240`
- **İşlev:** WeasyPrint ile modül raporu HTML → PDF; sonucu Redis cache'e yazar
- Bkz. [[Async_PDF_Export]]

### `generate_invoice_pdf` (Yeni)
- **Kuyruk:** `pdf_export`
- **Tetikleyici:** `InvoiceService.create_invoice()` → `transaction.on_commit(lambda: generate_invoice_pdf.delay(id))`
- **Retry:** max 3, `time_limit=120`, `soft_time_limit=90`
- **İşlev:** reportlab ile fatura PDF'i üretir; `inv.pdf_file.save()` ile dosyaya yazar
- Bkz. [[Invoices]], [[Async_PDF_Export]]

### `release_table_from_cleaning`
- **Kuyruk:** `maintenance`
- **Tetikleyici:** `TableService.start_cleaning` — `cleaning_until` ETA ile tek seferlik görev
- **İşlev:** Süre dolunca masayı `CLEANING` → `FREE`; WebSocket `table_update`
- Bkz. [[Branches]]

### WebSocket yardımcıları
- `broadcast_kds_refresh_task`, `broadcast_kitchen_order_status_changed_task` — olay anında `.delay()` ile

## Redis ayrımı

`REDIS_URL` (broker, db/0) tanımlıysa varsayılan türetim:

| Amaç | Ortam değişkeni | Varsayılan DB |
|------|-----------------|---------------|
| Celery broker | `REDIS_URL` / `CELERY_BROKER_URL` | `/0` |
| Django cache | `REDIS_CACHE_URL` | `/1` |
| Channels (WebSocket) | `REDIS_CHANNELS_URL` | `/2` |
| Yazıcı ESC/POS kilidi | `REDIS_LOCK_URL` | cache ile aynı (`/1`) |

WebSocket channel layer kapasitesi, Daphne süreç sayısı ve WS throttle env'leri: [[Django_Settings]], [[WebSocket_Architecture]]. `update.sh` Celery worker birimlerinin yanı sıra **Daphne çoklu süreç** nginx upstream'ini de yeniler ([[Deployment]]).

## Yapılandırma
```python
CELERY_BROKER_URL = REDIS_BROKER_URL
CELERY_TASK_IGNORE_RESULT = True
CELERY_RESULT_EXPIRES = 3600  # saniye; celery-task-meta-* birikimini sınırlar
CELERY_TASK_CREATE_MISSING_QUEUES = True
CELERY_TIMEZONE = 'Europe/Istanbul'
CELERY_TASK_TIME_LIMIT = 1800  # 30 dakika
```

Bakım görevleri geçici DB/ağ hatalarında otomatik yeniden dener (`max_retries=3`).

### Beat scheduler (üretim)
`install.sh` Beat servisini `django_celery_beat.schedulers:DatabaseScheduler` ile başlatır. Görevler **veritabanından** okunur; env tanımları `config/celery_beat_schedule.py` ile settings'e yansır.

**Migrate / deploy / Beat env değişikliği sonrası:**
```bash
python manage.py sync_celery_beat_schedule
```
`install.sh` ve `update.sh` migrate adımından sonra bunu otomatik çalıştırır. Ramis Ayar Yöneticisi Beat anahtarları değişince `sync_celery_beat_schedule` + `ramis-beat.service` yeniden başlatmayı önerir.

**Doğrulama:**
```bash
python manage.py shell -c "from django_celery_beat.models import PeriodicTask; print(PeriodicTask.objects.filter(enabled=True).count())"
```
Beklenen: **10** yönetilen periyodik görev (varsayılan kurulum).
