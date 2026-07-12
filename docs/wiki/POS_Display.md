# POS Display (Müşteri Ekranı ve POS Terminalleri)

> **Özet:** Müşteri ekranı ayarları, tanıtım slaytları ve POS terminal tanımları. WebSocket ile aktif sipariş durumu müşteri ekranına yansıtılır. Terminal başına bağlı aktif oturumları listeleme ve yönetme (`pos.manage_connections`) desteği eklenmiştir.
> **Kütüphaneler:** Django ORM, Django Channels
> **Bağlantılar:** [[Branches]], [[Orders]], [[Sales]], [[Shifts]], [[WebSocket_Architecture]], [[POS_Connected_Users]], [[Fiscal_Integration]], [[Frontend_POS]], [[Menu_Product_Recommendations]]

---

## Konum
`backend/apps/pos_display/`

## Modeller

### DisplaySettings
Şube bazlı singleton — karşılama, sipariş ve ödeme mesajları.

### PromotionSlide
Kampanya slaytları (IMAGE/TEXT). Sıralama ve süre ayarları.

### PosTerminal
| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch` | `FK → Branch` | Şube |
| `code` | `CharField` | Kanal kodu (kasa-1) |
| `name` | `CharField` | Görünen ad |
| `fiscal_type` | `CharField` | Mali Entegrasyon Türü (NONE, MOCK, BEKO_GMP3, vb.) |
| `fiscal_settings` | `JSONField` | Mali Cihaz Parametreleri (IP, Port, API anahtarı vb.) |

`(branch, code)` unique constraint. WebSocket kanal anahtarı olarak kullanılır.

## Services
`services.py` — Müşteri ekranı WS abonelik imzası (TimestampSigner).

## API: Bağlantı Yönetimi

### `PosTerminalViewSet` — Connections Aksiyonları

`GET /api/v1/pos-display/terminals/{id}/connections/`
Terminale bağlı aktif oturumları listeler. `pos.view_pos`, `pos.manage_display`, `waiter.access` veya `pos.manage_connections` izinlerinden birisi yeterlidir.

`POST /api/v1/pos-display/terminals/{id}/disconnect_connection/`
Belirtilen oturumu zorla kapatır. Yalnızca `pos.manage_connections` izni ile kullanılabilir.

Bkz. [[POS_Connected_Users]] — arayüz ve izin detayları.

## Settings
```python
POS_DISPLAY_WS_TOKEN_MAX_AGE = 86400  # 24 saat
```

## Müşteri ekranı — önerilen ürünler senkronu

Kasiyer POS'ta bir ürünün **Öneriler** dialog'unu açtığında `usePosDisplaySync` WebSocket payload'ına `recommendedModal` ekler. Müşteri ekranı (`app/pos/display/[id]/page.tsx`) `CustomerDisplayRecommendedModal` ile aynı listeyi gösterir; sepete ekleme/çıkarma anlık güncellenir.

Backend `DISPLAY_UPDATE` consumer'ı payload alanlarını olduğu gibi iletir; ek model veya endpoint gerekmez. Ayrıntı: [[Menu_Product_Recommendations]], [[Allergens]] (benzer CFD deseni).

## Müşteri ekranı — kalori senkronu

Menü ürününde tanımlı **`calories`** (kCal) değeri müşteri ekranında iki noktada gösterilir:

| Durum | Bileşen | Kaynak |
|-------|---------|--------|
| Sepette ürün varken | `CustomerDisplayView` | `CartItem.product.calories` — adın altında |
| Kasiyer birim/seçenek modalı açıkken | `CustomerDisplayOptionsModal` | `displayOptionsModal.calories` (`buildDisplayOptionsModalPayload`) |

WebSocket payload'ı `usePosDisplaySync` ile POS store'dan taşınır; backend ek alan gerektirmez. Gösterim yalnızca pozitif tam sayı kaloride yapılır. Kaynak alan: [[Menu#Product]] (`0026_product_calories`).
