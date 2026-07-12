# Üretim Planlaması ⇄ Stok Yönetimi Entegrasyonu

## 1. Giriş

Daha önce [[Production Planning|Üretim Planlaması]] modülü ile [[Inventory Management|Stok Yönetimi]] arasında bir mimari boşluk bulunuyordu:

- `ProductionPlan.approve()` onaylandığında herhangi bir stok blokajı oluşmuyor, sadece [[ProductDayAvailability]] güncelleniyordu.
- `PrepTask.complete()` tamamlandığında ise stok düşümü yapılmıyordu; sadece görev durumu değişiyordu.
- POS tarafında **INGREDIENT modu** stok kontrolü yaparken üretim planının rezerve ettiği malzemeleri hesaba katamıyordu.

Bu boşluk, **ProductionReservation** modeli ve rezervasyon bazlı yaklaşım ile kapatılmıştır. Artık üretim planı onayı ile stok arasında gerçek zamanlı, izlenebilir bir bağ bulunmaktadır.

---

## 2. Mimari Karar: Seçenek B — Rezervasyon Bazlı Yaklaşım

Üretim planı ile stok yönetimi arasındaki entegrasyon için üç seçenek değerlendirilmiştir:

| Seçenek | Yaklaşım | Değerlendirme |
|---------|----------|---------------|
| **A** | Anında Stok Düşümü | ProductionPlan onaylanır onaylanmaz doğrudan stok düşer. Plan ile fiili üretim arasındaki fark takip edilemez. |
| **B — Seçilen** | **Rezervasyon Bazlı** | ProductionPlan onayında **ACTIVE** rezervasyon oluşur, PrepTask tamamlanınca **CONSUMED** olur ve stok fiilen düşer. |
| **C** | Sadece Plan Kaydı | Eski davranış — stokla hiçbir bağ yok, sadece görsel planlama. |

### Neden Seçenek B?

1. **İzlenebilirlik:** Planlanan (ACTIVE) ile fiilen tüketilen (CONSUMED) arasındaki fark raporlanabilir.
2. **Esneklik:** Plan onaylandı diye stok hemen düşmez; üretim gerçekleşene kadar stokta bloke olarak görünür.
3. **POS Doğruluğu:** INGREDIENT modunda POS, `production_reserved` miktarını hesaba katarak satılabilecek ürün miktarını daha doğru belirler.
4. **Rollback Desteği:** Feature flag kapatıldığında tüm ACTIVE rezervasyonlar RELEASED yapılabilir, stokta kayıp olmaz.

---

## 3. ProductionReservation Modeli

### Model Tanımı

`backend/apps/inventory/models.py` içinde tanımlıdır. `BaseModel`'den türetilir ([soft delete](BaseModel.md)).

| Alan | Tip | Açıklama |
|------|-----|----------|
| `plan_line` | FK → `ProductionPlanLine` (nullable) | Hangi üretim planı satırı için rezerve edildi. Plan onayında her satıra ayrı rezervasyon oluşur. |
| `stock_item` | FK → `StockItem` (PROTECT) | Hangi malzeme/stok kalemi rezerve edildi. |
| `warehouse` | FK → `Warehouse` (PROTECT) | Hangi depo (genellikle mutfak deposu — `WarehouseType.KITCHEN`). |
| `quantity` | `Decimal(max_digits=12, decimal_places=6)` | Rezerve edilen miktar (reçete çözümlemesi sonucu). |
| `status` | `CharField(max_length=20)` | Rezervasyon durumu — aşağıdaki status değerlerine bakın. |
| `prep_task` | FK → `PrepTask` (SET_NULL, nullable) | Hangi [[Prep Tasks|hazırlık görevi]] tarafından tüketildi. PrepTask tamamlanınca doldurulur. |

### Status Değerleri

`ProductionReservationStatus` (TextChoices):

| Değer | Anlamı | Ne Zaman? |
|-------|--------|-----------|
| `ACTIVE` | Rezerve edildi, henüz tüketilmedi | `ProductionPlan.approve()` anında oluşur. |
| `CONSUMED` | Tüketildi, stok fiilen düştü | `PrepTask.complete()` sonrası. |
| `RELEASED` | Serbest bırakıldı, rezervasyon iptal | Rollback scripti ile veya manuel. |

### Durum Geçişleri

```
                    Rollback Script
                  ┌──────────────────┐
                  ▼                  │
  ACTIVE ──── filter().update() ────→ CONSUMED
    │              + deduct_stock()    │
    │                                  │
    └──────── Rollback Script ─────────→ RELEASED
```

> `filter().update()` mevcut ACTIVE kaydı bulup günceller → **duplicate oluşmaz**.
> `deduct_stock()` fiziksel stoğu düşürür → `StockMovement` OUT kaydı yaratılır.

### Unique Constraint

Aktif kayıtlar (`is_active=True`) için aynı `(stock_item, warehouse, plan_line)` kombinasyonu birden fazla kez rezerve edilemez.

### İndeksler

- `(warehouse, stock_item, status)` — POS stok kontrolü sorguları için.
- `(plan_line, status)` — Plan bazlı rezervasyon sorguları için.
- `(prep_task, status)` — Görev bazlı tüketim sorguları için.

---

## 4. Veri Akışı

### 4.1 ProductionPlan.approve() → ProductionReservation (ACTIVE)

```
ProductionPlan.approve()
    │
    ├── Feature flag kontrol: PRODUCTION_STOCK_RESERVATION_ENABLED=True ?
    │
    ├── plan.lines döngüsü (her satır için)
    │       │
    │       ├── Her satır için AYRI reçete çözümle
    │       │       (compute_recipe_requirements)
    │       │
    │       ├── Mutfak deposunu bul (WarehouseType.KITCHEN)
    │       │
    │       ├── Aynı (plan_line, stock_item) için önceden ACTIVE kayıt var mı?
    │       │       → varsa atla (tekrar rezervasyonu engelle)
    │       │
    │       └── ProductionReservation oluştur:
    │               plan_line = line (her satıra ayrı kayıt — direkt FK)
    │               stock_item_id = çözümlenen malzeme
    │               warehouse_id = mutfak deposu
    │               quantity = reçete ihtiyacı (her satır için ayrı)
    │               status = ACTIVE
    │               prep_task = None (PrepTask henüz oluşmadı)
    │
    └── Hata durumunda plan yine de onaylanır, hata loglanır
```

> **Değişiklik:** Önceden `plan_line=None` (toplu çözümleme) idi, şimdi her satır için ayrı `plan_line=line` ile kaydediliyor. Bu sayede PrepTask tamamlandığında hangi plan satırına ait olduğu doğrudan biliniyor.

**Kod:** `backend/apps/production_planning/views.py` → `_create_reservations_for_plan()`

### 4.2 PrepTask.complete() → Stok Düşümü + ProductionReservation (CONSUMED)

```
PrepTask.complete()
    │
    ├── Feature flag kontrol: PRODUCTION_STOCK_RESERVATION_ENABLED=True ?
    │
    ├── task.plan_line FK'sını kontrol et
    │       ├── VAR → direkt kullan (en hızlı yol)
    │       └── YOK + task.product VAR
    │               → tarih/şube/ürün ile ProductionPlanLine bul
    │               → bulunursa FK'yı geri yaz (sonraki çağrılar için)
    │
    ├── task.product FK'sını kontrol et
    │       ├── VAR → direkt kullan
    │       └── YOK → task.title ile Product.name__icontains eşleştir (fallback)
    │
    ├── product bulunamazsa → uyarı logla, stok düşümü yapma
    │       (görev YİNE DE tamamlanmış sayılır)
    │
    ├── Mutfak deposunu bul (WarehouseType.KITCHEN)
    │
    ├── Reçete ihtiyacını hesapla (compute_recipe_requirements)
    │
    └── Her stock_item için (2 adım):

        Adım 1 — Mevcut ACTIVE ProductionReservation'ı CONSUMED'e çek:
            filter(plan_line, stock_item, warehouse, ACTIVE)
            → update(status=CONSUMED, prep_task=task, quantity=qty)
            → bulunamazsa yeni CONSUMED kaydı oluştur

        Adım 2 — Fiziksel stok düşümü (StockMovement OUT):
            deduct_stock(
                warehouse_id=...,
                stock_item_id=...,
                quantity=qty,
                reference=f"prep_task_{task.id}",
                allow_negative=True,  # mutfak stoğu eksiye düşebilir
            )
```

> ⚠️ **Önemli:** 
> 1. Stok düşümü hata verse bile PrepTask tamamlanmış kalır. Mutfak üretime devam edebilir, hata loglanır.
> 2. ACTIVE → CONSUMED geçişi `update_or_create` ile DEĞİL, `filter().update()` ile yapılır. Bu sayede duplicate ACTIVE kaydı kalmaz.
> 3. `deduct_stock()` çağrısı `WarehouseStockLevel.quantity`'yi düşürür ve `StockMovement` OUT kaydı oluşturur.

**Kod:** `backend/apps/prep/services.py` → `_deduct_stock_for_completed_task()`

### 4.3 POS Satışı → ProductDayAvailability Düşer (PRODUCT Modu)

```
POS Sipariş (PRODUCT modu)
    │
    ├── Stok kontrolü YAPILMAZ
    │       (hammadde seviyesi kontrol edilmez)
    │
    ├── Sadece ProductDayAvailability.remaining_portions güncellenir
    │       (üretim planındaki günlük porsiyon limiti)
    │
    └── Eğer ürün SOLD_OUT veya remaining_portions ≤ 0 ise:
            POS uyarı gösterir / sipariş engellenir
```

### 4.4 POS Stok Kontrolü (INGREDIENT Modu)

```
POS Sipariş (INGREDIENT modu)
    │
    ├── Sepetteki her ürün için reçete çözümle
    │
    ├── Her (depo, malzeme) çifti için hesapla:
    │
    │       available = physical - reserved - production_reserved
    │           │            │           │
    │           │            │           └── ProductionReservation (ACTIVE)
    │           │            │               → get_production_reserved_quantity()
    │           │            │
    │           │            └── StockReservation (RESERVED) — sipariş rezervasyonu
    │           │
    │           └── WarehouseStockLevel.quantity (fiziksel stok)
    │
    ├── available < required  →  INSUFFICIENT_STOCK (sipariş engellenir)
    │
    └── available < minimum   →  CRITICAL_STOCK (uyarı)
```

> **Formül:** `Kullanılabilir Stok = Fiziksel Stok - Sipariş Rezervasyonu - Üretim Rezervasyonu`

**Kod:** `backend/apps/inventory/services/pos_stock_check_service.py` → `check_pos_cart_station_stock()`

---

## 5. Feature Flag: `PRODUCTION_STOCK_RESERVATION_ENABLED`

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `PRODUCTION_STOCK_RESERVATION_ENABLED` | `True` | ProductionPlan onayında rezervasyon oluşturmayı ve PrepTask tamamlamada stok düşümünü kontrol eder. |

**Tanım:** `backend/config/settings.py`

```python
PRODUCTION_STOCK_RESERVATION_ENABLED = os.environ.get(
    'PRODUCTION_STOCK_RESERVATION_ENABLED', 'True'
).lower() == 'true'
```

### Davranış

| Değer | ProductionPlan.approve() | PrepTask.complete() |
|-------|-------------------------|---------------------|
| `True` | ProductionReservation (ACTIVE) oluşur | Stok düşülür + ProductionReservation (CONSUMED) |
| `False` | Eski davranış (sadece plan kaydı) | Eski davranış (sadece görev tamamlama) |

### Kontrol Edilen Yerler

- `backend/apps/production_planning/views.py` — plan onay akışı
- `backend/apps/prep/services.py` — görev tamamlama akışı

---

## 6. Rollback

Feature flag `PRODUCTION_STOCK_RESERVATION_ENABLED=False` yapıldığında, mevcut **ACTIVE** rezervasyonların temizlenmesi gerekir. Aksi halde POS stok kontrolü `production_reserved` miktarını bloke etmeye devam eder.

### Rollback Script

```bash
python manage.py shell < scripts/rollback_production_reservations.py
```

**Kod:** `backend/scripts/rollback_production_reservations.py`

```python
from apps.inventory.models import ProductionReservation, ProductionReservationStatus

count = ProductionReservation.objects.filter(
    status=ProductionReservationStatus.ACTIVE,
    is_active=True,
).update(
    status=ProductionReservationStatus.RELEASED,
    is_active=False,
)

print(f"{count} ACTIVE production reservation(s) released.")
```

### Rolldown (Tekrar Açma)

FF tekrar `True` yapıldığında yeni plan onayları otomatik olarak rezervasyon oluşturur. RELEASED kayıtlar manuel müdahale gerektirmez; bir sonraki plan onayında ihtiyaç varsa yeniden ACTIVE rezervasyon oluşur.

---

## 7. Önemli Notlar

| # | Not |
|---|-----|
| 1 | **PrepTask stok düşümü hata verse bile görev tamamlanmış kalır.** Mutfak üretime devam edebilir, hata loglanır ve operasyonel aksama olmaz. |
| 2 | **PRODUCT modunda POS sadece ProductDayAvailability'ye bakar.** Hammadde stok kontrolü yapılmaz, `production_reserved` hesaba katılmaz. |
| 3 | **INGREDIENT modunda POS bloke stoku (production_reserved) hesaba katar.** `available = physical - reserved - production_reserved` formülü ile kullanılabilir stok hesaplanır. |
| 4 | **Çifte düşüş mekanizması yoktur.** PRODUCT modunda POS, ürün porsiyonunu (`ProductDayAvailability.remaining_portions`) düşer; PrepTask ise hammaddeyi (`WarehouseStockLevel`) düşer. Bunlar ayrı kanallardır ve birbiriyle çakışmaz. |
| 5 | **ProductionReservation `plan_line` alanı nullable'dır.** Plan onayında her satır için ayrı `plan_line=line` ile kaydedilir. Null olma durumu sadece fallback/geçmiş veri senaryoları için korunur. |
| 6 | **İki farklı rezervasyon türü vardır:** `StockReservation` (sipariş bazlı — POS sepet rezervasyonu) ve `ProductionReservation` (üretim bazlı — plan blokajı). İkisi `pos_stock_check_service`'de toplanarak `available` hesaplanır. |
| 7 | **Fiziksel stok düşümü (`deduct_stock`) ProductionReservation CONSUMED ile birlikte çalışır.** Rezervasyon durumu güncellenirken aynı anda `StockMovement` OUT kaydı oluşur ve `WarehouseStockLevel.quantity` düşer. Bu iki işlem aynı transaction içindedir. |
| 8 | **`PrepTask.plan_line` FK** 0010 numaralı migration ile eklenmiştir. Plan onayında plan_line bağlantısı otomatik kurulur. Fallback olarak title/tarih/şube eşleştirmesi kullanılır ve bulunan plan_line geri yazılır. |
| 9 | **ACTIVE → CONSUMED dönüşümü duplicate oluşturmaz.** `filter().update()` ile mevcut ACTIVE kayıt güncellenir, yeni kayıt oluşmaz. Eşleşen ACTIVE kayıt yoksa CONSUMED direkt yaratılır. |

---

## İlgili Sayfalar

- [[Production Planning|Üretim Planlaması]] — Plan onay ve ProductDayAvailability
- [[Recipes|Reçeteler]] — Reçete yapısı ve içerik çözümleme
- [[Prep|Hazırlık Görevleri]] — PrepTask tamamlama akışı
- [[Inventory Management|Stok Yönetimi]] — WarehouseStockLevel, StockReservation
- [[BaseModel]] — Soft delete / `is_active` davranışı
- [[Warehouse]] — Depo yönetimi ve WarehouseType

---

## 8. Changelog / Son Değişiklikler

| Tarih | Değişiklik | Detay |
|-------|-----------|-------|
| 2026-06 | **PrepTask.plan_line FK eklendi** | PrepTask'tan ProductionPlanLine'a direkt bağlantı (migration 0010) |
| 2026-06 | **plan_line per-line rezervasyon** | Artık her plan satırı için ayrı ACTIVE kaydı oluşur (plan_line=line) |
| 2026-06 | **BUGFIX: duplicate ACTIVE kaydı** | `update_or_create` → `filter().update()` ile değiştirildi. Artık ACTIVE kayıt CONSUMED'e çekilir, duplicate oluşmaz |
| 2026-06 | **BUGFIX: fiziksel stok düşümü eklendi** | `_deduct_stock_for_completed_task()` artık `deduct_stock()` çağırarak WarehouseStockLevel'ı düşürür ve StockMovement OUT kaydı oluşturur |
| 2026-06 | **Unused import temizliği** | `views.py`'dan kullanılmayan `get_production_reserved_quantity` import'ı kaldırıldı |
| 2026-06 | **Faz 1-5 tamamlandı** | ProductionReservation modeli, MRP entegrasyonu, POS kontrolü, rollback script, wiki dökümantasyonu |

---

## Referans Kod Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `backend/apps/inventory/models.py` | ProductionReservation modeli ve status tanımı |
| `backend/apps/inventory/selectors.py` | `get_production_reserved_quantity()`, `get_production_reserved_subquery()` |
| `backend/apps/inventory/services/pos_stock_check_service.py` | POS stok kontrolü (INGREDIENT modu) |
| `backend/apps/production_planning/views.py` | `_create_reservations_for_plan()` — plan onay rezervasyonu |
| `backend/apps/prep/services.py` | `_deduct_stock_for_completed_task()` — görev tamamlama stok düşümü |
| `backend/scripts/rollback_production_reservations.py` | Rollback scripti |
| `backend/config/settings.py` | Feature flag tanımı |
| `backend/apps/inventory/services/stock_movement_service.py` | `deduct_stock()` — fiziksel stok düşümü |
