# Backup Restore (Yedekleme Aracı)

> **Özet:** GTK4/Libadwaita tabanlı veritabanı ve medya dosyaları yedekleme ve geri yükleme aracı. PostgreSQL yedeği ile Django `backend/media` klasörünü tek pakette (`.tar.gz`) birleştirir; güvenli tar açma, acil ön-yedek ve atomik dosya yazımı ile restore işlemini korur. CLI ve crontab otomasyonu desteklenir.
> **Kütüphaneler:** GTK4, Libadwaita (Adw), Python, pg_dump, pg_restore, psql, tarfile
> **Bağlantılar:** [[Deployment]], [[Backend_Environment]], [[Ramis_Monitor]], [[User_Emergency_Admin]], [[Celery_Tasks]]

---

## Konum
`system_utils/backup_restore/`

## Dosyalar
| Dosya | İçerik |
|-------|--------|
| `ramis_backup.py` | Ana uygulama kodu (GUI ve CLI modları) |
| `install.sh` | Kurulum betiği (GTK bağımlılıkları, `.desktop` kısayolu) |
| `run_backup.sh` | Çalıştırma betiği |
| `uninstall.sh` | Kaldırma betiği |

## Yedek Deposu
- **Varsayılan dizin:** `~/ramis_backups`
- **Dosya adı deseni:** `ramis_backup_YYYYMMDD_HHMMSS.{dump,sql,tar.gz}` veya otomasyon için `ramis_auto_backup_...`
- **Acil ön-yedekler:** Restore öncesi otomatik alınan `pre_restore_emergency_YYYYMMDD_HHMMSS.dump` dosyaları aynı dizinde saklanır; GUI listesinde **gösterilmez** (kurtarma amaçlı).

---

## Özellikler

### 1. Yedekleme (Backup)
- **Veritabanı:** `pg_dump` ile sıkıştırılmış (`.dump`, `-Fc`) veya SQL plain text (`.sql`, `-Fp`) biçiminde yedek alınır.
- **Medya dosyaları:** `backend/media` klasörü, DB dump ve `metadata.json` tek bir `.tar.gz` arşivinde birleştirilir. Medya kapalıysa yalnızca DB dosyası üretilir.
- **Atomik yazım:** Yedek dosyası önce `.partial` uzantılı geçici dosyaya yazılır, başarılı olunca `os.replace()` ile nihai adına taşınır; yarım kalmış dosya riski azaltılır.
- **metadata.json (v1.1):** `version`, `created_at`, `db_format`, `has_media`, `db_name` alanlarını içerir.

### 2. Geri Yükleme (Restore)

Geri yükleme `_perform_restore()` çekirdek fonksiyonu üzerinden GUI ve CLI'da aynı akışı izler:

1. Yedek dosya yolu doğrulanır (`_resolve_backup_path`)
2. `.tar.gz` ise arşiv güvenli biçimde açılır (`_safe_tar_extract`)
3. Ramis servisleri durdurulur (`pkexec systemctl stop`)
4. **Acil ön-yedek** alınır (`pre_restore_emergency_*.dump`) — başarısız olursa restore **iptal** edilir
5. `public` şeması temizlenir (`DROP SCHEMA IF EXISTS public CASCADE` + `ON_ERROR_STOP=1`)
6. DB geri yüklenir (`psql -f` veya `pg_restore --no-owner --no-privileges --exit-on-error`)
7. Pakette medya varsa `backend/media` temizlenip yedekten kopyalanır
8. Servisler `finally` bloğunda **her durumda** yeniden başlatılır

**Durdurulan servisler:**
`ramis-daphne`, `ramis-frontend`, `ramis-worker`, `ramis-worker-maintenance`, `ramis-worker-broadcast`, `ramis-beat`

**Geriye dönük uyumluluk:** Eski tip yalnızca DB içeren `.dump` / `.sql` yedekleri ve `metadata.json` olmayan arşivler otomatik algılanır.

**Restore başarısız olursa:** Logda acil ön-yedek dosya yolu yazılır; bu dump ile manuel kurtarma yapılabilir:
```bash
python3 ramis_backup.py --restore ~/ramis_backups/pre_restore_emergency_YYYYMMDD_HHMMSS.dump
```

### 3. Otomasyon (Cron)
- Crontab ile her gece **03:00**'da otomatik yedek alınır.
- GUI otomasyon sekmesinden medya dahil etme ve DB formatı tercihleri crontab satırına yansır (`--include-media`, `--sql`).
- Crontab güncellemesi `shell=True` kullanmaz; `crontab -l` / `crontab -` ile güvenli satır tabanlı yazım yapılır.

### 4. Kurumsal UI
- **Durum kartları:** DB bağlantısı, medya boyutu, yedek deposu istatistikleri
- **İşlem günlüğü:** Yedekleme/restore adımları ve hatalar
- **Yedek listesi:** Türkçe tarih, boyut ve tür bilgisi; yalnızca doğrulanmış dosya adları listelenir

---

## Güvenlik

| Konu | Uygulama |
|------|----------|
| **Tar slip / path traversal** | `_safe_tar_extract`: hedef yol doğrulaması, sembolik/bağlantılı girdi reddi; Python 3.12+ `filter="data"` |
| **SQL enjeksiyonu** | `POSTGRES_USER` `_quote_pg_ident()` ile tırnaklanır |
| **Yedek yolu doğrulama** | GUI: yalnızca `~/ramis_backups` + beklenen dosya adı deseni; CLI `--restore`: uzantı ve path traversal kontrolü, harici yol desteklenir |
| **Crontab shell injection** | Argüman listesi ile crontab okuma/yazma |
| **Restore güvenliği** | DROP SCHEMA öncesi zorunlu acil ön-yedek; hata durumunda servisler yine de başlatılır (`finally`) |
| **Ortam dosyası okuma** | Üretim `/etc/ramis/backend.env` öncelikli; yetki yoksa GUI'de `pkexec cat` |

---

## CLI Kullanımı

```bash
cd system_utils/backup_restore

# Otomatik sessiz yedek (cron ile aynı)
python3 ramis_backup.py --auto-backup [--include-media] [--sql]

# Komut satırından geri yükleme (harici yol kabul edilir)
python3 ramis_backup.py --restore /path/to/backup.tar.gz
python3 ramis_backup.py --restore ~/ramis_backups/ramis_backup_20260706_120000.dump
```

---

## Konfigürasyon

Okuma sırası (ilk başarılı dosya kullanılır):

1. `/etc/ramis/backend.env` — üretim ortamı (**öncelikli**)
2. `backend/.env` — geliştirme ortamı yedek

Okunan anahtarlar: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`. Ayrıntılar: [[Backend_Environment]].

GUI modunda `/etc/ramis/backend.env` okunamazsa `pkexec cat` ile yetkilendirilmiş okuma denenir.

---

## Kurulum

```bash
cd system_utils/backup_restore
./install.sh    # python3-gi, gir1.2-gtk-4.0, gir1.2-adw-1
./run_backup.sh # veya uygulama menüsünden "Ramis Yedekleme Yönetimi"
```

Kaldırma: `./uninstall.sh` (yalnızca `.desktop` kısayollarını siler; yedek dosyalarına dokunmaz).
