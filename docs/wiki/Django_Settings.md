# Django Settings (Proje Yapılandırması)

> **Özet:** Django 6 ayarları ve ortam değişkenleri. PostgreSQL/SQLite veritabanı, Redis cache/channel layer, Celery, JWT, CORS, güvenlik başlıkları ve RBAC konfigürasyonu tek dosyada yönetilir.
> **Kütüphaneler:** Django 6, SimpleJWT, Celery, channels_redis
> **Bağlantılar:** [[Mimari_Genel_Bakis]], [[Auth_Flow]], [[RBAC]], [[Celery_Tasks]], [[Deployment]], [[Smart_Firing_v2]], [[WebSocket_Architecture]], [[Backend_Environment]], [[Load_Testing]]

---

## Konum
`backend/config/settings.py`

**Tam ortam değişkeni referansı (tablolar, ölçeklendirme, yeniden başlatma):** [[Backend_Environment]].

## Veritabanı
- `POSTGRES_DB` ortam değişkeni varsa → PostgreSQL 16
- Yoksa → SQLite3 (geliştirme modu)
- `POSTGRES_CONNECT_TIMEOUT` ve `POSTGRES_CONN_MAX_AGE` ile bağlantı havuzu

## Cache & Channel Layer
- `REDIS_URL` varsa → `RedisChannelLayer` + `RedisCache` (db ayrımı: bkz. [[Celery_Tasks]])
- Yoksa → `InMemoryChannelLayer` + `LocMemCache`
- Yardımcı: `backend/core/redis_urls.py` — broker/cache/channels/lock URL türetimi

| Ortam değişkeni | Varsayılan | Açıklama |
|-----------------|------------|----------|
| `REDIS_CHANNELS_URL` | `REDIS_URL` db `/2` | Django Channels layer |
| `CHANNEL_LAYER_CAPACITY` | **8000** | Kanal kuyruğu kapasitesi (mesaj drop eşiği) |
| `CHANNEL_LAYER_EXPIRY` | **120** (sn) | Kuyrukta mesaj TTL |
| `WS_AUTH_CACHE_SECONDS` | **60** | WS el sıkışmasında JWT → user önbelleği |
| `WS_KDS_STATS_THROTTLE_SECONDS` | **2** | `broadcast_kds_stats` şube başına minimum aralık |
| `DAPHNE_INSTANCES` | **1** (max 4) | ASGI süreç sayısı; bkz. [[Deployment]] |

Bkz: [[WebSocket_Architecture]].

## ASGI
```python
ASGI_APPLICATION = 'config.asgi.application'
```
Daphne ile WebSocket desteği. Bkz: [[WebSocket_Architecture]].

## JWT Ayarları
| Ayar | Değer |
|------|-------|
| Access Token | 30 dakika |
| Refresh Token | 3 gün (env ile ayarlanabilir) |
| Rotate Refresh | Evet |
| Blacklist After Rotation | Evet |

## Güvenlik (Production)
- HTTPS zorunluluğu (`SECURE_SSL_REDIRECT`)
- HSTS, CSP, Permissions Policy
- Cookie güvenlik bayrakları
- Rate limiting: anon 30/dk, user 500/dk
- `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_EXTRA_ORIGINS` — `/etc/ramis/backend.env`'den okunur; sabit IP **yoktur**. `update.sh --change-ip` ile otomatik güncellenir. Bkz: [[Runtime_Config]].

## Celery
- Broker & Backend: Redis
- Beat: 7 periyodik görev — zamanlamalar `backend.env` (`config/celery_beat_schedule.py`); bkz. [[Celery_Tasks]], [[Backend_Environment#9. Celery Beat zamanlamaları]]
- Task time limit: 30 dakika

## Smart Firing v2 (sipariş / mutfak)
Ortam değişkenleri: `ENABLE_SMART_FIRING_V2`, `SMART_FIRING_QUEUE_DEPTH_THRESHOLD`, `SMART_FIRING_BACKLOG_MINUTE_FACTOR`, `SMART_FIRING_QUEUE_BUFFER_CAP`, `SMART_FIRING_LEARNED_MIN_SAMPLES`, `SMART_FIRING_UI_BUSY_THRESHOLD`. Tablo ve davranış: [[Smart_Firing_v2]]; değer tanımları bu dosyada (`backend/config/settings.py`).

## Önemli Ayarlar
```python
LANGUAGE_CODE = 'tr-tr'
TIME_ZONE = 'Europe/Istanbul'
RBAC_CACHE_TTL = 120
POS_DISPLAY_WS_TOKEN_MAX_AGE = 86400
FISCAL_WEBHOOK_BASE_URL = os.environ.get('FISCAL_WEBHOOK_BASE_URL', '')  # Token X-Connect webhook kökü
```
