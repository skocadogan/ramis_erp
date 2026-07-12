# Frontend Inventory

> **Özet:** Stok kalemleri, kategoriler, birimler, tedarikçiler, stok hareketleri, FEFO raporu ve toplu giriş ekranları. SKT operasyon ekranı bu modülde değil; depo modülüne widget ile yönlendirilir.
> **Kütüphaneler:** React, TanStack Query, TanStack Virtual
> **Bağlantılar:** [[Inventory]], [[Frontend_Warehouse]], [[Frontend_Architecture]], [[RBAC]], [[Procurement_Intelligence]]

---

## Konum

- **Sayfa:** `frontend/src/app/warehouse/` değil — `frontend/src/app/inventory/page.tsx`
- **Feature:** `frontend/src/features/inventory/`

## Navigasyon

Envanter modülü **kendi sekme navigasyonunu** kullanır (`InventoryModuleNav`):

| Sekme key | Açıklama |
|-----------|----------|
| `items` | Stok kalemleri |
| `movements` | Stok hareketleri |
| `suppliers` | Tedarikçiler |
| `categories` | Kategoriler |
| `unit_definitions` | Birim tanımları |
| `fefo_report` | FEFO envanter raporu |

Nav altında **Depo Yönetimi** linki (`/warehouse`) — depo modülüne geçiş.

Ana uygulama sidebar'ı (`AppSidebar`) her iki modülde de görünür; modül içi nav ile birlikte çalışır.

## SKT vs FEFO

| Özellik | Envanter (`fefo_report`) | Depo (`expiring_lots`) |
|---------|--------------------------|-------------------------|
| Amaç | Envanter/FEFO analiz raporu | Operasyonel SKT uyarı + aksiyon |
| Konum | Envanter sekmesi | Depo sekmesi |
| API | `GET .../stock-items/fefo-report/` | `GET .../inventory/expiry-warnings/` |

**SKT operasyonu envanterde ayrı sekme olarak sunulmaz** (bilinçli mimari karar — tek giriş noktası depo).

## SKT Risk widget (kısayol)

`InventoryHeader` içinde `ExpiryRiskWidget` — 3 gün içinde risk taşıyan lot sayısını gösterir.

- Tıklanınca: `/warehouse?tab=expiring_lots`
- Görünürlük: `inventory.view_expiry_risk` izni gerekir
- Bileşen kaynağı: `features/warehouse/components/ExpiryRiskWidget.tsx` (paylaşımlı)

Detaylı SKT ekranı dokümantasyonu: [[Frontend_Warehouse]].

## Düşük stok gösterimi

Backend `is_low_stock` kuralı: pozitif minimum ve `quantity < minimum_quantity` ([[Inventory#Düşük / kritik stok eşiği]]). Çoğu liste/API bu alanı doğrudan kullanır.

**Stok kalemleri tablosu** (`ItemsTable` / `StockStatusBadge`):

| Rozet | Koşul | `is_low_stock` |
|-------|--------|------------------|
| `lowStock` | Kalan **<** minimum | Evet |
| `atThreshold` | Kalan **=** minimum | Hayır (bilgi) |
| — | Minimum `-1` veya `0` | Hayır |

**Toplu sipariş önerisi** (`inventory/page.tsx`): kritik kalem filtresi `isQuantityBelowMinimum` (`frontend/src/lib/stockMinimum.ts`).

KDS mutfak stok çekmecesi: [[Frontend_KDS#Mutfak stok çekmecesi]].

## Tedarikçi performans modalı

`SupplierPerformanceModal` — tedarikçi satırından açılır; kabul/red oranı ve teslimat metrikleri (`GET .../suppliers/{id}/performance/`).

**Gecikmiş açık PO:** Modal alt bölümünde `warehouseApi.getProcurementAlerts({ supplier_id })` ile beklenen teslimat tarihi geçmiş `ORDERED` / `PARTIALLY_RECEIVED` siparişler listelenir. Depo PO sekmesine yönlendirme linki içerir.

Bkz. [[Procurement_Intelligence#2. Geciken satın alma siparişi uyarıları]], [[Inventory#Tedarikçi Raporları ve Performans Endpoint'leri]].
