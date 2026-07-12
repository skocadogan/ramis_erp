# Prep Display (İstasyon Hazırlık Kiosk Akışı)

> **Özet:** `prep_display` modülü, klasik kullanıcı girişi olmadan istasyon bazlı hazırlık ekranı açabilen kiosk oturumu sağlar. Şube + istasyon seçimi sonrası imzalı bir display token üretilir ve bu token ile sadece ilgili istasyonun hazırlık görevleri okunur. Aynı token, KDS bildirim kanalına güvenli ama anonim (JWT’siz) abone olmak için de kullanılır.
> **Kütüphaneler:** Django REST Framework, Django signing (TimestampSigner), Django Channels
> **Bağlantılar:** [[Prep]], [[Frontend_KDS]], [[WebSocket_Architecture]], [[Frontend_WebSocket]], [[Electron_KDS_Prep_Window]]

---

## Konum
- `backend/apps/prep_display/`
- URL mount: `backend/config/urls.py` → `/api/v1/prep-display/`

## Amaç
- Restoran içinde sabit bir hazırlık ekranının kullanıcı hesabı olmadan çalışması
- Yalnızca seçilen istasyon kapsamına erişim
- Electron kiosk ve web route arasında ortak token modeli

## API Uç Noktaları

| Uç Nokta | Metot | Auth | Amaç |
|---|---|---|---|
| `/setup/branches/` | GET | `AllowAny` | Aktif şubeleri döner |
| `/setup/stations/?branch_id=...` | GET | `AllowAny` | Şubeye bağlı aktif istasyonları döner |
| `/session/` | POST | `AllowAny` | `branch_id` + `station_id` ile `display_token` üretir |
| `/verify/` | POST | `AllowAny` | Kayıtlı token geçerliliğini doğrular |
| `/station/` | GET | `PrepDisplayTokenAuthentication` | Token’ın bağlandığı istasyonu döner |
| `/tasks/` | GET | `PrepDisplayTokenAuthentication` | İstasyonun hazırlık görevlerini döner |

## Token Modeli
- Üretim: `make_prep_display_token(branch_id, station_id)`
- Doğrulama: `verify_prep_display_token(token)`
- İmza: `TimestampSigner(salt="prep-display-kiosk")`
- Varsayılan süre: `PREP_DISPLAY_TOKEN_MAX_AGE` (fallback: 30 gün / `2592000`)

Token payload formatı:
- `<branch_id>:<station_id>`

Geçersiz/süresi dolmuş token:
- API tarafında `401` veya `403` döner
- frontend setup ekranına geri düşer

## Authentication Katmanı
- Sınıf: `PrepDisplayTokenAuthentication`
- Kabul edilen kaynaklar:
  - Header: `X-Prep-Display-Token`
  - Query: `t` veya `display_token`
- Request user yerine `PrepDisplayPrincipal` kullanılır (`branch_id`, `station_id`)

## Prep Görev Sorgulama Kuralı
- `/tasks/` endpoint’i token’daki istasyon dışına erişimi engeller
- `get_active_prep_tasks(...)` çağrısı ile `branch_id` + `station_id` kapsamı korunur
- `include_historic_completed` query bayrağı desteklenir

## WebSocket Entegrasyonu
- Consumer: `apps.orders.consumers.KitchenNotificationConsumer`
- Yeni akış: query’de `prep_display_token` (veya `pdt`) varsa JWT auth bypass edilir
- Token doğrulanınca bağlantı `kitchen_notifications_<branch_id>` grubuna alınır
- Prep ekranı `prep_updated` / `kds_refresh[prep_update]` olaylarını dinleyerek görev listesini tazeler

## Güvenlik Sınırları
- Token, branch+station çiftine sabitlenir
- İstasyon mismatch denemelerinde `403`
- İstasyon veya şube pasifleşmişse doğrulama başarısız olur
- Bu model yalnızca hazırlık ekranı read/display akışı için tasarlanmıştır; yönetim yetkisi vermez
