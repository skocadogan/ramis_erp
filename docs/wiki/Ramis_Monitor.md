# Ramis Monitor (Servis İzleyici)

> **Özet:** GTK4/Libadwaita tabanlı masaüstü uygulaması. PostgreSQL, Daphne, Next.js ve Redis servislerinin durumunu izler, başlatma/durdurma/yeniden başlatma ve canlı log akışı sağlar.
> **Kütüphaneler:** GTK4, Libadwaita (Adw), Python, systemd, journalctl
> **Bağlantılar:** [[Deployment]], [[Backup_Restore]], [[User_Emergency_Admin]]

---

## Konum
`system_utils/ramis_monitor/`

## Dosyalar
| Dosya | İçerik |
|-------|--------|
| `ramis_monitor.py` | Ana uygulama kodu |
| `../beat_jobs_catalog.py` | Celery Beat görev metadata (Monitor zamanlanmış sekmesi) |
| `install.sh` | Kurulum betiği |
| `run_monitor.sh` | Çalıştırma betiği |
| `uninstall.sh` | Kaldırma betiği |

## İzlenen Servisler

Liste uygulama açılışında `build_monitored_services()` ile oluşturulur. Daphne satır sayısı `/etc/ramis/backend.env` → `DAPHNE_INSTANCES` (1–4) ile `system_utils/daphne_units.sh` ile aynı kurallara uyar.

| Servis | Açıklama |
|--------|----------|
| `postgresql.service` | PostgreSQL |
| `redis.service` | Redis (broker, cache, channels) |
| `nginx.service` | Reverse proxy + WS upgrade |
| `ramis-daphne.service` | Backend ASGI — port **8000** |
| `ramis-daphne-8001.service` … | Ek Daphne süreçleri (`DAPHNE_INSTANCES` > 1) |
| `ramis-worker.service` | Celery — `printing` kuyruğu |
| `ramis-worker-maintenance.service` | Celery — `maintenance`, `celery` |
| `ramis-worker-broadcast.service` | Celery — `broadcast` kuyruğu (KDS/POS WS yayınları) |
| `ramis-beat.service` | Celery Beat |
| `ramis-frontend.service` | Next.js standalone |

`DAPHNE_INSTANCES` değiştirildikten sonra Monitor'ü yeniden başlatın. Tam liste: [[Deployment]], [[WebSocket_Architecture]].

## Özellikler
- **Durum İzleme:** Aktif/Pasif/Başlatılıyor durumları (10 sn otomatik yenileme)
- **Zamanlanmış Görevler:** Celery Beat kataloğu (9 görev; Redis temizliği dahil) — env'den çözümlenen saatler
- **Toplu İşlemler:** Tümünü başlat/durdur/yeniden başlat
- **Canlı Loglar:** `journalctl -f` ile gerçek zamanlı log akışı
- **pkexec:** Root işlemleri için polkit yetkilendirme
