# Frontend Warehouse

> **Özet:** Depo tanımları, satın alma, mal kabul, transfer, sayım, eksik listesi ve SKT erken uyarı operasyon ekranları. Modül içi dikey/yatay nav + ana `AppSidebar` birlikte kullanılır.
> **Kütüphaneler:** React, TanStack Query, TanStack Virtual, WebSocket
> **Bağlantılar:** [[Warehouse]], [[Inventory]], [[Frontend_Architecture]], [[RBAC]], [[Frontend_Inventory]], [[Procurement_Intelligence]]

---

## Konum

- **Sayfa:** `frontend/src/app/warehouse/page.tsx`
- **Feature:** `frontend/src/features/warehouse/`

## Navigasyon

Depo modülü **kendi sekme navigasyonunu** kullanır (`WarehouseModuleNav`):

| Sekme key | Açıklama |
|-----------|----------|
| `summary` | Özet KPI kartları + SKT Risk widget |
| `deficiency_reports` | Eksik listeleri |
| `purchase_recommendations` | Satın alma önerileri (EPIC-01 + ufuk günü) |
| `purchase_orders` | Satın alma siparişleri (geciken PO banner + filtre) |
| `price_increases` | Alış fiyatı artışları (son iki IN karşılaştırması) |
| `goods_receiving` | Mal kabul |
| `warehouses` | Depo tanımları |
| `transfers` | Depolar arası transfer |
| `stock_counting` | Stok sayımı |
| `expiring_lots` | **SKT Takibi** (EPIC-04) |
| `kitchen_closing` | Gün sonu mutfak kapanışı — bkz. [[Kitchen_Closing]] |
| `waste_reports` | Fire raporları |
| `return_cancel_reports` | **İptaller ve İadeler** — [[Stock_Return_Cancel]] |

**Doğrudan URL:** `/warehouse?tab=expiring_lots`

RBAC ile gizlenen sekmeler:
- `purchase_recommendations` → `warehouse.view_purchase_recommendation`
- `price_increases` → `inventory.view_stock_item`
- `expiring_lots` → `inventory.view_expiry_risk`

## SKT Erken Uyarı (EPIC-04)

**Tek operasyonel giriş noktası** — envanter modülünde ayrı SKT sekmesi yoktur.

### Bileşenler

| Bileşen | Dosya | Rol |
|---------|-------|-----|
| `ExpiringLotsTab` | `components/ExpiringLotsTab.tsx` | Ana sekme: filtreler, tablo, geçmiş paneli |
| `ExpiringLotsTable` | `components/ExpiringLotsTable.tsx` | Sanallaştırılmış tablo + infinite scroll |
| `ExpiryRiskWidget` | `components/ExpiryRiskWidget.tsx` | Özet sekmesinde 3/7 gün risk sayacı |
| `ExpiryActionDialog` | `components/ExpiryActionDialog.tsx` | Aksiyon onay + not (Dialog; alert değil) |

### Hooks / API

- `useExpiryWarnings` — `useInfiniteQuery` → `inventoryApi.getExpiryWarnings`
- `useExpirySummary` — widget sayaçları
- `useExpiryActionHistory` — sağ panel geçmişi
- `useCommitExpiryAction` — aksiyon mutation (`useWarehouseActions.ts`)

### Yetkiler (frontend)

- `PERMISSION_INVENTORY_VIEW_EXPIRY_RISK` — sekme + liste
- `PERMISSION_INVENTORY_MANAGE_EXPIRY_ACTION` — satır aksiyon menüsü

### UX notları

- Gün penceresi: 3 / 7 gün preset
- Kritik lot vurgusu: süresi geçmiş veya ≤1 gün
- Aksiyon tipleri: öncelikli tüketim, transfer önerisi, plan notu

## Diğer sekmeler

### Özet (`summary`)

`WarehouseStats` — KPI kartları arasında **geciken sipariş** sayacı (`overdue_orders`). Tıklanınca `purchase_orders?overdue=true` sekmesine yönlendirir. Bkz. [[Procurement_Intelligence#2. Geciken satın alma siparişi uyarıları]].

### Satın Alma Önerileri (`purchase_recommendations`)

Talep trendi tabanlı öneri listesi, satır override, toplu PO taslağı commit.

| Bileşen | Dosya |
|---------|-------|
| Ana sekme | `components/PurchaseRecommendationsTab.tsx` |
| Tablo | `components/PurchaseRecommendationsTable.tsx` |

**Yeni UX (ufuk günü):** 3 / 7 / 14 gün seçici; `urgency` rozeti (`critical` / `warning` / `ok`); `estimated_days_until_stockout` sütunu.

Bkz. [[Warehouse#Satın Alma Önerileri (EPIC-01)]], [[Procurement_Intelligence]].

### Satın Alma Siparişleri vs Satın Alma Önerileri

| | **PO → Otomatik Öner** | **Satın Alma Önerileri sekmesi** |
|---|---|---|
| Konum | `PurchaseOrdersTab` butonu | Ayrı sekme |
| Mantık | Anlık minimum eşiği | 4/8 hafta tüketim + ufuk günü |
| Yoldaki PO | Hesaba katmaz | Düşer |

### Satın Alma Siparişleri (`purchase_orders`)

PO listesi + minimum stok "Otomatik Öner" wizard (ayrı akış; öneri motorundan bağımsız).

**Geciken PO:** Amber banner (geciken sayı > 0); `overdue=true` URL filtresi; `warehouseApi.getProcurementAlerts` ile özet senkronu.

### Fiyat Artışları (`price_increases`)

| Bileşen | Dosya |
|---------|-------|
| Ana sekme | `components/PriceIncreasesTab.tsx` |

`inventoryApi.getPriceIncreases` — minimum değişim yüzdesi, lookback günü, kategori filtresi. Satıra tıklayınca `CostHistoryModal` (envanter paylaşımlı).

Bkz. [[Procurement_Intelligence#3. Fiyat artışı takibi]], [[Inventory]].

### WebSocket bildirimleri

`hooks/useWarehouseNotifications.ts` — depo WS kanalında `procurement_overdue_alert` toast + `warehouses/summary` ve PO listesi query invalidation. Bkz. [[WebSocket_Architecture]].

### Gün Sonu Kapanış (`kitchen_closing`)

Bkz. [[Kitchen_Closing]].

| Bileşen | Dosya |
|---------|-------|
| Ana sekme | `components/KitchenClosingTab.tsx` |
| Not biçimlendirme | `utils/kitchenClosingDisplay.ts` → `formatKitchenClosingNotes` |
| Hooks | `hooks/useWarehouse.ts` — `useKitchenClosingItems`, `useSubmitKitchenClosing` |

Miktar sütunları `formatQuantityWithUnit` ile gösterilir; geçmiş fire açıklamaları eski `19.000000` biçimli kayıtları da okunur hale getirir.

### Fire Raporları (`waste_reports`)

`WasteReportsTab` — günlük WASTE hareketleri; gün sonu kapanış kayıtları `formatKitchenClosingNotes` ile aynı not kuralını kullanır.

### Stok Sayımı (`stock_counting`)

`StockCountingDetailModal` — sistem/sayılan/fark sütunları `formatQuantity` ile gösterilir (ham 6 ondalık yerine).
