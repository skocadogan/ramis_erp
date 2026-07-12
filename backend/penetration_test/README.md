# Ramis ERP — Backend Yük & Stres Testi (Locust)

Bu dizin, Ramis ERP backend servislerinin gerçek dünya yükü altında nasıl
performans gösterdiğini ölçmek için **Locust** senaryolarını içerir.

## Split Mimari

Test edilen sistem iki ayrı ASGI sunucusundan oluşur:

| Trafik | Sunucu | Port | Servis |
|--------|--------|------|--------|
| HTTP (`/api/*`, `/admin/*`) | **Uvicorn** | 9000-9003 | `ramis-uvicorn*.service` |
| WebSocket (`/ws/*`) | **Daphne** | 8000 | `ramis-daphne.service` |
| Herşey (entegre) | **Nginx** | 80 | `nginx.service` |

Locust `--host` parametresi HTTP adresini belirler. WebSocket'ler ayrı bir
host üzerinden bağlanabilir (`RAMIS_LOADTEST_WS_HOST`). Nginx arkasında
tek adres yeterlidir.

## Test dosyaları

| Dosya | Amaç |
|-------|------|
| **`base.py`** | Ortak altyapı: token yönetimi, WS keep-alive, auth, kullanıcı sınıfları |
| **`test_peak_hour.py`** | Yoğun saat — kısa bekleme, fazla garson/POS, kapasite ölçümü |
| **`settings.txt`** | Peak profili ayarları (env öncelikli) |
| **`sync_loadtest_config.py`** | Uzak sunucudan UUID çekip `base.py` DEFAULT_* sabitlerini günceller |

### Kullanıcı profilleri (`base.py`)

| Sınıf | Ağırlık | Bekleme (sn) | Davranış |
|-------|---------|--------------|----------|
| **WaiterUser** | 15 | 30–120 | Masa siparişi |
| **ChefUser** | 2 | 60–300 | KDS + WS |
| **CashierUser** | 3 | 45–90 | Ödeme |
| **PosSyncUser** | 5 | 15–45 | POS WS + masa listesi |

### Yoğun saat profili (`test_peak_hour.py`)

| Sınıf | Ağırlık (varsayılan) | Bekleme (sn) | Davranış |
|-------|----------------------|--------------|----------|
| **PeakWaiterUser** | 25 | 3–12 | Sık sipariş (masa biriktirme) |
| **PeakPosSyncUser** | 12 | 2–8 | Sık masa poll + WS + complete_table |
| **PeakCashierUser** | 6 | 5–20 | Ödeme |
| **PeakChefUser** | 4 | 8–30 | KDS döngüsü + WS |

Locust raporunda istek adları **`[Peak]`** öneki ile görünür.

## Kurulum

Backend sanal ortamından:

```bash
cd backend
source venv/bin/activate
pip install locust websocket-client requests
```

## Çalıştırma

### Normal yük (Nginx arkası)

```bash
cd backend/penetration_test
locust -f base.py --host http://192.168.1.100
```

### Normal yük (doğrudan, split mimari)

```bash
RAMIS_LOADTEST_WS_HOST=ws://192.168.1.100:8000 \
  locust -f base.py --host http://192.168.1.100:9000
```

### Yoğun saat (staging — kademeli ramp)

```bash
cd backend/penetration_test
RAMIS_LOADTEST_WS_HOST=ws://192.168.1.100:8000 \
  locust -f test_peak_hour.py --headless --run-time 20m --host http://192.168.1.100
```

### Ani yükleme (shape kapalı)

```bash
RAMIS_PEAK_USE_SHAPE=0 \
  locust -f test_peak_hour.py --headless -u 80 -r 8 --run-time 15m --host http://192.168.1.100
```

### Web UI

```bash
locust -f base.py --host http://127.0.0.1:9000
# Tarayıcı: http://localhost:8089
```

## Yapılandırma

### Ortak değişkenler (`base.py`)

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `RAMIS_LOADTEST_BRANCH_ID` | seed UUID | Şube UUID |
| `RAMIS_LOADTEST_PRODUCT_IDS` | 8 seed ürün | Virgülle ürün UUID'leri |
| `RAMIS_LOADTEST_TABLE_IDS` | 10 seed masa | Masa UUID'leri |
| `RAMIS_LOADTEST_POS_TERMINAL_IDS` | seed terminal | POS terminal UUID |
| `RAMIS_LOADTEST_PASSWORD` | `Sk74833.` | Test kullanıcı şifresi |
| `RAMIS_LOADTEST_CASHIER_PIN` | `1234` | Kasiyer PIN (frontend akışı) |
| `RAMIS_LOADTEST_CASHIER_USE_PIN` | `1` | Kasiyer/POS için check-pin → token/pin |
| `RAMIS_LOADTEST_WAITER_USER` | `garson_test` | Garson kullanıcı adı |
| `RAMIS_LOADTEST_CHEF_USER` | `asci_test` | Aşçı kullanıcı adı |
| `RAMIS_LOADTEST_CASHIER_USER` | `kasiyer_test` | Kasiyer kullanıcı adı |
| `RAMIS_LOADTEST_POS_USER` | kasiyer | POS sync kullanıcısı |
| `RAMIS_LOADTEST_WS_HOST` | HTTP'den türet | **Split mimari:** WS için ayrı adres (örn. `ws://192.168.1.100:8000`) |
| `RAMIS_LOADTEST_WS_PING_SEC` | 30 | WS ping aralığı (sn) |
| `RAMIS_LOADTEST_LOGIN_MAX_RETRIES` | 8 | Login 429 yeniden deneme |
| `RAMIS_LOADTEST_TOKEN_CACHE_SEC` | 1500 | JWT önbellek süresi (sn) |
| `RAMIS_LOADTEST_LOGIN_STAGGER_SEC` | 0.4 | Eşzamanlı login gecikmesi |
| `RAMIS_LOADTEST_SKIP_PREFETCH` | 0 | `1` = ön-login atla |

### Peak değişkenleri (`test_peak_hour.py` + `settings.txt`)

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `RAMIS_PEAK_WAITER_WEIGHT` | 25 | Garson ağırlığı |
| `RAMIS_PEAK_WAITER_WAIT_MIN` / `_MAX` | 3 / 12 | Garson bekleme (sn) |
| `RAMIS_PEAK_POS_WEIGHT` | 12 | POS ağırlığı |
| `RAMIS_PEAK_POS_WAIT_MIN` / `_MAX` | 2 / 8 | POS bekleme (sn) |
| `RAMIS_PEAK_CASHIER_WEIGHT` | 6 | Kasa ağırlığı |
| `RAMIS_PEAK_CASHIER_WAIT_MIN` / `_MAX` | 5 / 20 | Kasa bekleme (sn) |
| `RAMIS_PEAK_CHEF_WEIGHT` | 4 | KDS ağırlığı |
| `RAMIS_PEAK_CHEF_WAIT_MIN` / `_MAX` | 8 / 30 | KDS bekleme (sn) |
| `RAMIS_PEAK_REQUEST_TAG` | `[Peak]` | Locust istek adı öneki |
| `RAMIS_PEAK_USE_SHAPE` | 1 | Kademeli ramp |
| `RAMIS_PEAK_SHAPE_STAGES` | 5 aşama | `sn:kullanıcı:spawn`, virgülle |
| `RAMIS_PEAK_NETWORK_TIMEOUT` | 120 | HTTP yanıt timeout (sn) |
| `RAMIS_PEAK_CONNECTION_TIMEOUT` | 30 | TCP bağlantı timeout (sn) |
| `RAMIS_PEAK_TABLE_STACK_BIAS` | 0.75 | Aynı masaya sipariş olasılığı |
| `RAMIS_PEAK_TABLE_CLOSE_MIN_ORDERS` | 3 | POS kapatma eşiği |
| `RAMIS_PEAK_KDS_ITEMS_PER_TICK` | 5 | KDS tur başına kalem |
| `RAMIS_PEAK_POS_CLOSE_PROB` | 0.55 | POS kapatma olasılığı |
| `RAMIS_PEAK_COUNT_THROTTLE_AS_SUCCESS` | 1 | 429'u başarı say |
| `RAMIS_PEAK_COUNT_GATEWAY_AS_SUCCESS` | 1 | 502/503/504'ü başarı say |

Varsayılan ramp (`PeakHourLoadShape`): 15 → 30 → 50 → 65 → **80** kullanıcı (20 dk).

## Uzak sunucudan yapılandırma senkronu

`base.py` içindeki `DEFAULT_BRANCH`, `DEFAULT_PRODUCTS`, `DEFAULT_TABLES` ve
`DEFAULT_TERMINALS` sabitleri yerel `seed_full --all` UUID'lerine göre tanımlıdır.
Farklı bir sunucuda (staging, kapasite testi makinesi vb.) test çalıştırırken bu
UUID'ler uyuşmazsa sipariş açılamaz, WS 403 alınır veya yanlış şube kullanılır.

**Çözüm:** Test öncesi `sync_loadtest_config.py` ile hedef sunucudan gerçek ID'leri çekin.

### Ne yapar?

1. Admin kullanıcı ile `/api/v1/auth/token/` üzerinden giriş yapar (`Admin` / `admin` otomatik dener).
2. Aktif şubeyi, masaları (paket bölgesi hariç), POS ürünlerini (`show_on_pos=true`) ve
   POS terminallerini API'den okur.
3. `garson_test`, `asci_test`, `kasiyer_test` kullanıcılarının varlığını doğrular.
4. `base.py` içindeki `DEFAULT_*` bloğunu günceller (kaynak host ve senkron zamanı yorum olarak eklenir).

### Kullanım

```bash
cd backend/penetration_test
source ../venv/bin/activate

# Önizleme (base.py değişmez)
python sync_loadtest_config.py 20.20.24.106 --user Admin --dry-run

# base.py'yi güncelle
python sync_loadtest_config.py 20.20.24.106 --user Admin

# Uvicorn doğrudan (port 9000)
python sync_loadtest_config.py --host http://20.20.24.106:9000 --user Admin
```

### Parametreler

| Parametre | Varsayılan | Açıklama |
|-----------|------------|----------|
| `host` (konumsal) | — | IP veya URL (`20.20.24.106`, `http://…`) |
| `--host` | — | Alternatif URL (`--host http://…`) |
| `--user` | `Admin` | Admin kullanıcı adı (küçük/büyük harf otomatik denenir) |
| `--password` | `Sk74833.` | Admin şifresi |
| `--max-products` | `12` | `base.py`'ye yazılacak max ürün sayısı |
| `--dry-run` | kapalı | Yalnızca özet gösterir, dosya yazmaz |

### Önerilen akış

```bash
# 1) UUID'leri hedef sunucudan çek
python sync_loadtest_config.py 20.20.24.106 --user Admin

# 2) Yoğun saat testi (Nginx arkası)
locust -f test_peak_hour.py --host http://20.20.24.106

# Split mimari — HTTP :9000, WS :8000
RAMIS_LOADTEST_WS_HOST=ws://20.20.24.106:8000 \
  locust -f test_peak_hour.py --host http://20.20.24.106:9000
```

Script tamamlandığında terminalde WS adresi önerisi de görünür. WebSocket
**Connection refused** alırsanız `RAMIS_LOADTEST_WS_HOST` ile Daphne portunu
(`:8000`) veya Nginx adresini (`ws://HOST`) ayarlayın.

## Seed verisi

Yerel geliştirme ortamında test verisi oluşturmak için:

```bash
cd backend
source venv/bin/activate
python manage.py seed_full --all
```

Ardından yerel sunucu için senkron:

```bash
cd backend/penetration_test
python sync_loadtest_config.py 127.0.0.1 --user Admin
```

Test kullanıcıları (şifre: `Sk74833.`):
| Kullanıcı | Rol | Değişken |
|-----------|-----|----------|
| `garson_test` | Garson | `RAMIS_LOADTEST_WAITER_USER` |
| `asci_test` | Aşçı | `RAMIS_LOADTEST_CHEF_USER` |
| `kasiyer_test` | Kasiyer | `RAMIS_LOADTEST_CASHIER_USER` |

## Login throttle ve garson 403

- Auth endpoint'leri (`/auth/token/`, `/auth/check-pin/`, `/auth/token/pin/`) üretimde
  **5 istek/dakika/IP** ile sınırlıdır (aynı throttle paylaşılır).
- Script test başında her rol için **bir kez** token alıp önbelleğe yazar.
- **`/auth/me/` ile şube otomatik çözülür** — seed varsayılan UUID sunucudaki şube ile
  uyuşmuyorsa `RAMIS_LOADTEST_BRANCH_ID` override edilir (WS 403 önlenir).
- WebSocket **403**: RBAC yetkisi yeterli olsa bile `user.branch` veya
  `WaiterBranchAssignment` / `CookStationAssignment` şube kapsamı gerekir.
  Split mimaride `RAMIS_LOADTEST_WS_HOST=ws://HOST:8000` deneyin.
- Kasiyer/POS kullanıcıları frontend ile aynı akışı izler:
  `check-pin` → PIN varsa `token/pin`, yoksa `token` (şifre).
- `kasiyer_test` için PIN ataması gerekir (`CashierPinAssignment`, test PIN: `1234`).
  PIN tanımlı değilse otomatik olarak şifre ile giriş yapılır.
- Garson sipariş 403 genelde RBAC değil **garson masa ataması**
  (`WaiterBranchAssignment`) eksikliğinden gelir.
  Script `GET /tables/?scope=waiter` ile yalnızca atanmış masalarda sipariş dener.

Ön-kontrol (Locust başlatıldığında terminalde):

```text
[loadtest] Token önbelleğe alındı: garson_test
[loadtest] garson_test sipariş izinleri OK
[loadtest] Garson masa kapsamı: 8 masa
```

## Login kilidi ve tarayıcıda "CORS hatası"

Load test sırasında çok sayıda giriş denemesi yapılırsa **aynı IP adresi** geçici
olarak kilitlenebilir. Tarayıcıda genelde **CORS hatası** görünür; çoğu zaman asıl
neden CORS değil, **`429 Too Many Requests`** (login throttle) veya hata yanıtında
CORS başlıklarının eksik kalmasıdır.

| Endpoint | Limit (varsayılan) | Paylaşım |
|----------|-------------------|----------|
| `/api/v1/auth/token/` | 5/dk/IP | Aynı sayaç |
| `/api/v1/auth/check-pin/` | 5/dk/IP | Aynı sayaç |
| `/api/v1/auth/token/pin/` | 5/dk/IP | Aynı sayaç |

**Mobil garson uygulaması neden çalışır?** Zaten kayıtlı refresh/access token ile
istek atar; login endpoint'ine gitmez. Tarayıcı ise her seferinde `/auth/token/` veya
PIN akışını çağırır → kilitli IP'den 429 alır.

**Locust neden kilitlemiş olabilir?** Test makinesi ile tarayıcı **aynı IP**'den
sunucuya gider; prefetch + eşzamanlı `on_start` login'leri 5/dk sınırını aşabilir.

### Hemen kurtarma

1. **Locust'u durdurun** (Ctrl+C veya UI Stop).
2. **~60 saniye bekleyin** (throttle penceresi dolana kadar).
3. Sunucuda (Redis varsa) throttle kayıtlarını silin:

**GUI (önerilen):** Ramis Acil Kullanıcı Yönetimi → **Login Kilidi** sekmesi
(`system_utils/user_emergency/run_users.sh`).

**CLI:**

```bash
cd backend
source venv/bin/activate
# Kendi IP'niz (Locust çalıştırdığınız makine)
python manage.py clear_login_throttle --ip 192.168.x.x
# veya tüm login throttle kayıtları
python manage.py clear_login_throttle --all
```

Redis yoksa (LocMem / geliştirme): backend ASGI süreçlerini yeniden başlatın:

```bash
sudo systemctl restart ramis-uvicorn.service ramis-daphne.service
```

4. Tarayıcıda **gizli pencere** veya çerezleri temizleyip tekrar deneyin.

### Tekrar olmasını önleme

- Load testi, günlük kullandığınız tarayıcı ile **aynı makineden** mümkünse çalıştırmayın.
- `settings.txt` içinde `RAMIS_LOADTEST_LOGIN_STAGGER_SEC=1.0` (veya daha yüksek) kullanın.
- Test öncesi `sync_loadtest_config.py` ile UUID'leri senkronlayın (gereksiz 401/403 retry azalır).
- Staging'de test bitince `clear_login_throttle --all` çalıştırmayı alışkanlık edinin.

## Önemli notlar

1. **Split mimari:** HTTP testleri Uvicorn'a gider. WS ayrı bir host
   (`RAMIS_LOADTEST_WS_HOST`) üzerinden Daphne'ye bağlanır. Nginx arkasında
   tek adres kullanılır.
2. **Canlı üretim veritabanında çalıştırmayın.** Test binlerce sipariş/satış
   kaydı üretir; staging veya kopya ortam kullanın.
3. **Nginx timeout:** Split mimaride `/api/` bloğunda `proxy_read_timeout 120s;`
   olmalıdır. Aksi halde yoğun istekler 504 verir.
4. **`test.py` → `base.py`:** Modül adı değişti. Eski çalıştırma komutlarında
   `-f test.py` yerine `-f base.py` kullanın.
