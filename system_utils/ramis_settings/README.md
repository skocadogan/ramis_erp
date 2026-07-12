# Ramis Ayar Yöneticisi

GTK4 (Libadwaita) masaüstü uygulaması: `/etc/ramis/backend.env` ve `/etc/ramis/frontend.env` dosyalarını okur, düzenler ve ilgili systemd servislerini yeniden başlatır.

## Gereksinimler

- `python3-gi`, `gir1.2-gtk-4.0`, `gir1.2-adw-1`
- Üretimde dosya okuma/yazma için `pkexec` (PolicyKit)
- `/etc/ramis/backend.env` ve `/etc/ramis/frontend.env` (chmod 600)

## Kurulum

```bash
cd system_utils/ramis_settings
bash install.sh
```

## Çalıştırma

```bash
./run_settings.sh
```

## Geliştirme (pkexec olmadan)

Yerel `.env` dosyaları ile test:

```bash
export RAMIS_SETTINGS_NO_PKEXEC=1
export RAMIS_SETTINGS_BACKEND_ENV=/path/to/backend.env
export RAMIS_SETTINGS_FRONTEND_ENV=/path/to/frontend.env
./run_settings.sh
```

## Kaydetme sonrası servisler

Değişen anahtarlara göre önerilen birimler otomatik hesaplanır (bkz. `docs/wiki/Backend_Environment.md`):

- PostgreSQL / güvenlik / iş kuralları → Daphne + Celery worker'lar
- Redis / Channels / `DAPHNE_INSTANCES` → Daphne + worker + nginx
- `KDS_RECALL_WINDOW_MINUTES` → Daphne + Celery worker'lar
- Celery Beat zamanlamaları (`BEAT_*`, `PRINTER_STATUS_SYNC_INTERVAL_MINUTES`, `PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS`, `BEAT_REDIS_CLEANUP_*`) → `sync_celery_beat_schedule` + `ramis-beat.service`
- **Zamanlanmış görevler** sekmesinde her görev için **Çalıştır** — `manage.py run_celery_beat_task <beat_key>` ile maintenance kuyruğuna ekler (`pkexec` gerekir)
- Redis bakım eşikleri (`REDIS_MAINTENANCE_*`, `REDIS_*_RETENTION_*`, `CELERY_RESULT_EXPIRES_SECONDS`) → Celery worker'lar
- `FISCAL_WEBHOOK_BASE_URL` → Daphne + Uvicorn + Celery worker'lar (Token X-Connect webhook taban URL)
- Yazdırma kuyruğu (`PRINT_THERMAL_SYNC`, `PRINT_JOB_*`, `CELERY_PRINTING_WORKER_CONCURRENCY`) → Celery worker'lar; concurrency değişince `update.sh --sync-celery-workers` + `ramis-worker`
- Frontend `NEXT_PUBLIC_*` → `ramis-frontend.service` (+ runtime-config senkronu)

Kayıt öncesi `.bak.YYYYMMDD_HHMMSS` yedeği alınır.

## Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `ramis_settings.py` | Ana GTK4 arayüz |
| `env_io.py` | .env parse/yazma (yorumları korur) |
| `settings_schema.py` | Alan tanımları ve restart eşlemesi |
| `settings_privileged.py` | pkexec ile root işlemleri |
| `run_privileged.sh` | pkexec sarmalayıcı |
