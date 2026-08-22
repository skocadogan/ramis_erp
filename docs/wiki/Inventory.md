# Inventory (Stok Yönetimi)

> **Özet:** Ham madde ve stok kalemi yönetimi. Kategoriler, birimler, stok hareketleri, tedarikçiler, lot/parti takibi (FEFO), toplu stok girişi (draft/post), sipariş bazlı stok rezervasyonu, SKT aksiyon otomasyonu, tedarikçi performans raporları ve iade/imha akışı (ReturnDisposalFlow) mekanizmalarını içerir.
> **Kütüphaneler:** Django ORM, Celery
> **Bağlantılar:** [[Warehouse]], [[Recipes]], [[Orders]], [[Branches]], [[Celery_Tasks]], [[Frontend_Inventory]], [[Frontend_Warehouse]], [[Allergens]], [[RBAC]], [[Stock_Return_Cancel]], [[Reporting]], [[Menu_Engineering]], [[Procurement_Intelligence]]

---

## Konum
`backend/apps/inventory/`

## Modeller

### StockCategory
Hiyerarşik stok kategorileri (parent FK → self).

### StockUnit
Birim tanımları — çarpan bazlı dönüşüm.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `name` | `CharField` | Birim adı |
| `short_name` | `CharField` | Kısa ad (kg, g, lt) |
| `multiplier` | `DecimalField(12,6)` | Dönüşüm çarpanı |
| `category` | `TextChoices` | WEIGHT / VOLUME / COUNT / OTHER |

### StockItem
| Alan | Tip | Açıklama |
|------|-----|----------|
| `name` | `CharField` | Stok adı |
| `sku` | `CharField(unique)` | Stok kodu |
| `barcode` | `CharField` | Barkod |
| `unit` | `CharField` | Temel birim (short_name) |
| `minimum_quantity` | `DecimalField` | Minimum stok (-1 = sınırsız) |
| `last_purchase_price` | `DecimalField` | Son alış fiyatı |
| `average_cost` | `DecimalField` | Ağırlıklı ortalama maliyet |
| `category` | `FK → StockCategory` | Kategori |
| `allergens` | `M2M → Allergen` | Allerjen maddeleri ([[Allergens]]) |

### Allergen
Referans allerjen kataloğu. `code`, `name`, `prevalence_pct`, `risk_score`, `sort_order`. Seed: `seed_allergens`, `seed_full`.

### StockLot
Parti/lot bazlı FEFO (First-Expired-First-Out) takibi.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `stock_item` | `FK → StockItem` | Stok kalemi |
| `warehouse` | `FK → Warehouse` | Depo |
| `lot_number` | `CharField` | Parti numarası |
| `expiry_date` | `DateField` | SKT |
| `quantity` | `DecimalField` | Kalan miktar |
| `initial_quantity` | `DecimalField` | Başlangıç miktarı |
| `unit_price` | `DecimalField` | Parti birim fiyatı (mal kabul / transfer kaynağı) |

### StockMovementLot
Stok çıkış hareketinin hangi lot(lar)dan tüketildiğini kaydeder (FEFO maliyet izi).

| Alan | Tip | Açıklama |
|------|-----|----------|
| `movement` | `FK → StockMovement` | İlgili hareket |
| `stock_lot` | `FK → StockLot` (null) | Tüketilen parti; SET_NULL |
| `quantity` | `DecimalField` | Tüketilen miktar |
| `unit_price` | `DecimalField` | Tüketim anı snapshot fiyatı |
| `lot_number` / `expiry_date` | snapshot | Geri alma ve rapor için |

**FEFO maliyet fonksiyonları** (`inventory/fefo_cost.py`):

| Fonksiyon | Kullanım |
|-----------|----------|
| `get_fefo_unit_price` | Kalan lotların **ağırlıklı ortalama** fiyatı — envanter raporu (`fefo-report`) |
| `get_next_fefo_unit_price` | Sırada tüketilecek ilk lotun fiyatı (teşhis) |
| `estimate_fefo_consumption_unit_price` | Belirli miktar için FEFO simülasyon maliyeti — [[Production_Planning]] yaklaşık maliyet |

**Çıkış maliyeti:** `deduct_stock` lotları FEFO ile düşer, `StockMovementLot` satırları yazar. `FEFO_COSTING_ENABLED=True` iken `StockMovement.unit_price` tüketilen lotların ağırlıklı fiyatıdır; kapalıyken lot satırları yine yazılır, `unit_price` eski fallback (`last_purchase_price` / `average_cost`) kalır.

**Transfer:** `receive_stock_lots` — kaynak depodan tüketilen her parti ayrı lot olarak hedef depoya girer (fiyat snapshot ile).

**Ayar:** `FEFO_COSTING_ENABLED` (varsayılan `False`) — bkz. [[Backend_Environment]].

### StockMovement
| Alan | Tip | Açıklama |
|------|-----|----------|
| `movement_type` | `TextChoices` | IN / OUT / ADJUSTMENT / WASTE / TRANSFER / RETURN / CANCEL / DISPOSAL |
| `quantity` | `DecimalField` | Miktar |
| `warehouse` | `FK → Warehouse` | Depo |
| `supplier` | `FK → Supplier` | Tedarikçi |
| `unit_price` | `DecimalField` | Birim fiyat |

### Supplier
Tedarikçi bilgisi — `stock_items` M2M ile stok kalemleri bağlantısı.

#### Tedarikçi Raporları ve Performans Endpoint'leri
`SupplierViewSet` üzerinde 3 yeni endpoint:

| Endpoint | Yetki | Açıklama |
|----------|-------|----------|
| `GET /api/v1/suppliers/{id}/performance/` | `inventory.view_supplier` | Kabul/red oranı, ortalama teslimat süresi, zamanında teslim oranı (DB aggregate) |
| `GET /api/v1/suppliers/{id}/rejected_items/` | `inventory.view_supplier` | Reddedilmiş `GoodsReceivingItem` kayıtları (`start_date`, `end_date`, `search` filtreli) |
| `GET /api/v1/suppliers/{id}/goods_receivings/` | `inventory.view_supplier` | Mal kabul kayıtları (kabul/red edilen kalem sayıları ile) |

**Gecikmiş açık PO (UI):** Envanter tedarikçi performans modalı `warehouseApi.getProcurementAlerts` ile `supplier_id` filtreli geciken sipariş listesini gösterir — bkz. [[Frontend_Inventory#Tedarikçi performans modalı]], [[Procurement_Intelligence]].

**Rapor sınıfları:** `SupplierRejectedItemsReport` (slug: `supplier-rejected-items`), `SupplierGoodsReceivingReport` (slug: `supplier-goods-receiving`) — `reports/inventory_reports.py`.

### ReturnDisposalFlow (İade/İmha Akışı)
İade ve imha işlemleri için durum makinesi. **Migration 0022**.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `flow_type` | `TextChoices` | `RETURN_TO_SUPPLIER` / `CUSTOMER_RETURN` / `DISPOSAL` / `END_OF_DAY_SURPLUS` |
| `status` | `TextChoices` | `DRAFT` → `APPROVED` → `COMPLETED` / `CANCELLED` |
| `supplier` / `branch` | FK | Tedarikçi (RETURN_TO_SUPPLIER) / Şube |
| `reference_order` / `reference_sale` | FK | İlgili sipariş (CUSTOMER_RETURN) / satış |

**ReturnDisposalFlowItem:** Her kalem — `stock_item`, `quantity`, `reason_code`, `notes`; fiziksel kontrol alanları (`is_packaging_intact`, `checked_by`, `checked_at`).

**API (`ReturnDisposalFlowViewSet`):**
| Endpoint | Açıklama |
|----------|----------|
| `GET/POST /api/v1/return-disposal-flows/` | Liste / oluştur |
| `POST {id}/approve/` | Onayla |
| `POST {id}/complete/` | Tamamla → stok hareketi oluşturur |
| `POST {id}/cancel/` | İptal et |

`StockItem.is_returnable` alanı (mig 0022) — fiziksel iade edilebilirlik bayrağı.

### StockReceiptDraft / StockReceiptDraftLine
İki kademeli toplu stok girişi: DRAFT → POSTED.

### StockReservation
Sipariş bazlı stok rezervasyonu: RESERVED → COMMITTED / RELEASED.

### OrderItemIngredientCost
Sipariş commit anında ingredient bazlı maliyet snapshot ledger'ı.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `order_item` | `FK → orders.OrderItem` | Maliyetin ait olduğu sipariş kalemi |
| `product` | `FK → menu.Product` | Raporlamadaki ürün anahtarı |
| `branch` | `FK → branches.Branch` | Şube snapshot'ı |
| `stock_item` | `FK → StockItem` | Tüketilen hammadde |
| `warehouse` | `FK → Warehouse` | Tüketimin düştüğü depo |
| `movement` | `FK → StockMovement (null)` | İlgili stok çıkış hareketi |
| `quantity` | `DecimalField` | Ingredient miktarı snapshot'ı |
| `unit_cost_snapshot` | `DecimalField` | Commit anındaki birim maliyet |
| `line_cost_snapshot` | `DecimalField` | Satır toplam maliyeti |
| `committed_at` | `DateTimeField` | Commit zamanı |

#### INGREDIENT modu yaşam döngüsü ([[Orders]] / POS)

| Aşama | Ne olur | Depo seçimi |
|--------|---------|-------------|
| Sipariş oluşturma (`stock_tracking_mode=INGREDIENT`) | `StockReservation` **RESERVED**; fiziksel miktar henüz düşmez | Öncelik: `OrderItem.station` → istasyonun `warehouse` snapshot'ı; kombine menüde alt ürünler kendi kategori istasyonu deposu; yoksa şube `KITCHEN` veya varsayılan depo |
| Ödeme (`complete_order` / `complete_table`) | `commit_reservations` → `StockMovement` OUT, rezerv **COMMITTED**, `OrderItemIngredientCost` ledger satırları yazılır | Rezervdeki depo ile aynı |
| İptal | `release_reservations` → **RELEASED** | — |

**Önemli:** POS ürün kartındaki “rezerve / tükendi” (`is_reserved_out`) tüm açık RESERVED toplamına göre hesaplanır; yalnızca o siparişin rezervi anlamına gelmeyebilir. Gerçek kayıt: `StockReservation` tablosu.

**Teşhis:** `python manage.py diagnose_order_stock <sipariş_uuid>` — mod, rezerv, hareket ve depo uyumu raporu.

**Masa ödemesi tuzağı (düzeltildi):** `complete_table` içinde siparişte önceden `Sale` varken yalnızca durum güncellenip `commit_reservations` atlanabiliyordu; artık RESERVED rezerv varsa commit yapılır.

**İdempotency notu:** `commit_reservations`, aynı sipariş için RESERVED rezerv kalmadıysa ama COMMITTED rezerv / ledger kaydı varsa tekrar stok düşmez; çift maliyet ve çift hareket yazımı engellenir. RESERVED satırlar `select_for_update(nowait=True)` ile kilitlenir (çift complete yarışında ikinci istek bekler veya [[API_Responses]] `ROW_LOCKED`).

**Ayarlar:** `STOCK_RESERVATION_ENABLED` (rezervasyonu kapatır), `INGREDIENT_STOCK_STRICT_RESERVE` (rezerv oluşmazsa siparişi reddeder, varsayılan kapalı).

### ExpiryAction (EPIC-04)
Lot bazlı SKT operasyon aksiyon kaydı.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `stock_lot` | `FK → StockLot` | İlgili parti |
| `action_type` | `TextChoices` | `PRIORITY_CONSUME` / `TRANSFER_SUGGEST` / `PLAN_NOTE` |
| `notes` | `TextField` | Operasyon notu |
| `created_by` | `FK → User` | Kaydı oluşturan |
| `branch` | `FK → Branch` | Şube (opsiyonel) |
| `automation_applied` | `BooleanField` | Otomasyon uygulandı mı? (mig 0027) |
| `result_json` | `JSONField` | Otomasyon sonucu (mig 0027) |

**StockLot yeni alanlar (mig 0027):**
| Alan | Tip | Açıklama |
|------|-----|----------|
| `fefo_priority_boost` | `PositiveIntegerField` | FEFO sıralamada öne geçme değeri (`PRIORITY_CONSUME` aksiyonu) |
| `fefo_priority_until` | `DateTimeField` | Boost geçerlilik süresi |

## Services (SKT — EPIC-04)

| Dosya | İşlev |
|-------|-------|
| `selectors.py` → `get_expiring_lots_qs`, `get_expired_lots_qs`, `compute_expiry_summary` | SKT lot sorguları ve widget sayaçları |
| `services/expiry_service.py` | `ExpiryTrackingService` — selector delegasyonu |
| `services/expiry_action_service.py` | `ExpiryActionService` — aksiyon kaydı + audit |
| `expiry_warning_view.py` | `ExpiryWarningViewSet` — REST API |

## Celery Görevleri
| Görev | Zamanlama | İşlev |
|-------|-----------|-------|
| `cleanup_expired_reservations` | `BEAT_CLEANUP_RESERVATIONS_*` (vars. 03:00) | Süresi dolmuş stok rezervasyonlarını serbest bırakır |
| `scan_expiring_lots_daily` | `BEAT_SCAN_EXPIRING_LOTS_*` (vars. 04:30) | SKT risk lot taraması |
| `cleanup_negative_lots` | `BEAT_CLEANUP_NEGATIVE_LOTS_*` (vars. 03:00) + `NEGATIVE_LOT_CLEANUP_ENABLED` | Negatif stok lotlarını pozitif lotlarla konsolide eder (varsayılan açık) |

`tasks.py` — ayrıntılar için [[Celery_Tasks]].

### Alış fiyatı artışı takibi

**Selector:** `price_trend_selectors.py` — son iki IN (`StockMovement`) `unit_price` karşılaştırması.

| Endpoint | Yetki | Açıklama |
|----------|-------|----------|
| `GET /api/v1/inventory/stock-items/price-increases/` | `inventory.view_stock_item` | Eşik üstü artışlar (`min_change_pct`, `lookback_days`, `branch_id`, `category_id`) |

**UI:** [[Frontend_Warehouse]] — sekme `price_increases`. Bkz. [[Procurement_Intelligence#3. Fiyat artışı takibi]].

### SKT Erken Uyarı (EPIC-04)

Backend `inventory` uygulamasında; **operasyonel UI** depo modülünde (`[[Frontend_Warehouse]]` — `expiring_lots` sekmesi). Envanter modülünde ayrı SKT sekmesi yok; yalnızca özet widget ile depoya yönlendirme vardır (`[[Frontend_Inventory]]`).

**API (`ExpiryWarningViewSet`):**

| Endpoint | Yetki | Açıklama |
|----------|-------|----------|
| `GET /api/v1/inventory/expiry-warnings/` | `inventory.view_expiry_risk` | Sayfalı lot listesi (`days_ahead=3\|7`, `warehouse_id`) |
| `GET .../summary/` | `inventory.view_expiry_risk` | Widget sayaçları (`within_3_days`, `within_7_days`, `expired`) |
| `POST .../actions/` | `inventory.manage_expiry_action` | Aksiyon kaydı |
| `GET .../actions/history/` | `inventory.view_expiry_risk` | Aksiyon geçmişi |

**Legacy (geriye uyumluluk):** `GET /api/v1/inventory/stock-items/expiring_lots/` — RBAC: `inventory.view_expiry_risk` veya `inventory.view_stock_item`.

**Audit:** `inventory.expiry_action.<action_type>` (ör. `inventory.expiry_action.priority_consume`)

**Branch / depo scope:** `user_accessible_warehouse_id_strings` — bkz. [[Branch_Scope]].

**Phase-2 (EPIC-04 otomasyon):** `EXPIRY_ACTION_AUTOMATION_ENABLED` flag arkasında preview/execute akışı.

| Aksiyon | Otomasyon (flag açık) |
|---------|------------------------|
| `PRIORITY_CONSUME` | `StockLot.fefo_priority_boost` + aktif `PrepTask.priority` artışı |
| `TRANSFER_SUGGEST` | `DRAFT` `WarehouseTransfer` + depo WebSocket (`expiry.transfer_draft_created`) |
| `PLAN_NOTE` | Bugünkü `ProductionPlan.notes` append (LOCKED planda red) |

**Risk skoru:** Liste API'sinde `risk_score` (0–100); flag gerekmez.

**API (Phase-2):**

| Endpoint | Açıklama |
|----------|----------|
| `POST .../actions/preview/` | Otomasyon önizlemesi |
| `POST .../actions/execute/` | Otomasyon uygulama (flag kapalıysa Phase-1 kayıt) |
| `GET .../action-types/` | `{ automation_enabled, types[] }` |

**Servisler:** `expiry_risk.py`, `services/expiry_automation_service.py`, `services/expiry_handlers/*`

**Ayarlar:** `EXPIRY_ACTION_AUTOMATION_ENABLED`, `EXPIRY_FEFO_BOOST_*`, `EXPIRY_PREP_PRIORITY_DELTA`, `EXPIRY_TRANSFER_IDEMPOTENCY_HOURS` — bkz. [[Backend_Environment]].

## Settings
```python
STOCK_RESERVATION_ENABLED = True
STOCK_RESERVATION_EXPIRY_HOURS = 24
INGREDIENT_STOCK_STRICT_RESERVE = False  # True: INGREDIENT siparişte rezerv zorunlu
EXPIRY_WARNING_DAYS_DEFAULT = 3
EXPIRY_WARNING_DAYS_OPTIONS = [3, 7]
```

## Düşük / kritik stok eşiği

Merkezi kural: `backend/apps/inventory/stock_minimum.py` (backend ORM filtreleri, serializer `is_low_stock`, POS kritik uyarıları ve otomatik eksik listesi aynı mantığı kullanır).

| Koşul | Davranış |
|-------|----------|
| `minimum_quantity = -1` | Sınırsız — kritik/düşük stok ve otomatik eksik taraması **uygulanmaz** |
| `minimum_quantity = 0` | Eşik yok (pozitif minimum gerekir) |
| Pozitif minimum | **Düşük/kritik:** `quantity < minimum_quantity` — **eşitlik dahil değil** (kalan = minimum iken kritik sayılmaz) |

**Yardımcılar:** `has_positive_minimum_threshold`, `is_quantity_below_minimum`, `q_low_stock_warehouse_level`, `q_low_stock_vs_effective_minimum`.

**Depo seviyesi:** `WarehouseStockLevel.is_low_stock` — bkz. [[Warehouse]] (eksik listesi, `scan_kitchen_low_stock_deficiencies`).

**Frontend ayna:** `frontend/src/lib/stockMinimum.ts` — envanter toplu sipariş ve KDS çekmecesi API `is_low_stock` alanını kullanır; tablo rozeti `atThreshold` (kalan = min) bilgi amaçlıdır, `is_low_stock` değildir — bkz. [[Frontend_Inventory]], [[Frontend_KDS]].

**Test:** `apps/inventory/tests/test_stock_minimum.py`

## Services (sipariş stoku)

| Dosya | İşlev |
|-------|-------|
| `services/kitchen_service.py` | `KitchenClosingService` — gün sonu mutfak sayımı, fire kaydı — bkz. [[Kitchen_Closing]] |
| `services/cart_recipe_requirements.py` | Sepet/sipariş reçete ihtiyacı; istasyon deposu + kombine ürün |
| `services/stock_reservation_service.py` | `reserve_for_order`, `commit_reservations`, `release_reservations` |
| `services/order_deduction_service.py` | Rezerv yoksa `deduct_for_order` yedek yolu |
| `management/commands/diagnose_order_stock.py` | Sipariş bazlı teşhis CLI |

## Stok Kalemi Silme

`StockItemService.delete_stock_item()` — aktif rezervasyon veya bekleyen hareket olmadığını doğrulayarak stok kalemini siler.

- **ViewSet:** `StockItemViewSet.perform_destroy()` → `StockItemService.delete_stock_item()`
- **Frontend:** `useInventoryActions.deleteStockItem`, `DeleteStockItemModal` onay modalı
- **API:** `DELETE /api/v1/inventory/stock-items/{id}/`
- **RBAC:** `inventory.manage_stock_item`
- **Test:** `apps/inventory/tests/test_stock_item_delete.py`

## Serializer: recipe_usage_count

`StockItemSerializer` ve `StockItemWithWarehouseSerializer`, stok kaleminin kaç reçetede kullanıldığını döner.

```python
recipe_usage_count = serializers.SerializerMethodField(read_only=True)
```

Silme onay modalında kullanılır — kaleme bağlı reçete varsa kullanıcı uyarılır.

## SKT Otomatik İade / İptal (EPIC-04)

`ExpiryWarningViewSet` üzerinde `auto_return_cancel` aksiyonu ile SKT geçmiş lotlar için otomatik RETURN veya CANCEL stok hareketi oluşturulabilir.

| Unsur | Detay |
|-------|-------|
| Endpoint | `POST /api/v1/inventory/expiry-warnings/{id}/auto-return-cancel/` |
| RBAC | `inventory.manage_expiry_action` |
| Servis | `services/expiry_return_cancel_service.py` — `ExpiryReturnCancelService` |
| Serializer | `ExpiryAutoReturnCancelSerializer` (`movement_type`: RETURN/CANCEL, `supplier`, `reason`) |
| Frontend | `ExpiringLotsTab` — her lot satırında aksiyon butonu; `useWarehouseActions.autoReturnCancel` |

Oluşturulan hareket [[Stock_Return_Cancel]] modülüne yazılır ve lot miktarını düşürür.
