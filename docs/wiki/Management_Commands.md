# Management Commands — Yönetim Komutları

- **Özet:** Ramis ERP projesinde kullanılan özel Django management komutlarının referansıdır. Veritabanı tohumlama, RBAC izin kaydı, Celery Beat senkronizasyonu ve çeviri derleme işlemlerini kapsar.
- **Kütüphaneler:** Django management framework, django_celery_beat, polib
- **Bağlantılar:** [[RBAC]], [[Celery_Beat_Sync]], [[Internationalization]], [[Branches]], [[Menu]], [[Inventory]], [[Users]], [[Auth_Flow]], [[User_Emergency_Admin]], [[Load_Testing]]

---

## Core Komutları

### `seed_full` — Tam Veritabanı Tohumlama

Geliştirme ve demo ortamları için kapsamlı test verisi oluşturur.

```bash
python manage.py seed_full --all                 # her şeyi tohala
python manage.py seed_full --rbac --users --menu  # seçici tohumlama
python manage.py seed_full --all --lang en        # İngilizce rol adları
python manage.py seed_full --all --no-flush       # mevcut veriyi silme
```

| Bayrak | İçerik |
|--------|--------|
| `--rbac` | Rol ve izin tanımları (→ `seed_rbac`) |
| `--units` | Stok birimleri (→ `seed_units`) |
| `--infra` | Allerjenler (→ `seed_allergens`) |
| `--users` | 6 test kullanıcısı: admin, garson, aşçı, stokçu, müdür, kasiyer |
| `--menu` | Kategoriler, ürünler, varyantlar |
| `--tables` | 10 masa + bölge |
| `--all` | Yukarıdakilerin tümü |
| `--lang tr\|en` | Rol adları dili |
| `--no-flush` | Mevcut veriyi silmeden ekle |

**Detaylar:**
- Atomic transaction içinde çalışır
- Varsayılanda DB'yi temizler (`flush`)
- Stok kataloğu (20 kalem), reçeteler ve malzemeler de oluşturulur

### `sync_celery_beat_schedule` — Beat Zamanlayıcı Senkronizasyonu

Detaylı bilgi: [[Celery_Beat_Sync]]

```bash
python manage.py sync_celery_beat_schedule
python manage.py sync_celery_beat_schedule --dry-run
```

---

## RBAC Komutları

### `register_permissions` — İzin Tarama ve Kaydı

Tüm view sınıflarını/fonksiyonlarını tarayarak `permission_required` özniteliklerinden izin kodlarını bulur ve eksik olanları veritabanına kaydeder.

```bash
python manage.py register_permissions               # tüm app'ler
python manage.py register_permissions --app orders   # sadece orders app'i
python manage.py register_permissions --dry-run      # değişiklik yapmadan raporla
python manage.py register_permissions --json         # JSON çıktı
python manage.py register_permissions --force        # var olanları da güncelle
python manage.py register_permissions --reset        # sıfırdan oluştur
python manage.py register_permissions --add-custom "pos.custom_action"
```

### `rbac_manage` — RBAC CLI Yönetimi

Komut satırından RBAC yapılandırması.

```bash
python manage.py rbac_manage category --list
python manage.py rbac_manage permission --list --json
python manage.py rbac_manage crud orders --permissions view,create,update,delete
python manage.py rbac_manage assign <user_id> <role_id>
python manage.py rbac_manage create_role "Muhasebeci" --parent "User"
python manage.py rbac_manage user_role <user_id> --list
```

### `seed_rbac` — Varsayılan RBAC Verisi

Proje için standart rol, izin ve kategori tanımlarını oluşturur.

---

## Users Komutları

### `clear_login_throttle` — Login rate limit temizliği

DRF `LoginRateThrottle` önbelleğindeki `throttle_login_<ip>` kayıtlarını siler. Paylaşılan modül: `apps/users/login_throttle.py`.

```bash
python manage.py clear_login_throttle --ip 192.168.1.50
python manage.py clear_login_throttle --all    # Redis gerekir
```

| Bayrak | Açıklama |
|--------|----------|
| `--ip` | Yalnızca belirtilen istemci IP'si |
| `--all` | Tüm login throttle kayıtları (Redis `scan_iter`) |

Aynı işlem [[User_Emergency_Admin]] **Login Kilidi** sekmesinden veya `django_user_cli.py` `op: clear_login_throttle` ile de yapılabilir. Load test sonrası kurtarma: [[Load_Testing#Login kilidi ve tarayıcıda "CORS hatası"]].

---

## Araç Betikleri

### `compile_locale_mo.py` — Çeviri Derleme

GNU gettext (`msgfmt`) mevcut olmayan ortamlarda `.po` dosyalarını `.mo` formatına derler.

```bash
cd backend
python scripts/compile_locale_mo.py
```

**Not:** `polib` Python kütüphanesini kullanır.

---

## Kaynak Dosyalar

| Komut | Dosya Yolu |
|-------|-----------|
| `seed_full` | [`seed_full.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/management/commands/seed_full.py) |
| `sync_celery_beat_schedule` | [`sync_celery_beat_schedule.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/management/commands/sync_celery_beat_schedule.py) |
| `register_permissions` | [`register_permissions.py`](file:///home/sedat/pyProjects/ramis_erp/backend/rbac/management/commands/register_permissions.py) |
| `rbac_manage` | [`rbac_manage.py`](file:///home/sedat/pyProjects/ramis_erp/backend/rbac/management/commands/rbac_manage.py) |
| `seed_rbac` | [`seed_rbac.py`](file:///home/sedat/pyProjects/ramis_erp/backend/rbac/management/commands/seed_rbac.py) |
| `clear_login_throttle` | [`clear_login_throttle.py`](file:///home/sedat/PythonProjects/ramis_erp/backend/apps/users/management/commands/clear_login_throttle.py) |
| `compile_locale_mo` | [`compile_locale_mo.py`](file:///home/sedat/pyProjects/ramis_erp/backend/scripts/compile_locale_mo.py) |
