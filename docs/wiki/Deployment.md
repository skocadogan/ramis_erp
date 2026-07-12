# Deployment (Dağıtım ve Altyapı)

> **Özet:** Docker Compose ile yerel geliştirme, systemd ile production dağıtımı. PostgreSQL 16, Redis 7, Daphne (ASGI) ve Next.js (standalone) servisleri. Otomatik kurulum, güncelleme ve kaldırma betikleri.
> **Kütüphaneler:** Docker, systemd, Nginx
> **Bağlantılar:** [[Django_Settings]], [[Mimari_Genel_Bakis]], [[Ramis_Monitor]], [[Backup_Restore]], [[User_Emergency_Admin]], [[Runtime_Config]], [[Standalone_Deploy]], [[ASGI_Split_Deploy]], [[WebSocket_Architecture]], [[Backend_Environment]], [[Frontend_Environment]], [[Load_Testing]]

---

## Yerel Geliştirme (Docker Compose)

`docker-compose.yml` iki servis tanımlar:

| Servis | İmaj | Port |
|--------|------|------|
| PostgreSQL | postgres:16-alpine | 5432 |
| Redis | redis:7-alpine | 6379 |

```bash
docker compose up -d
```

## Production Servisleri (systemd)

**Split ASGI (önerilen üretim):** HTTP → Uvicorn, WebSocket → Daphne. Ayrıntı: [[ASGI_Split_Deploy]].

| Servis | Açıklama |
|--------|----------|
| `ramis-uvicorn.service` | HTTP REST API (Uvicorn), port **9000** |
| `ramis-uvicorn-9001.service` … | Ek Uvicorn süreçleri (`UVICORN_INSTANCES`, max 8) |
| `ramis-daphne.service` | WebSocket ASGI (Daphne), port **8000** |
| `ramis-daphne-8001.service` … | İsteğe bağlı ek Daphne süreçleri (`DAPHNE_INSTANCES` > 1) |
| `ramis-frontend.service` | Next.js standalone (`node .next/standalone/server.js`) |
| `ramis-worker.service` | Celery — `printing` kuyruğu |
| `ramis-worker-maintenance.service` | Celery — `maintenance`, `celery` kuyrukları |
| `ramis-worker-broadcast.service` | Celery — `broadcast` kuyruğu (KDS/POS WS yayınları; bkz. [[Celery_Tasks]], [[WebSocket_Architecture]]) |
| `ramis-beat.service` | Celery Beat (`DatabaseScheduler`) |
| `postgresql.service` | PostgreSQL veritabanı |
| `redis.service` | Redis cache / broker / channel layer |
| `nginx.service` | Reverse proxy (HTTP + WebSocket upgrade) |

### ASGI ölçekleme (Uvicorn + Daphne)

`/etc/ramis/backend.env` örneği:

```bash
UVICORN_INSTANCES=4   # HTTP :9000–9003
DAPHNE_INSTANCES=2    # WS   :8000–8001
```

- `system_utils/uvicorn_units.sh` — Uvicorn systemd + `upstream ramis_uvicorn`
- `system_utils/daphne_units.sh` — Daphne systemd + `upstream ramis_daphne` (eski `ramis_api` adı otomatik yeniden adlandırılır)
- Nginx: `/api/`, `/admin/` → **`ramis_uvicorn`**; `/ws/` → **`ramis_daphne`** (`least_conn`, WS için `proxy_read_timeout 86400`)

```bash
# Birim + upstream yenileme (backend güncellemesinde otomatik)
sudo bash update.sh --backend-only
sudo systemctl restart ramis-daphne ramis-daphne-8001  # örnek: 2 süreç
```

Bkz: [[WebSocket_Architecture]], [[Celery_Tasks]].

## Kurulum Betikleri

| Dosya | İşlev |
|-------|-------|
| `install.sh` (~80KB) | Tam veya API Sunucusu kurulumu: `--backend-only` parametresi verildiğinde frontend (Next.js), Node.js kurulumu, frontend systemd servisi ve frontend Nginx proxy yapılandırması atlanarak sunucu sadece API server olarak kurulur. Normal modda; PostgreSQL, Redis, Python venv, Node, systemd, Nginx kurar. **Kurulum dili (TR/EN)** ve **Örnek veri (seeding)** interaktif seçilebilir. Üretimde `NEXT_PUBLIC_POS_OFFLINE_QUEUE=true` otomatik yazar ([[POS_Offline_Queue]]). `verify_installation()` başarıyla tamamlandıktan sonra `_cleanup_frontend_sources()` ile frontend kaynak dosyaları temizlenir — bkz. [[Standalone_Deploy]]. |
| `update.sh` (~13KB) | Git pull, migration, build, servis restart. Celery worker birimleri ve **Daphne çoklu süreç** nginx upstream'i `--backend-only` / tam güncellemede yenilenir. `--reset-users`, `--reload-roles`, `--lang`, `--change-ip`, `--sync-runtime-config`. EPIC-07: `_merge_frontend_env_prod_defaults()` ile offline kuyruk üretim varsayılanı (`true`). `ramis-frontend` servisi çalışıyor onayının ardından `_cleanup_frontend_sources()` ile kaynak dosyalar temizlenir — bkz. [[Standalone_Deploy]]. |
| `uninstall.sh` (~7KB) | Temiz kaldırma |

## Ortam Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `backend/.env.example` | Geliştirme şablonu → [[Backend_Environment]] |
| `backend/.env.production.example` | Üretim şablonu → [[Backend_Environment]] |
| `/etc/ramis/backend.env` | Production backend — **tam referans:** [[Backend_Environment]] |
| `/etc/ramis/frontend.env` | Production frontend — **tam referans:** [[Frontend_Environment]] |
| `/etc/ramis/runtime-config.json` | API URL + özellik bayrakları (build gerektirmez) — [[Runtime_Config]] |
| `/etc/ramis/lang` | Sistem genelinde tercih edilen dil (tr/en) |

Kapasite doğrulama (Locust): [[Load_Testing]].

## Frontend — Next.js Standalone Modu

`next.config.ts` içinde `output: "standalone"` etkindir. Production'da `next start` yerine `node .next/standalone/server.js` kullanılır. Sistemd birimi (`ramis-frontend.service`) buna göre yapılandırılmıştır.

Ayrıntı: [[Standalone_Deploy]].

## IP Değişimi

Sunucunun IP adresi değiştiğinde frontend rebuild **gerekmez**; `update.sh --change-ip` ile backend/frontend env, runtime-config.json ve Nginx güncellenir.

```bash
sudo bash update.sh --change-ip 192.168.1.50
# veya otomatik tespit:
sudo bash update.sh --change-ip
```

Ayrıntı: [[Runtime_Config]].

## update.sh Modları

| Mod | Komut | Açıklama |
|-----|-------|----------|
| Tam | `sudo bash update.sh` | Backend + frontend + servisler |
| Yalnızca DB | `--db-only` | Migration |
| Yalnızca Backend | `--backend-only` | pip, migrate, collectstatic |
| Yalnızca Frontend | `--frontend-only` | rsync, npm build, servis |
| IP Değiştir | `--change-ip [IP]` | env + runtime-config + Nginx |
| Runtime Sync | `--sync-runtime-config` | EPIC-07 varsayılanı + `/etc/ramis/runtime-config.json`'ı frontend.env'den yeniden yazar |
