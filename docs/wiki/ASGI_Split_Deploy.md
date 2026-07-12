# ASGI Split Deploy (Uvicorn HTTP + Daphne WebSocket)

> **Özet:** Üretimde HTTP REST API trafiği Uvicorn süreçlerine (9000–9007), WebSocket trafiği Daphne süreçlerine (8000–8003) ayrılır. Nginx `ramis_uvicorn` ve `ramis_daphne` upstream'leri ile yönlendirir; PostgreSQL idle bağlantı birikimini önlemek için split modda `CONN_MAX_AGE=0` kullanılır.
> **Kütüphaneler:** Uvicorn, Daphne, Nginx, systemd, PostgreSQL
> **Bağlantılar:** [[Deployment]], [[WebSocket_Architecture]], [[Backend_Environment]], [[Health_Endpoint]], [[Django_Settings]]

---

## Neden ayrıldı?

Monolitik çoklu Daphne sürecinde hem HTTP hem WS aynı worker havuzunu paylaşır; yoğun KDS/POS WebSocket yükü REST gecikmesini artırabilir. Split mimaride:

| Katman | Süreç | Port aralığı | Nginx location |
|--------|--------|--------------|----------------|
| HTTP API | `ramis-uvicorn.service` (+ `ramis-uvicorn-9001` …) | `9000 + i` | `/api/`, `/admin/`, `/` (API host) |
| WebSocket | `ramis-daphne.service` (+ `ramis-daphne-8001` …) | `8000 + i` | `/ws/` |
| Frontend | `ramis-frontend.service` | Next standalone | `/` (tek domain şablonunda `ramis_next`) |

`system_utils/daphne_units.sh` — nginx yaması: eski `upstream ramis_api` adı **`ramis_daphne`** olarak yeniden adlandırılır; `/ws/` → `http://ramis_daphne`, `/api/` → `http://ramis_uvicorn`.

## Otomatik tespit

`RAMIS_ASGI_SPLIT` veya ortam birleşimi:

- `UVICORN_INSTANCES ≥ 1` **ve** `DAPHNE_INSTANCES ≥ 1` → split aktif
- `backend` settings: Django `CONN_MAX_AGE=0` (kalıcı bağlantı kapalı); env'deki `POSTGRES_CONN_MAX_AGE=60` bile yok sayılır (`core.postgres_connection.resolve_postgres_conn_max_age`)
- **Opt-in istisna:** `/etc/ramis/backend.env` veya systemd `Environment=` ile `RAMIS_DB_PERSISTENT_CONNECTIONS=true` → `POSTGRES_CONN_MAX_AGE` (varsayılan `60`) devreye girer. Standart kurulumda set etmeyin; bkz. [[Backend_Environment#2. PostgreSQL]]
- `update.sh` → `system_utils/postgresql_scaling.sh`: `idle_session_timeout=600s`, `max_connections` formülü split süreç sayısına göre

Bkz. [[Backend_Environment#2. PostgreSQL]].

## systemd birimleri

| Birim | Betik kaynağı | Varsayılan ölçek |
|-------|---------------|------------------|
| `ramis-uvicorn.service` | `system_utils/uvicorn_units.sh` | `UVICORN_INSTANCES=4` (max 8) |
| `ramis-daphne.service` | `system_utils/daphne_units.sh` | `DAPHNE_INSTANCES=1–4` |
| Celery worker/beat | değişmedi | `broadcast` kuyruğu WS yayınları |

Kurulum/güncelleme: `install.sh` ve `update.sh --backend-only` birimleri ve nginx upstream satırlarını yeniden üretir.

## PostgreSQL bağlantı stabilizasyonu (2026-06)

Split + çoklu Uvicorn worker'da thread başına idle oturum birikimi `max_connections` tüketimine yol açar. Çözüm paketi:

1. Django `CONN_MAX_AGE=0` — istek/işlem sonunda bağlantı kapanır (split modda `POSTGRES_CONN_MAX_AGE` env değeri override edilir)
2. PG `idle_session_timeout` — kaçan oturumlar için emniyet (600 sn)
3. `postgresql_scaling.sh` — eşzamanlı süreç + Celery için `max_connections` önerisi

Kalıcı bağlantıyı split deploy'da bilerek açmak için (genelde önerilmez):

```bash
# /etc/ramis/backend.env
RAMIS_DB_PERSISTENT_CONNECTIONS=true
POSTGRES_CONN_MAX_AGE=60
```

Servis yeniden başlatma: `sudo systemctl restart 'ramis-uvicorn*' 'ramis-daphne*'`.

Gözlem: `pg_stat_activity` içinde `application_name` (`RAMIS_DB_APPLICATION_NAME`, systemd biriminden).

## Geliştirme vs üretim

- **Geliştirme:** Tek `runserver` veya tek Daphne/Uvicorn — split zorunlu değil
- **Üretim:** Split önerilir; Redis Channels zorunlu ([[WebSocket_Architecture]])

## İlgili dosyalar

| Dosya | Rol |
|-------|-----|
| `system_utils/uvicorn_units.sh` | Uvicorn systemd + upstream satırları |
| `system_utils/daphne_units.sh` | Daphne systemd + nginx patch (Python gömülü) |
| `system_utils/postgresql_scaling.sh` | `max_connections`, idle timeout |
| `config/asgi.py` | ASGI uygulama girişi (her iki sunucu aynı modülü yükler) |
