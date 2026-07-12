# Celery Beat Sync — Zamanlayıcı Senkronizasyonu

- **Özet:** Beat zamanlamaları `backend.env` → `config/celery_beat_schedule.py` → `CELERY_BEAT_SCHEDULE` zinciriyle oluşur. Üretimde Beat `DatabaseScheduler` kullanır; bu modül settings tanımlarını `django_celery_beat.PeriodicTask` tablosuna senkronize eder.
- **Kütüphaneler:** celery, django_celery_beat, Django ORM
- **Bağlantılar:** [[Celery_Tasks]], [[Management_Commands]], [[Django_Settings]], [[Backend_Environment]]

---

## Ortam değişkenleri

Periyodik saat/aralıklar kodda sabit değildir; `backend/config/celery_beat_schedule.py` ortam değişkenlerinden `CELERY_BEAT_SCHEDULE` üretir. Tam liste: [[Backend_Environment#9. Celery Beat zamanlamaları]].

Env değiştikten sonra yalnızca Beat servisini yeniden başlatmak **yeterli değildir** — `sync_celery_beat_schedule` ile DB güncellenmelidir (`update.sh` migrate sonrası otomatik; Ramis Ayar Yöneticisi kayıt sonrası da çalıştırır).

---

## 1. Beat Schedule Senkronizasyonu (`celery_beat_sync.py`)

### Neden Gerekli?

`DatabaseScheduler` çalışma zamanında yalnızca veritabanındaki `PeriodicTask` kayıtlarını okur. `settings.py` içine yeni bir zamanlayıcı eklendiğinde, otomatik olarak veritabanına **yazılmaz**. Her deploy/migrate sonrası `sync_celery_beat_schedule` komutu çalıştırılmalıdır.

### API

```python
from core.celery_beat_sync import sync_celery_beat_schedule

stats = sync_celery_beat_schedule(dry_run=False)
# → {"created": 2, "updated": 0, "disabled": 1, "unchanged": 3}
```

### Davranış

1. `settings.CELERY_BEAT_SCHEDULE` sözlüğündeki her giriş için:
   - **crontab** schedule → `CrontabSchedule` kaydı oluştur/bul
   - **timedelta** schedule → `IntervalSchedule` kaydı oluştur/bul (gün/saat/dakika/saniye otomatik çözümleme)
   - `PeriodicTask` kaydı yoksa → oluştur (`created`)
   - Varsa ve alanlar değiştiyse → güncelle (`updated`)
   - Aynıysa → atla (`unchanged`)
2. Artık settings'te olmayan ama daha önce bu modül tarafından oluşturulmuş görevler → `enabled=False` yap (`disabled`)

### Yönetilen Kayıt İşareti

`MANAGED_DESCRIPTION = "Managed from CELERY_BEAT_SCHEDULE via sync_celery_beat_schedule"` — bu açıklama ile işaretlenen DB satırları, modül tarafından yönetilir.

### CLI Komutu

```bash
python manage.py sync_celery_beat_schedule          # üretim
python manage.py sync_celery_beat_schedule --dry-run # sadece raporla
```

### Kaynak Dosyalar

- [`celery_beat_sync.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/celery_beat_sync.py)
- [`sync_celery_beat_schedule.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/management/commands/sync_celery_beat_schedule.py)

---

## 2. Görev Seçenek Presetleri (`celery_task_options.py`)

İki standart preset dictionary, `@shared_task(**PRESET)` şeklinde kullanılır:

### `MAINTENANCE_TASK_OPTIONS`

Beat / bakım görevleri için. Geçici altyapı hatalarında otomatik yeniden deneme.

| Seçenek | Değer |
|---------|-------|
| `ignore_result` | `True` |
| `autoretry_for` | `OperationalError`, `DatabaseError`, `ConnectionError`, `OSError`, `TimeoutError` |
| `retry_backoff` | `True` (üstel geri çekilme) |
| `retry_jitter` | `True` (rastgele gecikme ekleme) |
| `max_retries` | `3` |

### `PRINTING_TASK_OPTIONS`

Termal baskı görevleri için. İş mantığı `PrintJob` durumunu kendi yönetir.

| Seçenek | Değer |
|---------|-------|
| `ignore_result` | `True` |

### Kaynak Dosyalar

- [`celery_task_options.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/celery_task_options.py)
