# Smart Table — RAMIS Backend API Dokümantasyonu

> **Sürüm:** 1.0  
> **Tarih:** 2026-06-05  
> **Amaç:** Smart Table mobil uygulamasının RAMIS ERP backend'i ile iletişim kurması için gerekli API referansı.

---

## 1. Genel Bilgiler

### Base URL
```
https://{domain}/api/v1/
```

### Authentication
JWT tabanlı kimlik doğrulama kullanılır.

| Endpoint | Metod | Açıklama |
|---|---|---|
| `/api/v1/auth/token/` | POST | Kullanıcı adı/şifre ile token al |
| `/api/v1/auth/token/refresh/` | POST | Token yenile |
| `/api/v1/auth/token/pin/` | POST | PIN ile giriş (şube bazlı) |
| `/api/v1/auth/me/` | GET | Mevcut kullanıcı profilini getir |

**Header:** `Authorization: Bearer <access_token>`

### Branch Scope
Çoğu endpoint, kullanıcının erişebildiği şubelere göre otomatik filtrelenir.

### Pagination
Liste endpoint'leri genelde sayfalıdır:
```json
{
  "count": 150,
  "next": "https://...?page=2",
  "previous": null,
  "results": [...]
}
```

### Soft Delete
Tüm modeller `is_active` alanı kullanır. DELETE isteği `is_active=False` yapar.

### Idempotency (Sipariş oluşturma)
`POST /api/v1/orders/main/` isteklerinde opsiyonel **`Idempotency-Key`** header'ı desteklenir. Ağ retry veya çift tıklama durumunda aynı anahtarla tekrarlanan istekler tek sipariş oluşturur.

| Özellik | Değer |
|---|---|
| Header | `Idempotency-Key` |
| Smart Table formatı | `pos:create:{uuid}` (her sipariş denemesinde yeni UUID) |
| Maks. uzunluk | 128 karakter |
| Header yoksa | Yanıt düz sipariş serializer formatında (geriye dönük uyumlu) |
| Header varsa | Yanıt zarf (envelope) formatında döner |

**Smart Table istemci davranışı:**
- `order-store.placeOrder` her çağrıda `buildOrderCreateIdempotencyKey(randomUUID())` üretir.
- `isPlacingOrder` mutex ile eşzamanlı/çift gönderim UI'da engellenir (`CartSheet`).
- Zarf yanıtından sipariş gövdesi `unwrapOrderCreateResponse` ile çıkarılır.

Ayrıntılı backend sözleşmesi: `docs/wiki/POS_Offline_Queue.md` → Idempotency bölümü.

---

## 2. Smart Table İçin Kritik Endpoint'ler

### 2.1 Kategoriler (Menu Categories)

**`GET /api/v1/menu/categories/`**

Kullanıcının erişebildiği şubelere ait tüm kategorileri listeler.

**Query Params:** `?page=1&page_size=50`

**Response:**
```json
{
  "count": 42,
  "results": [
    {
      "id": "uuid",
      "name": "Başlangıçlar",
      "description": "Lezzetli başlangıç seçenekleri",
      "is_active": true,
      "order": 1,
      "color": "#3b82f6",
      "station": "uuid|null",
      "station_name": "string|null",
      "created_at": "2026-01-15T10:30:00Z",
      "updated_at": "2026-01-15T10:30:00Z"
    }
  ]
}
```

> **Not:** Backend'de `nameEn`, `descriptionEn`, `imageUrl`, `iconName`, `productCount` alanları **yoktur**. Smart Table UI'da bu eksik alanlar için fallback kullanılmalıdır.

---

### 2.2 Ürünler (Menu Products)

#### Liste
**`GET /api/v1/menu/products/`**

**Query Params:**
| Param | Değer | Açıklama |
|---|---|---|
| `show_on_pos` | `1` veya `true` | POS'da görünen ürünler |
| `category_id` | `uuid` | Kategoriye göre filtrele |
| `is_featured` | `1` veya `true` | Öne çıkan ürünler |
| `branch_id` | `uuid` | Stok kontrolü için şube bazlı |
| `page` | `1` | Sayfa numarası |
| `page_size` | `N` | Sayfa başına kayıt |

**Response:**
```json
{
  "count": 150,
  "results": [
    {
      "id": "uuid",
      "category": "uuid",
      "category_name": "Başlangıçlar",
      "category_color": "#F97316",
      "name": "Humus",
      "description": "Nohut, tahin, zeytinyağı...",
      "base_price": "185.0000",
      "gross_price": "195.00",
      "tax_rate": "10.00",
      "discount_rate": "0.000",
      "discounted_price": null,
      "has_discount": false,
      "is_active": true,
      "show_on_pos": true,
      "is_show_on_menu": true,
      "is_featured": false,
      "is_popular": true,
      "is_chef_recommendation": true,
      "is_combined": false,
      "image": "https://...jpg",
      "order": 0,
      "branches": ["uuid"],
      "branch_names": ["Ramis Beşiktaş"],

      "units": [
        {
          "id": "uuid",
          "name": "Porsiyon",
          "multiplier": "1.0000",
          "price_override": null,
          "order": 0,
          "calculated_price": "185.0000"
        }
      ],

      "combined_items": [],

      "variants": [
        {
          "id": "uuid",
          "product": "uuid",
          "name": "Normal",
          "price_adjustment": "0.0000",
          "is_active": true
        }
      ],

      "modifier_groups": [
        {
          "id": "uuid",
          "name": "Ekstra Malzeme",
          "is_multiple": true,
          "is_required": false,
          "is_active": true,
          "modifiers": [
            {
              "id": "uuid",
              "name": "Kıyma",
              "price_adjustment": "45.0000"
            }
          ],
          "product_ids": ["uuid"]
        }
      ],

      "allergens": [
        {
          "id": "uuid",
          "name": "Süt",
          "severity": "MEDIUM"
        }
      ],

      "is_allergenic": true,
      "availability_mode": "UNLIMITED",
      "preparation_time": 8,
      "is_reserved_out": false,
      "updated_at": "2026-01-15T10:30:00Z"
    }
  ]
}
```

#### Detay
**`GET /api/v1/menu/products/{id}/`**

Aynı JSON yapısını döndürür (tek kayıt).

---

### 2.3 Varyantlar (Product Variants)

**`GET /api/v1/menu/variants/`**

```json
[
  {
    "id": "uuid",
    "product": "uuid",
    "name": "Normal",
    "price_adjustment": "0.0000",
    "is_active": true,
    "created_at": "datetime",
    "updated_at": "datetime"
  }
]
```

---

### 2.4 Modifier Groups & Modifiers

**`GET /api/v1/menu/modifier-groups/`**

```json
[
  {
    "id": "uuid",
    "name": "Ekstra Malzeme",
    "is_multiple": true,
    "is_required": false,
    "is_active": true,
    "modifiers": [
      { "id": "uuid", "name": "Kıyma", "price_adjustment": "45.0000" }
    ],
    "product_ids": ["uuid"],
    "created_at": "datetime",
    "updated_at": "datetime"
  }
]
```

**`GET /api/v1/menu/modifiers/`**

```json
[
  {
    "id": "uuid",
    "group": "uuid",
    "name": "Kıyma",
    "price_adjustment": "45.0000",
    "is_active": true
  }
]
```

---

### 2.5 Şubeler (Branches)

**`GET /api/v1/branches/`**

```json
[
  {
    "id": "uuid",
    "name": "Ramis Restaurant Beşiktaş",
    "code": "RMBLK",
    "address": "Beşiktaş/İstanbul",
    "phone": "0212xxx",
    "currency": "TRY",
    "tax_rate": "10.00",
    "invoice_prefix": "RMB"
  }
]
```

---

### 2.6 Zone'lar (Bölgeler)

**`GET /api/v1/zones/`**

```json
[
  {
    "id": "uuid",
    "branch": "uuid",
    "name": "Ana Salon",
    "description": null,
    "color": "#f8fafc",
    "is_takeaway": false,
    "sort_order": 0,
    "is_active": true
  }
]
```

**`GET /api/v1/zones/summary/?branch_id=uuid`**

```json
[
  {
    "id": "uuid",
    "name": "Ana Salon",
    "total_tables": 10,
    "free_tables": 5,
    "occupied_tables": 3,
    "reserved_tables": 1,
    "cleaning_tables": 1,
    "out_of_service_tables": 0
  }
]
```

---

### 2.7 Masalar (Tables)

**`GET /api/v1/tables/?branch_id=uuid`**

```json
[
  {
    "id": "uuid",
    "name": "M01",
    "table_number": 1,
    "zone": "uuid",
    "zone_name": "Ana Salon",
    "branch_name": "Ramis Beşiktaş",
    "branch_id": "uuid",
    "zone_is_takeaway": false,
    "capacity": 4,
    "min_capacity": 1,
    "size": "MEDIUM",
    "shape": "SQUARE",
    "status": "OCCUPIED",
    "position_x": 10,
    "position_y": 20,
    "is_active": true,
    "active_order": {
      "id": "uuid",
      "total_amount": "855.0000",
      "created_at": "datetime",
      "status": "PREPARING"
    } | null
  }
]
```

**`GET /api/v1/tables/{id}/qrcode/`**

```json
{
  "table_id": "uuid",
  "table_name": "M01",
  "zone_name": "Ana Salon",
  "qr_code": "data:image/png;base64,..."
}
```

---

### 2.8 Siparişler (Orders)

**`GET /api/v1/orders/main/?table_id=uuid`**

```json
[
  {
    "id": "uuid",
    "branch": "uuid",
    "branch_name": "Ramis Beşiktaş",
    "table": "uuid",
    "table_name": "M03",
    "order_type": "TABLE",
    "status": "PREPARING",
    "total_amount": "855.0000",
    "notes": null,
    "items": [
      {
        "id": "uuid",
        "product": "uuid",
        "product_name": "Izgara Köfte",
        "product_image": "https://...jpg",
        "variant_name": null,
        "unit_name": "Porsiyon",
        "quantity": 2,
        "unit_price": "295.0000",
        "total_price": "590.0000",
        "status": "PREPARING",
        "notes": null,
        "modifiers": [
          {
            "id": "uuid",
            "modifier": "uuid",
            "modifier_name": "Pirinç Pilavı",
            "price": "0.0000"
          }
        ],
        "station_name": "Mutfak",
        "category_name": "Ana Yemekler",
        "table_name": "M03"
      }
    ],
    "created_at": "datetime",
    "updated_at": "datetime"
  }
]
```

**`POST /api/v1/orders/main/`** — Yeni sipariş oluştur

**Headers (opsiyonel):**

| Header | Örnek | Açıklama |
|---|---|---|
| `Idempotency-Key` | `pos:create:550e8400-e29b-41d4-a716-446655440000` | Aynı anahtar + aynı gövde → önbellekteki yanıt |

**Request body:**
```json
{
  "branch_id": "uuid",
  "table_id": "uuid",
  "order_type": "TABLE",
  "notes": "string",
  "items": [
    {
      "product_id": "uuid",
      "variant_id": "uuid|null",
      "quantity": 2,
      "unit_price": "295.0000",
      "unit_name": "Porsiyon",
      "notes": "string",
      "modifier_ids": ["uuid"]
    }
  ]
}
```

**Response (`Idempotency-Key` ile — zarf):**
```json
{
  "status": "created",
  "idempotency_key": "pos:create:550e8400-e29b-41d4-a716-446655440000",
  "order": {
    "id": "uuid",
    "branch": "uuid",
    "table": "uuid",
    "status": "PENDING",
    "total_amount": "590.0000",
    "items": []
  }
}
```

Tekrar istek (aynı anahtar + aynı gövde) → HTTP **200/201**, `status: "already_processed"`, `order` alanı önceki sipariş.

**Response (`Idempotency-Key` olmadan — düz):** Yukarıdaki `order` nesnesi doğrudan döner (zarf yok).

**409 Conflict (idempotency):**

| `code` | Anlamı |
|---|---|
| `IDEMPOTENCY_CONFLICT` | Aynı anahtar, farklı istek gövdesi |
| `IDEMPOTENCY_SCOPE_MISMATCH` | Anahtar farklı işlem kapsamında kayıtlı |

```json
{
  "detail": "Aynı idempotency anahtarı farklı istek gövdesi ile kullanıldı.",
  "code": "IDEMPOTENCY_CONFLICT",
  "error": "Aynı idempotency anahtarı farklı istek gövdesi ile kullanıldı."
}
```

---

### 2.9 Garson Çağrı (Waiter Call)

**`GET /api/v1/call-waiter/?table_id=uuid`** — Public (auth gerekmez)

```json
{
  "status": "accepted",
  "table_id": "uuid",
  "table_name": "M03",
  "call_id": "uuid",
  "notified_count": 3
}
```

**`GET /api/v1/smart-button/table/?table_id=uuid`** — Public

```json
{
  "table_id": "uuid",
  "table_name": "M03",
  "zone_name": "Ana Salon"
}
```

---

## 3. Smart Table ↔ API Veri Dönüşüm Haritası

### 3.1 Category (Demo → API)

| Demo Alan (smart_table/types) | API Alanı | Dönüşüm |
|---|---|---|
| `id` | `id` | ✅ Birebir |
| `name` | `name` | ✅ Birebir |
| `nameEn` | ❌ Yok | `name` kullan, fallback |
| `description` | `description` | ✅ (nullable) |
| `descriptionEn` | ❌ Yok | `description` kullan |
| `order` | `order` | ✅ Birebir |
| `color` | `color` | ✅ Birebir |
| `imageUrl` | ❌ Yok | Varsayılan icon kullan |
| `iconName` | ❌ Yok | Varsayılan icon kullan |
| `productCount` | ❌ Yok | Client hesaplar |

### 3.2 Product (Demo → API)

| Demo Alan | API Alanı | Dönüşüm |
|---|---|---|
| `id` | `id` | ✅ |
| `categoryId` | `category` | ✅ (category UUID) |
| `categoryName` | `category_name` | ✅ |
| `name` | `name` | ✅ |
| `nameEn` | ❌ Yok | `name` kullan |
| `description` | `description` | ✅ (nullable) |
| `descriptionEn` | ❌ Yok | `description` kullan |
| `basePrice` | `base_price` | ✅ (string→number parse) |
| `grossPrice` | `gross_price` | ✅ |
| `taxRate` | `tax_rate` | ✅ |
| `discountRate` | `discount_rate` | ✅ |
| `imageUrl` | `image` | ✅ |
| `images[]` | ❌ Yok | `image`'dan tekli dizi oluştur |
| `units[].id` | `units[].id` | ✅ |
| `units[].name` | `units[].name` | ✅ |
| `units[].nameEn` | ❌ Yok | `name` kullan |
| `units[].multiplier` | `units[].multiplier` | ✅ (string→number) |
| `units[].price` | `units[].calculated_price` | ✅ |
| `units[].isDefault` | ❌ Yok | İlk unit'i default yap |
| `variants[].id` | `variants[].id` | ✅ |
| `variants[].name` | `variants[].name` | ✅ |
| `variants[].nameEn` | ❌ Yok | `name` kullan |
| `variants[].priceAdjustment` | `variants[].price_adjustment` | ✅ (string→number) |
| `variants[].isDefault` | ❌ Yok | İlk variant'ı default yap |
| `modifierGroups[].id` | `modifier_groups[].id` | ✅ |
| `modifierGroups[].name` | `modifier_groups[].name` | ✅ |
| `modifierGroups[].nameEn` | ❌ Yok | `name` kullan |
| `modifierGroups[].isRequired` | `modifier_groups[].is_required` | ✅ |
| `modifierGroups[].isMultiple` | `modifier_groups[].is_multiple` | ✅ |
| `modifierGroups[].maxSelection` | ❌ Yok | Varsayılan: 99 |
| `modifierGroups[].modifiers[].id` | `modifiers[].id` | ✅ |
| `modifierGroups[].modifiers[].name` | `modifiers[].name` | ✅ |
| `modifierGroups[].modifiers[].price` | `modifiers[].price_adjustment` | ✅ (string→number) |
| `allergens[].id` | `allergens[].id` | ✅ |
| `allergens[].name` | `allergens[].name` | ✅ |
| `allergens[].nameEn` | ❌ Yok | `name` kullan |
| `allergens[].severity` | `allergens[].severity` | ✅ |
| `nutritionalInfo` | ❌ Yok | API'de yok, opsiyonel |
| `preparationTime` | `preparation_time` | ✅ |
| `isPopular` | `is_popular` | ✅ |
| `isChefRecommendation` | `is_chef_recommendation` | ✅ |
| `rating` | ❌ Yok | Varsayılan: null |
| `ratingCount` | ❌ Yok | Varsayılan: null |

---

## 4. API İstek Örnekleri

### Token Alma (PIN ile)
```bash
curl -X POST https://api.ramis.com/api/v1/auth/token/pin/ \
  -H "Content-Type: application/json" \
  -d '{"pin_code": "1234", "branch_id": "uuid"}'
```

### Kategorileri Getir
```bash
curl -X GET https://api.ramis.com/api/v1/menu/categories/ \
  -H "Authorization: Bearer <token>"
```

### Kategoriye Göre Ürünleri Getir
```bash
curl -X GET "https://api.ramis.com/api/v1/menu/products/?category_id={uuid}&page_size=100" \
  -H "Authorization: Bearer <token>"
```

### Ürün Detayı
```bash
curl -X GET "https://api.ramis.com/api/v1/menu/products/{id}/" \
  -H "Authorization: Bearer <token>"
```

### Tüm Ürünleri Getir (Menu için)
```bash
curl -X GET "https://api.ramis.com/api/v1/menu/products/?show_on_pos=1&page_size=200" \
  -H "Authorization: Bearer <token>"
```

### Sipariş Oluştur (Idempotency-Key ile)
```bash
curl -X POST https://api.ramis.com/api/v1/orders/main/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pos:create:550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "branch_id": "uuid",
    "table_id": "uuid",
    "order_type": "TABLE",
    "notes": "",
    "items": [
      {
        "product_id": "uuid",
        "variant_id": null,
        "quantity": 1,
        "unit_price": "185.0000",
        "unit_name": "Porsiyon",
        "notes": "",
        "modifier_ids": []
      }
    ]
  }'
```

> Retry veya ağ kesintisinde **aynı** `Idempotency-Key` ve **aynı** gövde ile tekrar gönderin; backend çift sipariş oluşturmaz.

---

## 5. Backend'de Olmayan / Smart Table'da Kullanılan Alanlar

Aşağıdaki alanlar RAMIS backend'inde bulunmamaktadır. Smart Table'da ya kaldırılmalı ya da fallback değer atanmalıdır:

| Alan | Sebep | Çözüm |
|---|---|---|
| `Category.nameEn` | Backend'de sadece `name` var | `name` alanını kullan |
| `Category.descriptionEn` | Backend'de sadece `description` var | `description` kullan |
| `Category.imageUrl` | Backend'de kategori resmi yok | Varsayılan ikon/renk kullan |
| `Category.iconName` | Backend'de kategori ikonu yok | Kategori adına göre ikon eşle |
| `Category.productCount` | Backend'de yok | Client-side hesapla |
| `Product.nameEn` | Backend'de yok | `name` kullan |
| `Product.ingredients` | Backend'de yok | `description`'dan çıkar veya boş |
| `Product.ingredientsEn` | Backend'de yok | `description` kullan veya boş |
| `Product.images[]` | Backend'de sadece `image` var | Tek elemanlı dizi oluştur |
| `Product.nutritionalInfo` | Backend'de yok | null/undefined |
| `Product.rating` | Backend'de yok | null |
| `Product.ratingCount` | Backend'de yok | null |
| `Product.unit.isDefault` | Backend'de yok | İlk unit'i default al |
| `Product.variant.isDefault` | Backend'de yok | İlk variant'ı default al |
| `ModifierGroup.maxSelection` | Backend'de yok | Varsayılan: 99 |
| `ModifierGroup.minSelection` | Backend'de yok | Varsayılan: 0 |
| `Allergen.icon` | Backend'de yok | null |
| `Allergen.nameEn` | Backend'de yok | `name` kullan |
| `ProductUnitInfo.type` | Backend'de yok | Varsayılan: PORTION |
| `ProductUnitInfo.nameEn` | Backend'de yok | `name` kullan |
| `ProductUnitInfo.isDefault` | Backend'de yok | İlk unit default |
| `ProductUnitInfo.price` | `calculated_price` kullan | `parseFloat(calculated_price)` |

---

## 6. Hata Kodları

| HTTP Code | Anlamı |
|---|---|
| 200 | Başarılı |
| 201 | Oluşturuldu |
| 400 | Geçersiz istek |
| 401 | Yetkilendirme hatası (token gerekli/süresi dolmuş) |
| 403 | Yetki yok (permission) |
| 404 | Kayıt bulunamadı |
| 409 | Çakışma (idempotency: `IDEMPOTENCY_CONFLICT`, `IDEMPOTENCY_SCOPE_MISMATCH`; diğer kaynak çakışmaları) |
| 429 | Rate limit aşıldı |
| 500 | Sunucu hatası |

---

*Döküman sonu — Smart Table ↔ RAMIS API entegrasyonu için.*
