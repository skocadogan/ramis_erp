# Backend Ortam Değişkenleri (`backend.env`)

> **Özet:** Django API, Celery, Channels ve WebSocket katmanının tüm yapılandırması ortam değişkenleriyle yönetilir. Geliştirmede `backend/.env`, üretimde `/etc/ramis/backend.env` kullanılır; systemd birimleri bu dosyayı `EnvironmentFile` ile yükler.
> **Kütüphaneler:** Django 6, PostgreSQL, Redis, Daphne, Celery, SimpleJWT
> **Bağlantılar:** [[Django_Settings]], [[Deployment]], [[WebSocket_Architecture]], [[Celery_Tasks]], [[Auth_Flow]], [[Smart_Firing_v2]], [[Load_Testing]], [[Frontend_Environment]]

---

## Dosya konumları

| Ortam | Şablon (repoda) | Aktif dosya |
|-------|-----------------|-------------|
| Geliştirme | `backend/.env.example` → kopyala `.env` | `backend/.env` (gitignore) |
| Üretim | `backend/.env.production.example` | `/etc/ramis/backend.env` (`chmod 600`) |

Django dosyayı **otomatik okumaz**. Yükleme:

```bash
# Geliştirme
set -a && source backend/.env && set +a && cd backend && python manage.py runserver

# Üretim — systemd zaten EnvironmentFile=-/etc/ramis/backend.env kullanır
sudo systemctl restart ramis-daphne.service ramis-celery.service ramis-celery-beat.service
```

Kaynak kod: `backend/config/settings.py`, `backend/core/redis_urls.py`, `backend/apps/users/ws_auth.py`, `backend/core/ws_throttle.py`.

---

## Değişiklik sonrası ne yeniden başlatılır?

| Değişen grup | Etkilenen servisler |
|--------------|---------------------|
| PostgreSQL, JWT, RBAC, iş kuralları | Daphne + (gerekirse) Celery worker |
| Redis / Channels / `DAPHNE_INSTANCES` | Daphne (tüm `ramis-daphne*` birimleri), nginx upstream (`update.sh`) |
| Celery beat görev aralığı | `ramis-celery-beat` + `manage.py sync_celery_beat_schedule` |
| Yalnızca Celery task kodu | Celery worker |

`update.sh` WebSocket anahtarlarını eksikse `backend.env`'e ekler: `_merge_backend_env_ws_defaults()`. Bkz: [[Deployment]].

---

## Ölçeklendirme — hızlı rehber

Ramis hedef segmentinde (masa servisi restoran) tipik eşzamanlı oturum **15–30** bandındadır. Locust peak testi (~50 sanal kullanıcı, ~6 RPS) bu segmentin **çok üstünde** yapay yük oluşturur; buna rağmen %99,7+ başarı alındı. Aşağıdaki değerler bu test ve `update.sh` varsayılanlarıyla uyumludur.

| Senaryo | Önerilen ayarlar |
|---------|------------------|
| Tek şube, ≤20 eşzamanlı POS/KDS/garson | `DAPHNE_INSTANCES=1`, varsayılan Redis |
| Yoğun akşam, çoklu WS (POS + KDS + garson) | `DAPHNE_INSTANCES=2`, `CHANNEL_LAYER_CAPACITY=8000`, `WS_AUTH_CACHE_SECONDS=60` |
| Stres / çok istemci WS | `DAPHNE_INSTANCES=3–4` (max 4), `CHANNEL_LAYER_EXPIRY=120`, `WS_KDS_STATS_THROTTLE_SECONDS=2` |
| PostgreSQL bağlantı baskısı | Split ASGI: `POSTGRES_CONN_MAX_AGE=0`; `update.sh` PG `max_connections` + `idle_session_timeout` ayarlar |

Detaylı test profili: [[Load_Testing]].

---

## 1. Zorunlu ve güvenlik

| Değişken | Varsayılan (dev) | Açıklama |
|----------|------------------|----------|
| `DJANGO_SECRET_KEY` | Geliştirme anahtarı | **Üretimde zorunlu.** `openssl rand -hex 48` |
| `DJANGO_DEBUG` | `true` | `false` → HTTPS, HSTS, sıkı güvenlik başlıkları |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Virgülle API host'ları. LAN IP için ekleyin |
| `CSRF_TRUSTED_ORIGINS` | `http://localhost:3000,...` | Frontend kök URL'leri (tam şema + port) |
| `CORS_EXTRA_ORIGINS` | boş | Ek frontend origin'leri; `DEBUG=true` iken RFC1918 regex de açılır |
| `SECURE_SSL_REDIRECT` | üretimde `true` | Nginx `X-Forwarded-Proto: https` gerekir |
| `SECURE_HSTS_SECONDS` | 1 yıl | HSTS süresi (saniye) |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS` | `false` | Alt domain HSTS |
| `SECURE_HSTS_PRELOAD` | `false` | HSTS preload listesi |

IP değişimi: `sudo bash update.sh --change-ip <IP>` — `ALLOWED_HOSTS`, CSRF/CORS, `frontend.env` ve `runtime-config.json` birlikte güncellenir. Bkz: [[Runtime_Config]].

---

## 2. PostgreSQL

`POSTGRES_DB` tanımlı değilse SQLite kullanılır (yalnızca geliştirme).

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `POSTGRES_DB` | — | Veritabanı adı |
| `POSTGRES_USER` | `postgres` | DB kullanıcısı |
| `POSTGRES_PASSWORD` | boş | Şifre |
| `POSTGRES_HOST` | `localhost` | Sunucuda `127.0.0.1` tercih edin |
| `POSTGRES_PORT` | `5432` | Port |
| `POSTGRES_CONNECT_TIMEOUT` | `10` | Bağlantı timeout (sn) |
| `POSTGRES_CONN_MAX_AGE` | Split: `0`; monolit: `60` | Kalıcı bağlantı (sn). Split ASGI'de varsayılan **0**; env'deki `60` bile yok sayılır (`core.postgres_connection`) |
| `RAMIS_DB_PERSISTENT_CONNECTIONS` | kapalı | Split ASGI'de kalıcı bağlantıyı bilinçli açmak için `true` (`1`/`yes`/`on`). Açıkken `POSTGRES_CONN_MAX_AGE` (varsayılan `60`) geçerli olur. Set edilmezse split modda `CONN_MAX_AGE=0` kalır — bkz. [[ASGI_Split_Deploy]] |
| `RAMIS_ASGI_SPLIT` | otomatik | `true`/`false` ile split tespitini zorla (genelde gerekmez) |
| `RAMIS_DB_APPLICATION_NAME` | otomatik | `pg_stat_activity.application_name`; systemd birimlerinde set edilir |

**Split ASGI stratejisi** (`UVICORN_INSTANCES≥1` ve `DAPHNE_INSTANCES≥1`) — bkz. [[ASGI_Split_Deploy]]:

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `UVICORN_INSTANCES` | `4` | HTTP Uvicorn süreç sayısı (port 9000+) |
| `DAPHNE_INSTANCES` | `1` | WebSocket Daphne süreç sayısı (port 8000+) |

- Django `CONN_MAX_AGE=0`: split modda her istek/işlem sonunda bağlantı kapanır; 60 idle oturum birikmez. İstisna: `RAMIS_DB_PERSISTENT_CONNECTIONS=true` → `POSTGRES_CONN_MAX_AGE` kullanılır (ileri seviye; `max_connections` riski).
- PostgreSQL `idle_session_timeout=600s`: `update.sh` ile ayarlanır (kaçan oturumlar için emniyet).
- `max_connections`: `system_utils/postgresql_scaling.sh` — eşzamanlı sorgu + Celery formülü.

**Ölçeklendirme:** Kalıcı bağlantı (`CONN_MAX_AGE>0`) kullanıyorsanız süreç×thread idle birikimi `max_connections` tüketir; split mimaride **0 kullanın**.

---

## 3. Redis, cache ve Channels

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `REDIS_URL` | boş → bellek | Ana Redis URL; `/0` broker |
| `REDIS_CACHE_URL` | `REDIS_URL` db `/1` | Django cache |
| `REDIS_CHANNELS_URL` | `REDIS_URL` db `/2` | Django Channels layer |
| `REDIS_LOCK_URL` | cache URL | Yazıcı kilidi vb. |
| `CELERY_BROKER_URL` | `REDIS_URL` | Celery broker override |
| `REDIS_SOCKET_CONNECT_TIMEOUT` | `10` | Redis bağlantı timeout (sn) |
| `REDIS_CHANNELS_SOCKET_TIMEOUT` | `30` | Channels Redis okuma timeout (sn); `channels_redis` BRPOP ~5 sn — bu değer daha düşükse logda `Timeout reading from 127.0.0.1:6379` ve WS kopması görülür |
| `CHANNEL_LAYER_CAPACITY` | `8000` | Kanal kuyruğu kapasitesi (mesaj drop eşiği) |
| `CHANNEL_LAYER_EXPIRY` | `120` | Kuyruktaki mesaj TTL (sn) |
| `REDIS_MAINTENANCE_ENABLED` | `true` | Gece Redis temizlik görevi |
| `REDIS_CELERY_RESULT_MAX_IDLE_SECONDS` | `3600` | Broker'da idle `celery-task-meta-*` eşiği |
| `REDIS_ORDER_COUNTER_RETENTION_DAYS` | `3` | Eski `branch_order_num:*` saklama |
| `REDIS_RBAC_PERM_VERSIONS_TO_KEEP` | `2` | RBAC izin cache nesil sayısı |
| `REDIS_SALES_SUMMARY_GENERATIONS_TO_KEEP` | `3` | Satış özeti nesil sayısı |
| `CELERY_RESULT_EXPIRES_SECONDS` | `3600` | Celery sonuç meta TTL |

Redis yoksa: `InMemoryChannelLayer` + `LocMemCache` (tek süreç; üretimde **kullanmayın**).

Bkz: [[WebSocket_Architecture]], [[Celery_Tasks]].

---

## 4. WebSocket ve Daphne (ASGI)

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `DAPHNE_INSTANCES` | `1` (max **4**) | Paralel ASGI süreç sayısı; nginx `least_conn` upstream |
| `WS_AUTH_CACHE_SECONDS` | `60` | WS el sıkışmasında JWT→user önbelleği (DB yükünü azaltır) |
| `WS_KDS_STATS_THROTTLE_SECONDS` | `2` | Şube başına `broadcast_kds_stats` minimum aralık |
| `WS_BYPASS_CELERY` | `false` | **Celery Bypass (Düşük Gecikme):** Açıldığında, POS-KDS-Garson arası WebSocket yayınları Celery kuyruğu yerine doğrudan Redis üzerinden iletilir. Gecikmeyi <10ms seviyesine düşürür. |
| `CELERY_BROADCAST_WORKER_CONCURRENCY` | `4` | `ramis-worker-broadcast` `broadcast` kuyruğu eşzamanlılığı (`--concurrency`). KDS/POS gerçek zamanlı yayınlarını işleyen worker; **çalışmıyorsa WS iletişimi durur**. Bkz: [[Celery_Tasks]], [[WebSocket_Architecture]] |
| `CELERY_MAINTENANCE_WORKER_CONCURRENCY` | `2` | `ramis-worker-maintenance` `maintenance` kuyruğu eşzamanlılığı (`--concurrency`). Beat görevleri, otomatik masa kapama, dashboard cache warm-up vb. |

`system_utils/daphne_units.sh`: `DAPHNE_INSTANCES` değerine göre `ramis-daphne`, `ramis-daphne-8001` … birimleri oluşturulur.

`system_utils/celery_worker_units.sh`: `broadcast` kuyruğu için `ramis-worker-broadcast.service`, `maintenance` için `ramis-worker-maintenance.service` birimlerini üretir (`CELERY_BROADCAST_WORKER_CONCURRENCY`, `CELERY_MAINTENANCE_WORKER_CONCURRENCY`).

Kapalı WS'e mesaj gönderimi: `core/ws_consumer.ws_safe_send` (Disconnected yutulur).

---

## 5. JWT, oturum ve RBAC

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `JWT_REFRESH_TOKEN_DAYS` | `3` | Refresh token ömrü (gün) |
| `SESSION_COOKIE_AGE_SECONDS` | `259200` (3 gün) | Django session çerezi |
| `RBAC_CACHE_TTL` | `120` | İzin önbelleği (sn); düşürürseniz değişiklikler daha hızlı yansır |
| `POS_DISPLAY_WS_TOKEN_MAX_AGE` | `86400` | Müşteri ekranı WS imza süresi (sn) |

Access token süresi kodda **30 dakika** (env ile değişmez). Bkz: [[Auth_Flow]], [[RBAC]].

DRF throttle (kod): anon `30/dk`, user `500/dk` — env değil; yoğun load testte 429 görülebilir.

---

## 6. Stok ve envanter

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `STOCK_RESERVATION_ENABLED` | `true` | Sipariş stok rezervasyonu |
| `STOCK_RESERVATION_EXPIRY_HOURS` | `24` | Süresi dolan rezervasyon temizliği (Beat: `BEAT_CLEANUP_RESERVATIONS_*`) |
| `PRODUCTION_STOCK_RESERVATION_ENABLED` | `true` | PrepTask tamamlanınca üretim stok düşümü |
| `FEFO_COSTING_ENABLED` | `false` | Çıkış hareketlerinde lot bazlı FEFO `unit_price` — bkz. [[Inventory]] |
| `EXPIRY_ACTION_AUTOMATION_ENABLED` | `false` | SKT aksiyon otomasyonu (preview/execute) — bkz. [[Inventory]] |
| `EXPIRY_FEFO_BOOST_VALUE` | `100` | Öncelikli tüketim FEFO boost değeri |
| `EXPIRY_FEFO_BOOST_HOURS` | `48` | FEFO boost geçerlilik süresi (saat) |
| `EXPIRY_PREP_PRIORITY_DELTA` | `5` | Prep görev priority artışı |
| `EXPIRY_TRANSFER_IDEMPOTENCY_HOURS` | `24` | Aynı lot için tekrar DRAFT transfer engeli |
| `EXPIRY_WARNING_DAYS_DEFAULT` | `3` | SKT listesi varsayılan penceresi |
| `EXPIRY_WARNING_DAYS_OPTIONS` | `3,7` | İzin verilen `days_ahead` değerleri |
| `NEGATIVE_LOT_CLEANUP_ENABLED` | `true` | Gece negatif lot konsolidasyonu — açık/kapalı |

---

## 7. Smart Firing v2

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `ENABLE_SMART_FIRING_V2` | kapalı | `true` ile v2 zamanlama |
| `SMART_FIRING_QUEUE_DEPTH_THRESHOLD` | `8` | Kuyruk derinlik eşiği |
| `SMART_FIRING_BACKLOG_MINUTE_FACTOR` | `2` | Geri yük dakika çarpanı |
| `SMART_FIRING_QUEUE_BUFFER_CAP` | `30` | Tampon üst sınır |
| `SMART_FIRING_LEARNED_MIN_SAMPLES` | `5` | EMA öğrenme minimum örnek |
| `SMART_FIRING_UI_BUSY_THRESHOLD` | `15` | POS/mobil kehribar buton ve sipariş sonrası toast eşiği (dk, 1–120) |
| `KDS_RECALL_WINDOW_MINUTES` | `15` | KDS geri çağır drawer: servise gönderilmiş kalemlerin listede kalma süresi (dk, 1–120). Bkz. [[Orders#KDS geri çağır]], [[Frontend_KDS]] |

Davranış: [[Smart_Firing_v2]].

---

## 8. Yazdırma

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `PRINT_THERMAL_SYNC` | üretimde `false` | `true` → fiş API isteği içinde senkron (worker gerekmez) |
| `CELERY_PRINTING_WORKER_CONCURRENCY` | `4` | `ramis-worker` printing kuyruğu eşzamanlılığı (`--concurrency`) |
| `PRINT_JOB_REQUEUE_PENDING_SECONDS` | `45` | Beat: eski PENDING işleri yeniden kuyruğa alma eşiği |
| `PRINT_JOB_STALE_PROCESSING_SECONDS` | `180` | Beat: takılı PROCESSING → FAILED eşiği |
| `PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS` | `30` | Beat: `maintain_print_job_queue` aralığı |
| `PRINT_JOB_MAINTENANCE_BATCH_SIZE` | `100` | Beat bakımında işlenecek max kayıt |

Celery `printing` kuyruğu. Bkz: [[Printing]], [[Celery_Tasks]].

---

## 9. Mali entegrasyon (Token X-Connect Cloud)

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `FISCAL_WEBHOOK_BASE_URL` | boş (dev) / kurulumda `http://<API_HOST>` | Public API kök URL (path yok). Terminal webhook adresi: `{base}/api/v1/sales/fiscal/webhook/{terminal_id}/`. Token **Set Client Settings** ile kaydedilir. Bkz: [[Fiscal_Integration]] |

`install.sh` kurulumda `API_DOMAIN` ile otomatik yazar; `update.sh` `--change-ip` ve `_merge_backend_env_fiscal_defaults()` eksik anahtarı ALLOWED_HOSTS'tan türetir. **Ramis Ayar Yöneticisi** (`system_utils/ramis_settings`) **Mali entegrasyon (ÖKC)** sekmesinden düzenlenebilir. Tanımlı değilse admin panelinde webhook URL gösterilmez; polling fallback kullanılır. Canlı kurulum adımları: [[Fiscal_Integration_Production]].

---

## 10. Celery Beat zamanlamaları

Tüm periyodik görev saatleri `backend.env` üzerinden yapılandırılır; `settings.py` → `config/celery_beat_schedule.py` ile `CELERY_BEAT_SCHEDULE` üretilir. Saat dilimi: **Europe/Istanbul**.

Üretimde Beat `DatabaseScheduler` kullanır — env değişikliği sonrası **`python manage.py sync_celery_beat_schedule`** ( `update.sh` / migrate sonrası otomatik; Ramis Ayar Yöneticisi kayıt sonrası da çalıştırır).

| Değişken | Varsayılan | Görev |
|----------|------------|-------|
| `BEAT_CLEANUP_RESERVATIONS_HOUR` | `3` | Süresi dolmuş stok rezervasyonları — saat |
| `BEAT_CLEANUP_RESERVATIONS_MINUTE` | `0` | ↑ — dakika (`STOCK_RESERVATION_EXPIRY_HOURS` ile birlikte) |
| `BEAT_ROLLUP_PRODUCT_STATION_TIMING_HOUR` | `3` | Smart Firing EMA rollup — saat |
| `BEAT_ROLLUP_PRODUCT_STATION_TIMING_MINUTE` | `15` | ↑ — dakika |
| `PRINTER_STATUS_SYNC_INTERVAL_MINUTES` | `5` | Yazıcı online/offline kontrolü (dakika aralığı) |
| `BEAT_SCAN_KITCHEN_LOW_STOCK_HOUR` | `4` | Mutfak düşük stok / eksik listesi taraması — saat |
| `BEAT_SCAN_KITCHEN_LOW_STOCK_MINUTE` | `0` | ↑ — dakika |
| `BEAT_SCAN_OVERDUE_PO_HOUR` | `5` | Geciken satın alma siparişi taraması — saat |
| `BEAT_SCAN_OVERDUE_PO_MINUTE` | `0` | ↑ — dakika |
| `BEAT_SCAN_EXPIRING_LOTS_HOUR` | `4` | SKT risk lot taraması — saat |
| `BEAT_SCAN_EXPIRING_LOTS_MINUTE` | `30` | ↑ — dakika |
| `BEAT_SWEEP_STALE_CLEANING_TABLES_INTERVAL_MINUTES` | `1` | Temizlikte takılı masaları kurtarma |
| `BEAT_NOTIFY_DUE_RESERVATIONS_INTERVAL_MINUTES` | `1` | Rezervasyon saati uyarısı |
| `BEAT_REDIS_CLEANUP_HOUR` | `2` | Redis asılı anahtar temizliği — saat |
| `BEAT_REDIS_CLEANUP_MINUTE` | `30` | ↑ — dakika |
| `BEAT_PURGE_EXPIRED_86_ENABLED` | `false` | Geçmiş 86 kayıt temizliği — açık/kapalı |
| `BEAT_PURGE_EXPIRED_86_HOUR` | `5` | Geçmiş 86 temizliği — saat |
| `BEAT_PURGE_EXPIRED_86_MINUTE` | `0` | ↑ — dakika |
| `BEAT_CLEANUP_NEGATIVE_LOTS_HOUR` | `3` | Negatif lot konsolidasyonu — saat |
| `BEAT_CLEANUP_NEGATIVE_LOTS_MINUTE` | `0` | ↑ — dakika |

Detay: [[Celery_Tasks]], [[Celery_Beat_Sync]], [[Production_Planning#Gece otomatik temizlik (86)]], [[Procurement_Intelligence]].

---

## 11. Diğer (geliştirici / acil araçlar)

| Değişken | Açıklama |
|----------|----------|
| `RAMIS_USER_ADMIN_ALLOW_SYSTEM_PYTHON` | Acil GTK admin CLI — venv yoksa sistem Python (üretimde önerilmez). Bkz: [[User_Emergency_Admin]] |

---

## İlgili okuma

- Mimari özet: [[Django_Settings]]
- Kurulum ve `update.sh`: [[Deployment]]
- Frontend tarafı: [[Frontend_Environment]]
- Kapasite doğrulama: [[Load_Testing]]
