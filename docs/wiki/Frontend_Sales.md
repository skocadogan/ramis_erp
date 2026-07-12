# Frontend Sales
> **Özet:** Satış listeleri, ödeme dağılımları, ürün analizi ve iptal/iade raporlama ekranları. Satır detayında [[Frontend_Tables#TableOrderModal — Hesap & Ödeme|TableOrderModal]] ile geçmiş satış görüntülenir; **Sipariş Fişi Yazdır** için yazıcı/şablon seçim diyaloğu sunulur.
> **Kütüphaneler:** React, TanStack Query, @tanstack/react-virtual, Recharts
> **Bağlantılar:** [[Sales]], [[Frontend_Architecture]], [[Frontend_Tables]], [[Printing]], [[ReceiptTemplate]], [[Audit_Trail]], [[Orders]], [[Menu_Engineering]]

## Konum
- **Sayfa:** `frontend/src/app/sales/`
- **Feature:** `frontend/src/features/sales/`

## Sekmeler
| Sekme | Bileşen | Açıklama |
|-------|---------|----------|
| Satışlar | `SalesTable` | Sanallaştırılmış tablo + sonsuz kaydırma (`useSales`, `PAGE_SIZE=200`) |
| Özet | `SalesStats` | Dönemsel ciro ve ödeme dağılımı |
| Ürün Analizi | `ProductSalesAnalytics` | Ürün/kategori filtresi, dönem filtresi, trend grafiği |
| Menü Mühendisliği | `MenuEngineeringAnalytics` | Tahmini / gerçek maliyet görünümü, sınıflandırma matrisi, stock variance drilldown |
| **İptaller & iadeler** | `SalesCancellationsPanel` + `CancellationsTable` | İptal/iade kalemleri; ürün analizi ile aynı dönem ve ürün filtreleri |

Sağ üst **şube seçimi** (`BranchSelect`) tüm sekmelerde ortak `useSales.branchId` state'ini kullanır.

## Menü Mühendisliği
- Bileşen: `features/sales/components/MenuEngineeringAnalytics.tsx`
- Veri kaynağı: `/dashboard/menu-engineering/`
- Görünüm modu:
  - `Tahmini` → FEFO / reçete temelli kârlılık
  - `Gerçek` → `OrderItemIngredientCost` ledger kapsaması olan historical margin görünümü
- Ortak filtreler: şube, preset / custom tarih aralığı, ürün, kategori, menü sınıfı, metin arama
- Export: `menu-engineering-analytics` raporu seçili moda göre PDF / Excel üretir
- Ayrıntılı backend akışı: [[Menu_Engineering]]

## İptaller & iadeler (2026-05-27)

### Hook ve API
- `useSalesCancellations` — `useInfiniteQuery`, `CANCELLATIONS_PAGE_SIZE=200`
- `salesApi.getCancellations`, `exportCancellationsPdf`, `exportCancellationsExcel`

### Tablo UI
- `CancellationsTable`: [[Sales]] listesi ile aynı sanallaştırma kalıbı (`@tanstack/react-virtual`, sticky header, infinite scroll tetikleyici).
- Kolonlar: tarih, şube, masa, iptal eden, neden, ürün/miktar, tutar.
- Satıra tıklanınca `TableOrderModal` ile ilgili sipariş açılır.

### Filtreler
- `SalesPeriodFilter` — [[Frontend_Performances]] `PeriodFilter` sarmalayıcısı (`i18nNamespace="sales"`)
- Özel tarih aralığı (ürün analizi ile paylaşımlı preset state)
- `ProductCategorySelect` → `product_id` query param
- Metin arama → `search` (masa, ürün, iptal eden)
- Excel / PDF export (satışlar sekmesi ile aynı düğme stili)

### i18n
- `frontend/src/i18n/messages/{tr,en,bg,sq}/sales.json` → `tabs.cancellations`, `cancellations.*`

---

## Satış detayı modalı ve fiş yazdırma

### Açılış
- **Satışlar** sekmesinde satıra tıklanınca `viewSale` state'i set edilir → `TableOrderModal` `orderId={viewSale.order}` ile açılır (`app/sales/page.tsx`).
- **İptaller & iadeler** sekmesinde satır tıklaması aynı modalı `viewCancellation.order_id` ile açar.
- Modal `tableId` olmadan açıldığında `isHistoricalSaleView=true`; başlık **Satış Detayı** (`tables.orderModal.saleDetail`).

### Fiş yazdırma akışı
Geçmiş satış görünümünde başlıkta **Fiş Yazdır → Sipariş Fişi Yazdır** görünür. Aktif POS adisyonundan farklı olarak:

1. POS `paymentPrinters` tercihi **kullanılmaz**.
2. `handleReprintOrder` → `SaleReceiptPrintDialog` açılır.
3. Diyalog şubenin **POS** yazıcılarını ve **POS_RECEIPT** şablonlarını listeler; yazıcıda tanımlı `receipt_template_slug` varsa otomatik seçilir.
4. Onay sonrası `dispatchOrderReceiptPrints([{ printerId, templateSlug }])` — tamamlanmış satış ödeme bilgisi ve kalemleri fiş context'ine yazılır; **tarih/saat** sipariş `created_at` (ISO + `date`/`time` override) ile gider ([[Frontend_Tables#Tarih ve saat (date / time)]]).

Bileşen konumu: `features/tables/components/TableOrderModal/SaleReceiptPrintDialog.tsx`. İş mantığı: `useTableOrderModal.ts` (`dispatchOrderReceiptPrints`, `handleSalePrintConfirm`).

Detaylı tablo ve idempotency notları: [[Frontend_Tables#Manuel fiş yazdırma — OrderModalHeader]].

### i18n (fiş diyaloğu)
Metinler `tables.orderModal` altında: `printDialogTitle`, `printDialogDesc`, `printDialogPrinter`, `printDialogTemplate`, `printDialogConfirm`, `printDialogNoPrinters`, `printDialogLoadError`. Yazıcı/şablon placeholder'ları `pos.settings.printerSelect` / `templateSelect` ile paylaşılır.
