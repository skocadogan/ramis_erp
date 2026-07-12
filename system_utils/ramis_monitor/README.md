# Ramis ERP Servis İzleyici (Widget)

GNOME masaüstünde Ramis ERP kritik servislerinin durumunu izlemek ve yönetmek için GTK4/Libadwaita uygulaması.

## İzlenen servisler

| systemd birimi | Açıklama |
|----------------|----------|
| `postgresql.service` | PostgreSQL veritabanı |
| `redis.service` | Redis — broker (db/0), cache (db/1), channels (db/2) |
| `nginx.service` | HTTP ters vekil (:80) |
| `ramis-daphne.service` | Django ASGI — birincil süreç (port **8000**) |
| `ramis-daphne-8001.service` … | `DAPHNE_INSTANCES` > 1 ise ek süreçler (8001–8003) |
| `ramis-uvicorn.service` | Uvicorn ASGI — birincil HTTP API süreci (port **9000**) |
| `ramis-uvicorn-9001.service` … | `UVICORN_INSTANCES` > 1 ise ek HTTP süreçleri (9001–9007) |
| `ramis-worker.service` | Celery worker — **printing** kuyruğu (termal baskı) |
| `ramis-worker-maintenance.service` | Celery worker — **maintenance** kuyruğu (gece işleri, yazıcı sync) |
| `ramis-beat.service` | Celery Beat — zamanlanmış görevler |
| `ramis-frontend.service` | Next.js standalone (Nginx arkasında) |

Servis listesi `build_monitored_services()` ile üretilir; `DAPHNE_INSTANCES` **`/etc/ramis/backend.env`** dosyasından okunur (dosyada birden fazla satır varsa **son tanım** geçerlidir). Anahtar yoksa yüklü `ramis-daphne*.service` birim dosyaları sayılır. Durum sekmesindeki ikinci satır okunan değeri gösterir (`→ DAPHNE_INSTANCES=2`).

> **Not:** `DAPHNE_INSTANCES` veya `UVICORN_INSTANCES` değiştirildikten sonra izleyiciyi yeniden başlatın; servis satırları açılışta oluşturulur (açıklama metni “Yenile” ile güncellenir).

## Gereksinimler

```bash
sudo apt install python3-gi gir1.2-gtk-4.0 gir1.2-adw-1
```

## Çalıştırma

```bash
./run_monitor.sh
```

## Kurulum / kaldırma

```bash
./install.sh    # menü, masaüstü, otostart
./uninstall.sh
```

## Özellikler

- 10 saniyede bir otomatik durum yenileme
- **Zamanlanmış görevler** sekmesi — Celery Beat işleri (Redis temizliği, geçmiş 86 temizliği dahil); saatler `/etc/ramis/backend.env` üzerinden okunur
- Servis başına journalctl canlı log
- Tüm servisler için toplu başlat / durdur / yeniden başlat
- TR/EN — `/etc/ramis/lang` (`tr` veya `en`)

## Zamanlanmış görevler sekmesi

`system_utils/beat_jobs_catalog.py` ile `backend/config/celery_beat_schedule.py` aynı env anahtarlarını kullanır. Liste:

| Beat anahtarı | Görev |
|---------------|-------|
| `cleanup-redis-stale-keys` | `core.tasks.cleanup_redis_stale_keys` (varsayılan 02:30) |
| `cleanup-reservations-nightly` | Stok rezervasyon temizliği |
| `rollup-product-station-timing-nightly` | Smart Firing EMA |
| `sync-printer-statuses-periodically` | Yazıcı durumu |
| `maintain-print-job-queue` | PrintJob bakımı |
| `scan-kitchen-low-stock-nightly` | Mutfak düşük stok |
| `scan-expiring-lots-daily` | SKT lot taraması |
| `sweep-stale-cleaning-tables` | Takılı temizlik masaları |
| `notify-due-reservations` | Rezervasyon hatırlatması |
| `purge-expired-86-nightly` | Geçmiş Ürün Kalmadı (86) temizliği |
