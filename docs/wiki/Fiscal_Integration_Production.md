# 🏭 Beko / Token X-Connect Cloud — Üretim Ortamı Kurulum Rehberi

> **Özet:** Canlı (prod) ortamda Beko ÖKC bulut entegrasyonunun çalışması için Ramis sunucu ortam değişkenleri, Token portal kimlik bilgileri ve POS terminal form ayarlarının birlikte yapılandırılması gerekir. Bu sayfa operatör ve sistem yöneticisi için adım adım kontrol listesidir; test ortamı URL'leri prod'da kullanılmamalıdır.

- **Kütüphaneler:** Django REST API, Token X-Connect Cloud REST + Webhook, nginx, systemd
- **Bağlantılar:** [[Fiscal_Integration]], [[Backend_Environment]], [[Deployment]], [[POS_Display]], [[Runtime_Config]], [[Index]]

---

## 🎯 Kapsam

Bu rehber yalnızca **Beko ÖKC (GMP3) + Bağlantı Türü: Bulut (Token X-Connect Cloud)** senaryosunu kapsar.

Üç yapılandırma katmanı vardır:

| Katman | Nerede | Kim yapar |
|--------|--------|-----------|
| **1. Sunucu** | `/etc/ramis/backend.env` | Sistem yöneticisi |
| **2. Token / Beko** | Token Developer Portal + Set Client Settings | Entegrasyon sorumlusu / Token ekibi |
| **3. POS terminal** | Yönetici → POS Ayarları → terminal düzenle | İşletme yöneticisi |

---

## 1️⃣ Ramis sunucusu (`backend.env`)

### `FISCAL_WEBHOOK_BASE_URL`

Token'ın ödeme sonucunu (webhook) Ramis'e gönderebilmesi için **public erişilebilir API kök URL** tanımlanmalıdır.

```bash
# /etc/ramis/backend.env
FISCAL_WEBHOOK_BASE_URL=https://erp.sirketiniz.com
```

| Ortam | Örnek değer | Not |
|-------|--------------|-----|
| Domain + SSL (önerilen) | `https://erp.sirketiniz.com` | Canlı prod için tercih edilir |
| IP tabanlı kurulum | `http://192.168.1.50` | `install.sh` varsayılanı; Token sunucularının bu IP'ye erişebilmesi gerekir |

**Kurallar:**

- Sadece **scheme + host** (+ gerekirse port); path yazmayın.
- `install.sh` kurulumda `http://<API_DOMAIN>` yazar.
- `update.sh --change-ip` IP değişince bu anahtarı da günceller.
- **Ramis Ayar Yöneticisi** (`system_utils/ramis_settings`) → **Mali entegrasyon (ÖKC)** sekmesinden düzenlenebilir.

### Türetilen webhook adresi

Terminal kaydedildikten ve `FISCAL_WEBHOOK_BASE_URL` tanımlı olduktan sonra admin panelinde görünür:

```text
{FISCAL_WEBHOOK_BASE_URL}/api/v1/sales/fiscal/webhook/{terminal_uuid}/
```

Örnek:

```text
https://erp.sirketiniz.com/api/v1/sales/fiscal/webhook/a1b2c3d4-....../
```

Bu URL **Token Set Client Settings** API veya portal üzerinden Token tarafına kaydedilmelidir. Ramis şu an otomatik kayıt yapmaz.

### Altyapı gereksinimleri

- nginx (veya ters vekil) `POST /api/v1/sales/fiscal/webhook/` isteklerini Django/Uvicorn'a yönlendirmeli.
- URL **internetten erişilebilir** olmalıdır; yalnızca localhost veya kapalı LAN yeterli değildir.
- HTTPS kullanımı prod için önerilir ([[Deployment]], `SECURE_SSL_REDIRECT`).

---

## 2️⃣ Token / Beko tarafı

Aşağıdaki bilgiler **Token Developer Portal** veya Token/Beko entegrasyon ekibinden alınır. Test credential'ları prod cihazda çalışmaz.

| Bilgi | Açıklama | Ramis'te nereye girilir |
|-------|----------|-------------------------|
| **Client ID** | Uygulama kimliği | POS form → Client ID |
| **Client Secret** | Uygulama gizli anahtarı | POS form → Client Secret |
| **Prod API URL** | Canlı Token X-Connect API kökü | POS form → API URL Override |
| **Prod Auth URL** (nadiren) | Token alma farklı host'taysa | POS form → Auth URL Override |
| **Terminal ID** | Cihaz yasal seri no (AV… / AT…) | POS form → Terminal ID |
| **Webhook URL** | Yukarıda türetilen Ramis endpoint | Token Set Client Settings |

**Resmi dokümantasyon:** [Token X-Connect Cloud — Geliştirici Dokümanı (TR)](https://developer.tokeninc.com/token-developer-portal-1/x-platform/token-x-connect-cloud/gelistirici-dokumani-tr)

---

## 3️⃣ POS terminal formu (Yönetici Paneli)

**Yol:** Yönetici Paneli → POS Ayarları → terminal düzenle / yeni

**Bileşenler:** `PosTerminalsPanel.tsx`, `FiscalSettingsForm.tsx` — bkz. [[Fiscal_Integration#Arayüz ve Kullanıcı Deneyimi]]

### Zorunlu seçimler

| Alan | Prod değeri |
|------|-------------|
| Mali Entegrasyon Türü | **Beko ÖKC (GMP3)** |
| Bağlantı Türü | **Bulut (Token X-Connect Cloud)** |

### Alan rehberi

#### Client ID & Client Secret

Token'ın verdiği **canlı ortam** uygulama kimlik bilgileri. Test portalından alınan değerler prod yazar kasada hata üretir.

#### API URL Override (Opsiyonel)

Ramis → Token giden isteklerin hedefi (sepet gönderme, mali parametreler, polling fallback):

- **Canlı:** Token'ın ilettiği **prod API kök URL** (genelde `.../app-store/external` ile biter).
- **Boş bırakılırsa:** Kod varsayılan **test** URL'sini kullanır — prod için **uygun değildir**.

Varsayılan (test — prod'da kullanmayın):

```text
https://test-api.devtokeninc.com/app-store/external
```

Path'in tam olması gerekir; `.../app-store/` gibi eksik path 404 / API hatasına yol açar.

#### Auth URL Override (Opsiyonel)

Yalnızca **access token** isteği (`POST /v1/auth/token`) için kullanılır.

- **Çoğu kurulumda boş bırakın** → kimlik doğrulama da API URL üzerinden yapılır.
- Token auth'u farklı bir host'ta sunuyorsa buraya o adresi girin.

#### Terminal ID (Yasal Seri No: AV/AT…)

Fiziksel yazar kasanın Token bulutuna kayıtlı **yasal seri numarası**. Token'daki terminal kaydı ile birebir eşleşmeli; aksi halde sepet yanlış cihaza gider veya hiç iletilmez.

#### Webhook Endpoint URL (salt okunur)

- `FISCAL_WEBHOOK_BASE_URL` tanımlı ve terminal kayıtlıysa formda görünür.
- Bu adresi kopyalayıp Token **Set Client Settings** ile kaydedin.

---

## 4️⃣ Önerilen canlı kurulum sırası

```text
1. Token'dan prod Client ID, Client Secret, prod API URL ve terminal kaydı alın
2. Ramis sunucuda FISCAL_WEBHOOK_BASE_URL = public HTTPS kök URL tanımlayın
3. nginx → /api/v1/sales/fiscal/webhook/... backend'e yönlensin
4. migrate sonrası POS ayarlarında terminal oluşturun:
      Bulut + credential + Terminal ID + prod API URL
5. Formdaki webhook URL'yi Token'a kaydedin (Set Client Settings)
6. Test ödeme: sepet kasaya düşsün → kasiyer onaylasın → Sale.fiscal_printed=true olsun
```

---

## 5️⃣ Test vs üretim karşılaştırması

| Ayar | Test / geliştirme | Canlı (prod) |
|------|-------------------|--------------|
| API URL Override | Boş veya `test-api.devtokeninc.com/.../external` | Token prod API URL |
| Auth URL Override | Boş | Genelde boş |
| Client ID / Secret | Test portal | Prod portal |
| Terminal ID | Test cihaz seri no | Gerçek AV/AT seri no |
| `FISCAL_WEBHOOK_BASE_URL` | ngrok / staging HTTPS | Prod domain HTTPS |
| Webhook kaydı | Token test ortamı | Token prod ortamı |
| Mali entegrasyon türü (dev) | MOCK simülasyon kullanılabilir | **BEKO_GMP3 + CLOUD** |

---

## 6️⃣ Sık yapılan hatalar

| Hata | Sonuç | Çözüm |
|------|--------|--------|
| Test API URL prod'da bırakıldı | Yanlış ortam / API hataları | Token prod URL girin |
| Webhook Token'a kaydedilmedi | 120 sn webhook bekleme, sonra polling fallback; yavaşlık, rate limit riski | Set Client Settings ile webhook URL kaydı |
| `FISCAL_WEBHOOK_BASE_URL` boş | Admin panelde webhook URL görünmez | `backend.env` veya Ramis Ayar Yöneticisi |
| Terminal ID yanlış | Sepet kasaya gitmez | Token'daki cihaz seri no ile eşleştirin |
| API URL path eksik | 404, sepet gönderilemez | Tam path: `.../app-store/external` |
| Webhook URL internetten erişilemiyor | Token callback ulaşamaz | Firewall, nginx, HTTPS kontrolü |

---

## 7️⃣ Doğrulama kontrol listesi

Canlıya almadan önce:

- [ ] `FISCAL_WEBHOOK_BASE_URL` prod HTTPS kök URL ile tanımlı
- [ ] Webhook URL Token portalında kayıtlı
- [ ] POS terminal: BEKO_GMP3, CLOUD, prod Client ID/Secret, prod API URL, doğru Terminal ID
- [ ] Auth URL yalnızca Token farklı host verdiyse dolu
- [ ] nginx `/api/v1/` → Uvicorn yönlendirmesi çalışıyor
- [ ] Uçtan uca test ödemesi: fiş kesildi, `Sale` mali alanları doldu
- [ ] Test credential ve test API URL prod ortamında **kullanılmıyor**

---

## 📎 İlgili okuma

- Mimari ve akış: [[Fiscal_Integration]]
- Ortam değişkenleri: [[Backend_Environment#9. Mali entegrasyon (Token X-Connect Cloud)]]
- Kurulum / IP güncelleme: [[Deployment]]
- POS terminal modeli: [[POS_Display]]
