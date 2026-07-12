# User Emergency Admin (Acil Kullanıcı Yönetimi)

> **Özet:** GTK4/Libadwaita tabanlı acil durum kullanıcı yönetim aracı. Panel veya API erişimi olmadan veritabanı üzerinden doğrudan kullanıcı pasifleştirme (yumuşak silme), parola atama, yeni süper kullanıcı oluşturma ve login rate limit kilidini kaldırma.
> **Kütüphaneler:** GTK4, Libadwaita (Adw), Python 3, Django (backend venv), PostgreSQL/SQLite (ortam `backend.env` veya `.env`)
> **Bağlantılar:** [[Users]], [[BaseModel]], [[Deployment]], [[Backup_Restore]], [[Ramis_Monitor]], [[Auth_Flow]], [[Load_Testing]], [[Management_Commands]]

---

## Konum
`system_utils/user_emergency/`

## Dosyalar
| Dosya | İçerik |
|-------|--------|
| `ramis_user_admin.py` | Asenkron GTK4 arayüzü (liste, arama, durum değiştirme, parola güncelleme, yeni süper kullanıcı) |
| `django_user_cli.py` | Django ORM ile işlemler yapan CLI betiği; tek JSON çıktı (stdout) üretir |
| `run_as_ramis.sh` | Sanal ortam (venv) ve backend.env yükleyerek CLI çalıştıran aracı shell scripti |
| `run_users.sh` | Uygulama başlatıcı |
| `install.sh` | Bağımlılık (.deb), `.desktop` menü ve masaüstü kısayolu kurulumu |
| `uninstall.sh` | Menü ve masaüstü kısayolunu kaldırır |

## Özellikler

### 1. Asenkron & Akıcı Operasyonlar
- Senkron `subprocess.run` çağrıları yerine, tüm veritabanı işlemleri Python `threading.Thread` ile arka planda çalıştırılır. İşlem sürerken `Gtk.Spinner` döner ve UI kilitlenmesi yaşanmaz.

### 2. Kullanıcı Arama ve Canlı Filtreleme
- Kullanıcı listesinin üstünde bir `Gtk.SearchEntry` (Arama Kutusu) yer alır.
- Harf girildiği anda liste in-memory olarak kullanıcı adı ve e-posta adresine göre anında filtrelenir.

### 3. Zengin Arayüz & Görsel Rozetler (Badges)
- **Durum İkonu:** Satırların solunda yer alan ikonlar kullanıcının aktif (yeşil) veya pasif (kırmızı) olma durumunu gösterir.
- **Yetki Badges:** Kullanıcıların yetki durumuna göre sağ tarafta etiketler yer alır:
  - `YÖNETİCİ` (Kırmızı): Süper kullanıcı hesabı.
  - `STAFF` (Mavi): Personel hesabı.
  - `PASİF` (Gri): Dondurulmuş/Pasif hesap.

### 4. Modern Form Tasarımı
- Süper kullanıcı oluşturma ve şifre değiştirme ekranlarındaki eski düz metin alanları kaldırılıp `Adw.PasswordEntryRow` kullanılmıştır. Bu sayede bütünleşik form tasarımı elde edilmiş ve göz butonu ile şifre göster/gizle özelliği eklenmiştir.

### 5. Login Kilidi sekmesi

Load test veya brute-force koruması sonrası **429 login throttle** ile kilitlenen istemci IP'leri için Redis/cache üzerindeki `throttle_login_*` kayıtlarını temizler.

| Bileşen | Açıklama |
|---------|----------|
| Sekme | **Login Kilidi** (`login_lock_tab`) — TR/EN çeviriler |
| IP alanı | Belirli istemci IP'si (ör. `192.168.1.50`) |
| Tüm IP switch | `--all` eşdeğeri; tüm `throttle_login_*` kayıtları (Redis gerekir) |
| Onay | Silme öncesi `Adw.MessageDialog` |
| CLI op | `django_user_cli.py` → `{ "op": "clear_login_throttle", "ip"?: "...", "clear_all"?: true }` |

Paylaşılan backend modülü: `apps/users/login_throttle.py` (`clear_login_throttle`). Detay: [[Auth_Flow#Login rate limit (LoginRateThrottle)]].

### 6. Geriye Dönük Uyumluluk ve Düzeltmeler
- **Venv Desteği:** `run_as_ramis.sh` içinde geliştirme makinelerindeki `backend/venv` dizini otomatik olarak listeye eklenmiş ve arama bug'ı giderilmiştir.
- **CSS Yükleme:** Sürüm uyumsuzluğuna sebep olan `CssProvider.load_from_data` parametre imzası modern PyGObject standartlarına göre güncellenmiştir.

---

## Çalışma Mantığı
- Arayüz işlemleri `pkexec` ile `run_as_ramis.sh` dosyasını tetikler. Root yetkisi alındıktan sonra dizin sahibine (`sudo -u <owner>`) geçiş yapılarak `.venv`/`venv`/`env` içindeki Python aracılığıyla `django_user_cli.py` çalıştırılır.
- İstek gövdesi güvenli transfer için **base64** ile kodlanarak betiğe aktarılır.

---

## Ortam Değişkenleri
| Değişken | Açıklama |
|----------|----------|
| `RAMIS_INSTALL_DIR` | Varsayılan: `/srv/ramis_erp` |
| `RAMIS_BACKEND_DIR` | Varsayılan: `$RAMIS_INSTALL_DIR/backend` |
| `RAMIS_SYS_USER` | Varsayılan: `ramis` |
| `RAMIS_USER_ADMIN_NO_PKEXEC` | `1` / `true` / `yes` → `pkexec` kullanılmaz (geliştirme) |
| `RAMIS_USER_ADMIN_ALLOW_SYSTEM_PYTHON` | `1` → venv yoksa sistem `python3` denemesi |
