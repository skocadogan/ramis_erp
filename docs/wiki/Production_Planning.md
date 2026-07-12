# Production Planning (Üretim Planlama)

> **Özet:** Şube ve tarih bazlı günlük üretim planları. Ürün kalmadı (86) listesi, POS engelleme modu, MRP malzeme ihtiyaç analizi, FEFO bazlı yaklaşık maliyet hesabı ve tahmin bazlı güvenlik çarpanı ile satış/üretim uyumunu sağlar.
> **Kütüphaneler:** Django ORM, Django Channels
> **Bağlantılar:** [[Menu]], [[Branches]], [[Orders]], [[Recipes]], [[Inventory]], [[Reporting]], [[WebSocket_Architecture]]

---

## Konum
`backend/apps/production_planning/`

## Modeller

### ProductionPlan
| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch` | `FK → Branch` | Şube |
| `plan_date` | `DateField` | Plan tarihi |
| `status` | `TextChoices` | DRAFT / APPROVED / LOCKED |
| `created_by/approved_by` | `FK → User` | Oluşturan/onaylayan |

Unique: `(branch, plan_date)` + `is_active=True`.

### ProductionPlanLine
| Alan | Tip | Açıklama |
|------|-----|----------|
| `product` | `FK → Product` | Ürün |
| `target_quantity` | `DecimalField` | Hedef porsiyon |
| `station` | `FK → KitchenStation` | İstasyon |
| `source` | `TextChoices` | MANUAL / FORECAST / IMPORT |

### ProductionDaySettings
Şube bazlı ayarlar.

| Alan | Açıklama |
|------|----------|
| `default_safety_factor` | Güvenlik çarpanı (ör: 1.10 = %10 tolerans) |
| `pos_block_mode` | OFF / WARN / BLOCK |
| `allow_negative_plan_variance` | Negatif fark izni |

### ProductDayAvailability (86 Listesi)
| Alan | Tip | Açıklama |
|------|-----|----------|
| `product` | `FK → Product` | Ürün |
| `effective_date` | `DateField` | Geçerlilik tarihi |
| `mode` | `TextChoices` | AVAILABLE / LIMITED / SOLD_OUT |
| `remaining_portions` | `DecimalField` | Kalan porsiyon (LIMITED için) |

### Gece otomatik temizlik (86)
- **Beat görevi:** `purge-expired-86-nightly` → `apps.production_planning.tasks.purge_expired_product_day_availability`
- **Env:** `BEAT_PURGE_EXPIRED_86_ENABLED` (varsayılan kapalı), `BEAT_PURGE_EXPIRED_86_HOUR/MINUTE` (varsayılan 5:00)
- **Davranış:** Bugün hariç geçmiş `effective_date` değerine sahip aktif kayıtlar soft-delete (`is_active=False`); audit eylemleri: `production_planning.availability.auto_purged`, `production_planning.availability.purge_expired_completed`, kapalıysa `production_planning.availability.purge_expired_skipped`. Temizlenecek kayıt olmasa bile çalışma sonucu audit'e yazılır.
- **Plan koruması:** Kullanıcı API'si onaylı üretim planı olan günlerde 86 kaydı silmeyi engeller. Gece bakım görevi geçmiş tarihli kayıtları POS kararlarında kullanılmadığı için sistem temizliği olarak soft-delete eder; planı silmez ve audit metadata içinde bypass bilgisini yazar.
- **Yapılandırma:** Ramis Ayar Yöneticisi → Zamanlanmış görevler sekmesi; bkz. [[Celery_Tasks#purge_expired_product_day_availability]]

## WebSocket
Plan değişiklikleri ve 86 listesi güncellemeleri anlık olarak POS'a iletilir.

## Servisler

| Servis | Dosya | Açıklama |
|--------|-------|----------|
| MRP | `services/mrp_service.py` | Reçete genişletme ile malzeme ihtiyaç / stok açığı |
| Yaklaşık maliyet | `services/approximate_cost_service.py` | Plan satırları için FEFO lot birim fiyatı × porsiyon maliyeti |
| Tahmin | `services/forecast_service.py` | Geçmiş satıştan hedef porsiyon |
| 86 / POS | `services/availability_service.py`, `pos_integration.py` | Ürün kalmadı ve sepet kontrolü |
| Kopyalama | `services/plan_copy.py` | Aynı şubede güne kopyalama |

### Yaklaşık Maliyet (FEFO)

- **API:** `GET /production-planning/plans/{id}/approximate-cost/` — `station_id`, `page`, `page_size` query parametreleri.
- **ViewSet action:** `approximate_cost` (`ProductionPlanViewSet`); izin: `production_planning.view_plan` veya `manage_plan`.
- **Hesap akışı:**
  1. Şube mutfak deposu (`WarehouseType.KITCHEN`) çözülür.
  2. Her plan satırı için reçete porsiyon maliyeti: `compute_fefo_cost_per_serving` (FEFO lot birim fiyat × normalize miktar / porsiyon).
  3. Satır toplamı: `unit_cost × target_quantity`.
  4. **Hammadde kırılımı:** `expand_fefo_ingredients_for_line` — [[Recipes]] `build_stock_requirements_from_recipe` ile alt reçeteler stok kalemlerine düzleştirilir; her kalemde [[Inventory]] `get_fefo_unit_price` uygulanır.
- **Yanıt (satır başına):** `line_id`, `product_name`, `station_name`, `quantity`, `unit_cost`, `line_total`, `has_recipe`, `ingredients[]` (`stock_item_id`, `stock_item_name`, `unit`, `quantity`, `unit_cost`, `line_total`).
- **Sayfalama:** `items` sayfalanır; `grand_total` tüm satırlar üzerinden tek seferde hesaplanır.
- **Rapor:** [[Reporting]] modül raporu `production-plan-approximate-cost` — PDF ve Excel'de ürün altında hammadde satırları.

#### Yardımcı fonksiyonlar (`approximate_cost_service.py`)

| Fonksiyon | Açıklama |
|-----------|----------|
| `compute_fefo_recipe_total_cost` | Reçete toplam FEFO maliyeti (stok + alt reçete özyinelemeli) |
| `compute_fefo_cost_per_serving` | Porsiyon başı FEFO maliyet |
| `expand_fefo_ingredients_for_line` | Üretim miktarı için düzleştirilmiş hammadde listesi + FEFO |
| `calculate_approximate_cost_for_plan` | Plan bazlı API/rapor giriş noktası |

#### Testler

`tests/test_services.py` — `test_calculate_approximate_cost_with_fefo_lots` (ingredients doğrulaması), reçetesiz ürün, sayfalama.

### MRP

- **API:** `GET /production-planning/plans/{id}/mrp/`
- **Rapor:** `production-plan-mrp`

## Raporlar

`reports.py` → [[Reporting]] registry:

| Slug | Açıklama |
|------|----------|
| `production-plan-mrp` | Malzeme ihtiyaç planlaması PDF |
| `production-plan-approximate-cost` | FEFO yaklaşık maliyet PDF + Excel (ürün + hammadde alt satırları) |
