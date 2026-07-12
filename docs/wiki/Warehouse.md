# Warehouse (Depo Yönetimi)

> **Özet:** Çok depolu envanter yönetimi. Satın alma siparişi, mal kabul, depolar arası transfer, stok sayımı, eksik listesi (deficiency report) ve SKT erken uyarı operasyon akışlarını içerir.
> **Kütüphaneler:** Django ORM, Django Channels
> **Bağlantılar:** [[Warehouse]], [[Inventory]], [[Branches]], [[Branch_Scope]], [[WebSocket_Architecture]], [[Frontend_Warehouse]], [[Kitchen_Closing]], [[Celery_Tasks]], [[Procurement_Intelligence]]

---

## Konum
`backend/apps/warehouse/`

## Modeller

### Warehouse
| Alan | Tip | Açıklama |
|------|-----|----------|
| `name/code` | `CharField` | Depo adı/kodu |
| `warehouse_type` | `TextChoices` | MAIN/SUB/COLD/DRY/RAW/KITCHEN |
| `branches` | `M2M → Branch` | Bağlı şubeler |
| `manager` | `FK → User` | Depo sorumlusu |
| `is_default` | `BooleanField` | Varsayılan depo |

### WarehouseStockLevel
Stok kalemi × depo bazlı miktar ve minimum takibi. `is_low_stock`: `quantity < minimum_quantity` (pozitif minimum; eşitlik dahil değil).

### PurchaseOrder + PurchaseOrderItem
Satın alma siparişi: DRAFT → PENDING → APPROVED → ORDERED → PARTIALLY_RECEIVED → RECEIVED / CANCELLED.

### GoodsReceiving + GoodsReceivingItem
Mal kabul belgesi: PENDING → INSPECTED → ACCEPTED / PARTIALLY_ACCEPTED / REJECTED.

### WarehouseTransfer + WarehouseTransferItem
Depolar arası transfer: DRAFT → PENDING → IN_TRANSIT → COMPLETED / CANCELLED.

### StockCounting + StockCountingItem
Stok sayımı: DRAFT → IN_PROGRESS → COMPLETED → APPROVED. Otomatik fark hesaplama.

### DeficiencyReport + DeficiencyReportItem
Mutfak istasyonlarından eksik listesi: PENDING → APPROVED → ORDERED → COMMITTED.

`DeficiencyReportTransferSerializer` içine `is_active` alanı eklendi. `DeficiencyReportSerializer`, ilgili transfer ve satın alma siparişlerini **aktif** olanlarla filtreler (`is_active=True`). `DeficiencyReportService.delete_report()`, raporu silmeden önce aktif bağlı varlıkları kontrol eder. `DeficiencyReportViewSet`, aktif varlıklar için optimize prefetch kullanır.

#### Otomatik Eksik Listesi Oluşturma
Eksik listesi **Celery'ye bağlı değildir**. Üç farklı yol vardır:

| Yol | Tetikleyici | Celery? |
|-----|-------------|---------|
| Manuel (KDS/depo formu) | `POST /warehouse/deficiency-reports/` | Hayır |
| Sipariş sonrası senkron | `commit_reservations` veya `deduct_for_order` → `_batch_check_low_stock_alerts` | Hayır |
| Gece periyodik tarama | `scan_kitchen_low_stock_deficiencies` Celery görevi (`BEAT_SCAN_KITCHEN_LOW_STOCK_*`, vars. 04:00) | **Evet** |

Otomatik oluşturma önkoşulları:
- Depo tipi **KITCHEN** olmalı
- Depoya bağlı aktif bir `KitchenStation` bulunmalı
- `WarehouseStockLevel.minimum_quantity > 0` ve `quantity < minimum_quantity` (eşitlik kritik sayılmaz)
- Son 24 saatte aynı kalem için açık DRAFT/PENDING rapor olmamalı

Sipariş tamamlanırken `stock_tracking_mode = "INGREDIENT"` ise stok düşümü `commit_reservations` üzerinden gerçekleşir; bu yol da `_batch_check_low_stock_alerts`'i çağırır. Bildirimler `ws_broadcast.schedule_deficiency_created` ile WebSocket üzerinden gönderilir — Channels/Daphne kapalıysa bildirim gelmez fakat rapor DB'de yine oluşur.

## Services (Alt Klasör)
| Dosya | İşlev |
|-------|-------|
| `warehouse_service.py` | Depo CRUD |
| `purchase_order_service.py` | Satın alma akışı |
| `goods_receiving_service.py` | Mal kabul akışı |
| `transfer_service.py` | Transfer akışı |
| `stock_counting_service.py` | Sayım akışı; onay sonrası hareket notlarında `format_quantity_display` — bkz. [[Core_Utilities]] |
| `fulfillment_service.py` | Eksik listesi karşılama |
| `deficiency_report_service.py` | Eksik listesi yaşam döngüsü (oluşturma, onay, iptal, transfer/PO) |
| `purchase_recommendation_service.py` | Talep bazlı satın alma öneri motoru (tüketim trendi + stok + yoldaki PO + ufuk günü) |
| `procurement_alert_selectors.py` | Geciken PO ve tedarikçi teslimat uyarıları (salt okuma) |

Mal kabul tamamlandığında (`complete_receiving`) kabul satırındaki `batch_number` ve `expiry_date` değerleri `InventoryService.receive_stock()` üzerinden `StockLot` kaydına yazılır — SKT listesinin doğru dolması için zorunludur. Bkz. [[Inventory]] (EPIC-04).

`GoodsReceivingService`: kabul miktarı (`accepted_quantity`) hesaplama ve kısmi kabul/ret senaryolarında stok güncellemesi iyileştirildi. Aktif stok kalemlerini filtreleyen depo selektör güncellemesi ile `WarehouseStockLevel` sorgularında pasif kalemler hariç tutulur.

### SKT Erken Uyarı (EPIC-04)

Operasyonel SKT ekranı **depo modülündedir** (`[[Frontend_Warehouse]]` — sekme `expiring_lots`). Backend API ve modeller `inventory` uygulamasında; UI tek giriş noktası depo sekmesidir. Envanter modülünde yalnızca **SKT Risk** özet widget'ı vardır (depo SKT sekmesine yönlendirir). Bkz. [[Frontend_Inventory]].

**MVP kapsamı:**
- N gün içinde dolacak lot listesi (varsayılan 3 / 7 gün)
- Lot bazlı aksiyon: öncelikli tüketim, transfer önerisi, plan revizyon notu
- Aksiyon geçmişi paneli + audit kaydı

**Frontend:** `ExpiringLotsTab`, `ExpiringLotsTable` (sanallaştırma + infinite scroll), `ExpiryRiskWidget` (özet sekmesi), `ExpiryActionDialog`

**Yetki:** `inventory.view_expiry_risk` (liste/özet), `inventory.manage_expiry_action` (aksiyon commit)

**URL:** `/warehouse?tab=expiring_lots`

Detaylı API ve model notları: [[Inventory]] (SKT Erken Uyarı bölümü).

### Satın Alma Önerileri (EPIC-01)

Minimum stok `-1` (sınırsız) olan kalemler **dahil edilmez** — stok izlenmiyor kabul edilir.

**Formül (ufuk günü ile):**
- `haftalık_ort = OUT+WASTE tüketim / hafta_sayısı`
- `günlük_ort = haftalık_ort / 7`
- `hedef = günlük_ort × horizon_days × güvenlik_çarpanı` (şube `ProductionDaySettings.default_safety_factor`)
- `önerilen = max(hedef − mevcut − yoldaki, minimum_gap)`

**Ek çıktı:** `estimated_days_until_stockout`, `urgency` (`critical` | `warning` | `ok`)

**API:**
- `GET /api/v1/warehouse/purchase-recommendations/?warehouse_id=&weeks=4|8&horizon_days=3|7|14`
- `POST /api/v1/warehouse/purchase-recommendations/commit/`

**Yetki:** `warehouse.view_purchase_recommendation`, `warehouse.commit_purchase_recommendation`

Mevcut PO sekmesindeki minimum-stok `suggest-preview` / `suggest` akışı **ayrı kalır** (anlık minimum eşiği; tüketim geçmişi yok). Karşılaştırma: [[Procurement_Intelligence#Otomatik Öner vs Satın Alma Önerileri]].

### Akıllı Satın Alma — Geciken PO uyarıları

`expected_date < bugün` ve durum `ORDERED` / `PARTIALLY_RECEIVED` olan siparişler.

**API:**
- `GET /api/v1/warehouse/procurement-alerts/?branch_id=&warehouse_id=&supplier_id=`
- `GET /api/v1/warehouse/purchase-orders/?overdue=true`
- Depo özeti: `GET .../warehouses/summary/` → `overdue_orders`

**Kaynak:** `procurement_alert_selectors.py`, `ProcurementAlertViewSet`

**Yetki:** `warehouse.view_purchase_order`

**Gece görevi:** `scan_overdue_purchase_orders_daily` — `BEAT_SCAN_OVERDUE_PO_*` (vars. 05:00). Bkz. [[Celery_Tasks]], [[Procurement_Intelligence]].

## WebSocket

**Rota:** `/ws/warehouse/notifications/` — `apps/warehouse/ws_broadcast.py`

- Eksik listesi oluşturma / stok eşiği uyarıları
- KDS tarafında `deficiency_status_changed` ile tam liste invalidation
- **Geciken PO:** `procurement.overdue_alert` → istemcide `procurement_overdue_alert` (özet + PO listesi invalidation)

Bkz: [[WebSocket_Architecture]], [[Frontend_Warehouse]], [[Procurement_Intelligence]].
