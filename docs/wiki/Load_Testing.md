# Yük ve Kapasite Testi (Locust)

> **Özet:** `backend/penetration_test/` altında Locust senaryoları garson, KDS, kasa ve POS akışlarını yoğun saat profiliyle simüle eder. Giriş akışı frontend ile uyumludur (PIN / şifre); ödeme sonrası masa temizlik kilidi testte otomatik kaldırılır. Uzak sunucu UUID'leri `sync_loadtest_config.py` ile çekilir.
> **Kütüphaneler:** Locust 2.x, Python `requests`, `websocket-client`
> **Bağlantılar:** [[Backend_Environment]], [[WebSocket_Architecture]], [[Orders]], [[Branches]], [[Auth_Flow]], [[User_Emergency_Admin]], [[Deployment]], [[Django_Settings]]

---

## Konum

| Dosya | Rol |
|-------|-----|
| `backend/penetration_test/base.py` | Ortak altyapı: token önbelleği, WS, auth, kullanıcı sınıfları, `DEFAULT_*` UUID'ler |
| `backend/penetration_test/test_peak_hour.py` | Yoğun saat profili + `RAMIS_PEAK_*` |
| `backend/penetration_test/sync_loadtest_config.py` | Uzak sunucudan şube/masa/ürün/terminal UUID senkronu → `base.py` |
| `backend/penetration_test/settings.txt` | Peak + `RAMIS_LOADTEST_*` ayarları (env öncelikli) |
| `backend/penetration_test/README.md` | Operasyonel kısa rehber |

---

## Hızlı başlangıç

```bash
cd backend/penetration_test
source ../venv/bin/activate

# 1) Hedef sunucudan UUID'leri çek (Admin / admin, şifre seed)
python sync_loadtest_config.py 20.20.24.106 --user Admin

# 2) Yoğun saat testi (Nginx)
locust -f test_peak_hour.py --headless --run-time 20m --host http://20.20.24.106

# Split mimari: HTTP :9000, WS :8000
RAMIS_LOADTEST_WS_HOST=ws://HOST:8000 \
  locust -f test_peak_hour.py --host http://HOST:9000
```

Test kullanıcıları: `garson_test`, `asci_test`, `kasiyer_test` (şifre: `Sk74833.` — `seed_full --users`).

---

## Senkron betiği (`sync_loadtest_config.py`)

Admin ile `/api/v1/auth/token/` girişi yapar; aktif şube, masalar (paket hariç), `show_on_pos` ürünler ve POS terminallerini API'den okuyup `base.py` içindeki `DEFAULT_BRANCH`, `DEFAULT_PRODUCTS`, `DEFAULT_TABLES`, `DEFAULT_TERMINALS` sabitlerini günceller.

```bash
python sync_loadtest_config.py HOST --user Admin --dry-run   # önizleme
python sync_loadtest_config.py HOST --user Admin             # yaz
```

Seed UUID'leri ile uzak sunucu UUID'leri uyuşmazsa sipariş açılamaz ve WS şube reddi (403) görülebilir — test öncesi senkron zorunludur.

---

## Giriş akışı (frontend ile uyumlu)

| Rol | Akış |
|-----|------|
| Garson / aşçı | `POST /api/v1/auth/token/` (şifre) |
| Kasiyer / POS | `POST /api/v1/auth/check-pin/` → PIN varsa `POST /api/v1/auth/token/pin/` (`1234`), yoksa şifre |

Tüm auth endpoint'leri **aynı IP için 5/dk** `LoginRateThrottle` paylaşır (`[[Auth_Flow]]`). Script init'te token önbelleği doldurur ve `RAMIS_LOADTEST_LOGIN_STAGGER_SEC` ile login patlamasını azaltır.

Init sırasında `/auth/me/` ile **şube otomatik çözülür**; kasiyer/aşçı için **kullanıcı başına WS `branch_id`** kullanılır (`USER_BRANCH_IDS`).

---

## Ödeme ve masa temizliği

Ödeme sonrası backend masayı `CLEANING` durumuna alır ([[Branches#Masa temizlik döngüsü (CLEANING)]]). Load test, gerçek operasyonu taklit etmek için başarılı ödeme / `complete_table` sonrası `POST /api/v1/tables/{id}/finish_cleaning/` çağırır (`RAMIS_PEAK_FINISH_CLEANING_AFTER_PAY=1` varsayılan).

---

## `RAMIS_LOADTEST_*` (ortak — `base.py`)

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `RAMIS_LOADTEST_BRANCH_ID` | `DEFAULT_BRANCH` (senkron) | Test şubesi |
| `RAMIS_LOADTEST_PRODUCT_IDS` | senkron / seed | Sipariş ürünleri |
| `RAMIS_LOADTEST_TABLE_IDS` | senkron / seed | Masa listesi |
| `RAMIS_LOADTEST_POS_TERMINAL_IDS` | senkron / seed | POS terminal |
| `RAMIS_LOADTEST_PASSWORD` | `Sk74833.` | Test kullanıcı şifresi |
| `RAMIS_LOADTEST_CASHIER_PIN` | `1234` | Kasiyer PIN |
| `RAMIS_LOADTEST_CASHIER_USE_PIN` | `1` | Frontend PIN akışı |
| `RAMIS_LOADTEST_WAITER_USER` | `garson_test` | Garson |
| `RAMIS_LOADTEST_CHEF_USER` | `asci_test` | Aşçı |
| `RAMIS_LOADTEST_CASHIER_USER` | `kasiyer_test` | Kasa |
| `RAMIS_LOADTEST_POS_USER` | kasiyer | POS sync |
| `RAMIS_LOADTEST_WS_HOST` | HTTP'den türet | Split: `ws://HOST:8000` |
| `RAMIS_LOADTEST_LOGIN_MAX_RETRIES` | `8` | Login 429 yeniden deneme |
| `RAMIS_LOADTEST_TOKEN_CACHE_SEC` | `1500` | JWT önbellek TTL |
| `RAMIS_LOADTEST_LOGIN_STAGGER_SEC` | `0.4`–`1.0` | Login gecikmesi |
| `RAMIS_LOADTEST_SKIP_PREFETCH` | `0` | `1` → init ön-login atla |

---

## `RAMIS_PEAK_*` (`settings.txt` / `test_peak_hour.py`)

| Grup | Önemli anahtarlar |
|------|-------------------|
| Genel | `RAMIS_PEAK_USE_SHAPE`, `RAMIS_PEAK_SHAPE_STAGES`, timeout, throttle/gateway başarı sayımı |
| Garson | `RAMIS_PEAK_WAITER_WEIGHT`, `TABLE_STACK_BIAS` |
| POS | `RAMIS_PEAK_POS_*`, `POS_CLOSE_PROB`, `finish_cleaning` sonrası yeni sipariş |
| Kasa | `RAMIS_PEAK_CASHIER_SKIP_TABLE_ORDERS=1` |
| KDS | `CHEF_*`, `KDS_ITEMS_PER_TICK` |
| Temizlik | `RAMIS_PEAK_FINISH_CLEANING_AFTER_PAY=1` |

Shape örneği (20 dk): `120:15:2,300:30:3,600:45:4,1200:50:4`

---

## Login kilidi ve tarayıcıda "CORS hatası"

Yoğun load test aynı IP'den çok login denemesi üretirse **429 login throttle** devreye girer. Tarayıcı bunu genelde **CORS hatası** gibi gösterir; mobil uygulama kayıtlı token ile çalışmaya devam edebilir.

**Kurtarma:**

1. Locust'u durdurun, ~60 sn bekleyin.
2. CLI: `python manage.py clear_login_throttle --all` ([[Management_Commands]])
3. GUI: [[User_Emergency_Admin]] → **Login Kilidi** sekmesi
4. Gerekirse: `sudo systemctl restart ramis-uvicorn.service ramis-daphne.service`

---

## Sunucu tarafı gözlemler

| Gözlem | Olası neden | Wiki |
|--------|-------------|------|
| HTTP 429 (login) | `LoginRateThrottle` 5/dk/IP | [[Auth_Flow]] |
| HTTP 429 (API) | DRF user throttle 500/dk | [[Django_Settings]] |
| WS HTTP 403 | Şube kapsamı / yanlış `branch_id` | [[Branch_Scope]], [[WebSocket_Architecture]] |
| WS Connection refused | HTTP `:9000`, WS nginx/Daphne `:8000` uyumsuz | [[ASGI_Split_Deploy]] |
| Sipariş 400/404 | Seed UUID ≠ sunucu UUID | `sync_loadtest_config.py` |
| WS `Disconnected` | Kapalı bağlantıya push | [[WS_Internals]] |

Load test sırasında `DAPHNE_INSTANCES`, `CHANNEL_LAYER_*` ayarlarını [[Backend_Environment]] ile hizalayın.

---

## Referans sonuçlar (2026-05-26)

| Koşu | Kullanıcı | Süre | İstek | Fail |
|------|-----------|------|-------|------|
| Baseline | ~15 | 5 dk | 1075 | **0** |
| Kapasite | 15→50 (shape) | 20 dk | 7158 | 19 (**%0,27**) |

Yoğunluk profili gerçek restoran segmentinin **çok üstünde**; operasyonel yeterlilik göstergesi olarak yorumlanmalıdır.

---

## İlgili okuma

- [[Backend_Environment]] — ölçeklendirme env
- [[WebSocket_Architecture]] — WS host / split deploy
- [[Orders]] — `complete_table`, ödeme
- [[Branches]] — CLEANING / `finish_cleaning`
