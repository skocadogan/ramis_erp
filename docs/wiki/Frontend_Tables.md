# Frontend Masa Yönetimi

> **Özet:** Şube masalarının grid/liste görünümü, durum yönetimi (aç/kapa/rezerve), aktif sipariş özeti, garson atamasıyla uyumlu masa seçimi ve hesap modalı (sipariş + ödeme akışı). POS ile aynı masa API ve WebSocket yükünü kullanır; ödeme tamamlandığında otomatik fiş baskısını tetikler. Aktif adisyonda **manuel fiş yeniden baskısı** (mutfak + sipariş fişi) desteklenir.
> **Kütüphaneler:** React, TanStack Query, Zustand (usePosStore)
> **Bağlantılar:** [[Branches]], [[Orders]], [[Sales]], [[Frontend_POS]], [[Frontend_Sales]], [[Frontend_Architecture]], [[WebSocket_Architecture]], [[ReceiptTemplate]], [[Printing]], [[API_Client]]

---

## Konum

- **Sayfa:** `frontend/src/app/tables/`
- **Feature:** `frontend/src/features/tables/`
  - `components/TableGrid`, `TableCard`
  - `components/TableOrderModal/` (alt-bileşenler + `useTableOrderModal.ts` hook)
    - `OrderModalHeader.tsx` — başlık + **Fiş Yazdır** dropdown
    - `SaleReceiptPrintDialog.tsx` — satış detayında yazıcı/şablon seçimi ([[Frontend_Sales]])
  - `features/pos/lib/buildKitchenReprintJobsFromOrders.ts` — mutfak yeniden baskı işleri
  - `features/pos/lib/dispatchReceiptPrints.ts` — paralel `print_thermal` kuyruğu + toast
  - `frontend/src/lib/receiptDateContext.ts` — fiş `date` / `time` / `created_at` (ISO) üretimi
  - `services/tablesApi`, `hooks/useTables`

## Rota

- **`/tables`** — Kenar çubukta "Masalar"; şube kapsamında masa listesi.

## API

- **`GET /tables/`** — `TableListSerializer`; açık sipariş özetleri ve **`pos_occupied_flow`** (`KITCHEN` | `SETTLE`) ile POS masa kartı renk mantığı hizalanır.
- WebSocket **`table_update`** — Masa kaydı değişince kartlar anında güncellenir; `/ws/pos/sync/` bağlantısı POS ile **paylaşımlı hub** (`posSyncHubKey`). Bkz. [[WebSocket_Architecture]], [[Frontend_POS]].
- İstemci mutasyonları (`tablesApi` — oluşturma, güncelleme, silme, aynı zamanda bölge CRUD ve sıralama) [[API_Client]] stratejisine uygun **`skipInterceptorToast`** ile işaretlenir; üst katmanda `toastApiError` / `toastApiSuccess` kullanılır.

## Bölge yönetimi ve bildirimler

- **`ZoneManageModal`**: Bölge CRUD ve sıralama geri bildirimi yalnızca **`toastApiSuccess`** / **`toastApiError`** (Sonner) ile verilir; `onNotify` / iç banner kaldırılmıştır — [[API_Client]] ile tek kanal.
- **`app/tables/page.tsx`**: Masa CRUD ve rezervasyon işlemleri aynı operational toast ailesini kullanır.
- **`TakeawayOrderModal`**: Paket sipariş ödeme / iptal / indirim istekleri `skipInterceptorToast` + `toastApiError` / satır içi `extractApiError` ile hizalanır.

## Görünüm ve filtreler

- **Durum:** Tümü, Boş, Dolu, **Bekleyen** (üst kalemlerde hâlâ mutfak/teslim öncesi: `pos_occupied_flow === 'KITCHEN'`), **Temizleniyor** (`CLEANING`), Rezerve, Hizmet dışı.
- **Kart renkleri:** Bekleyen → turuncu; tüm ürünler teslim, hesap aşaması → gül kırmızısı; **Rezerve** → sarı accent (`RESERVED`); **Temizleniyor** → gökyüzü mavisi (sky); **Hizmet dışı** → gri, tıklanamaz. POS [[Frontend_POS]] `TableCard` ile aynı palet.
- **Sipariş engeli:** `OUT_OF_SERVICE` ve `CLEANING` masalardan yeni sipariş açılmaz; pasif (`is_active=false`) masalar API/istemci filtrelerinde listelenmez.
- **`TableSettingsPanel`:** Şube `table_cleaning_duration_minutes` (1–60 dk) — `PATCH /branches/{id}/`.
- **Temizlik aksiyonları:** `tablesApi.startCleaning` / `finishCleaning`; masa menüsü, POS masa kartı ve `useTableCleaningActions` hook'u.

---

## TableOrderModal — Hesap & Ödeme

`useTableOrderModal.ts` hook’u modalın tüm iş akışını yönetir.

### Stok Kontrol Override
Sipariş ekleme (`handleSaveOrder`) sırasında backend `INSUFFICIENT_STOCK` döndürdüğünde:
- Onay diyaloğu açılır.
- Kullanıcı onaylarsa istek `allow_negative_stock: true` ile yeniden gönderilir.
- Ürün ya da hammadde modu `usePosStore.stockTrackingMode`'dan okunur.

### Ödeme (`handlePayment`)
- Tek ödeme veya **bölünmüş ödeme** desteği (`payments[]`); masa genel toplamına uygulanır.
- Masada **birden fazla aktif sipariş** varken bölünmüş ödeme açıktır; backend `complete_table` tutarları sipariş tutarlarına orantılı dağıtır (`distribute_table_payments` → [[Sales]]).
- Tek sipariş → `POST /orders/main/{id}/complete/`; çoklu sipariş → `POST /orders/main/complete_table/` (her iki endpoint `payments[]` kabul eder).
- **Yanlış “ödeme alınamadı” uyarısı:** Sunucu ödemeyi tamamlayıp istemci yanıt alamazsa (ağ/time-out) veya çift tıklamada ikinci istek hata dönerse UI eskiden hata gösteriyordu. `verifyPaymentSettled` ile refetch sonrası başarı sayılır; `paymentOpIdRef` ile aynı denemede idempotency anahtarı sabitlenir; backend `complete` / `complete_table` zaten kapatılmış masayı `already_processed` olarak kabul eder.
- `paymentLabel` türetimi:
  - Tek ödeme → Türkçe yöntem etiketi (`"Nakit"`, `"Kart"`, ...).
  - Bölünmüş → `"Nakit 10,00 ₺ + Kart 20,00 ₺"` biçimi.
- Backend `Sale` kaydı oluşturulduktan sonra `triggerReceiptPrint(saleResult)` çağrılır.

### `triggerReceiptPrint`
`usePosStore.autoPrintPayment === true` ise `paymentPrinters` listesindeki **her** kayıt için:

```ts
adminApi.printReceiptThermal(
  templateSlug,
  printerId,
  {
    ...saleContext,            // items, subtotal, discount, total, ...
    payment_method: paymentLabel,
    payment_type: paymentLabel,
    payments: payments,
    table_name: table.name,
    waiter_name: user.full_name,
    branch_name: branch.name,
  },
  `payment-${saleId}-${printerId}-${templateSlug}`  // idempotencyKey
)
```

`idempotencyKey` ile sayfa yenilemesi/network retry'da çift fiş engellenir. Fiş kuyruğu hataları kullanıcıya bildirilir; ödemenin kendi başarısı etkilenmez (fiş baskısı best-effort). İlgili kalıplar [[API_Client]] (operational toast / `skipInterceptorToast`) ile uyumludur.

### Manuel fiş yazdırma — OrderModalHeader ve OrderReceiptPrintChoiceDialog

Aktif adisyon modalında (transfer modu ve geçmiş satış görünümü **değilken**) başlıkta **Masayı Aktar / Birleştir** ile **Yeni Sipariş Al** arasında mor tonlu **Fiş Yazdır** butonu görünür. Butona tıklandığında `OrderReceiptPrintChoiceDialog` açılır ve kullanıcıya mutfak fişi veya sipariş fişi yazdırma seçeneklerini sunar. i18n: `tables.orderModal.printReceipt`, `printKitchenReceipt`, `printOrderReceipt`, `printChoiceDesc`.

| Seçenek | Tetikleyici | Yazıcı kaynağı | Not |
|---------|-------------|----------------|-----|
| **Mutfak Fişi Yazdır** | `handleReprintKitchen` | Admin tanımlı **KITCHEN** yazıcıları (`GET /printing/printers/?usage_type=KITCHEN`) | `buildKitchenReprintJobsFromOrders` — kalemler istasyona göre yönlendirilir. İptal edilmeyen tüm kalemler (teslim edilenler — `DELIVERED` dahil) basılır. Context'te `order_id` + `kitchen_station_id` ile backend `enrich_print_context_from_order` kalemleri DB'den doldurur ([[ReceiptTemplate]]). |
| **Sipariş Fişi Yazdır** | `handleReprintOrder` | `usePosStore.paymentPrinters` (POS ayarlarındaki `{ printerId, templateSlug }` çiftleri) | `dispatchOrderReceiptPrints` — ödeme bekleyen adisyon; `payment_method` = "Ödeme bekleniyor" |

Otomatik baskı anahtarları (`autoPrintOrder`, `autoPrintPayment`) manuel yeniden baskıyı **engellemez**; yalnızca otomatik akışları kontrol eder.

**Idempotency:** Manuel baskıda anahtar `reprint:{uuid}:{orderId}` öneki ile üretilir (`buildPrintJobIdempotencyKey`). Otomatik sipariş/ödeme baskısından farklı olarak aynı adisyon tekrar yazdırılabilir.

**Ortak yardımcılar:**
- `dispatchReceiptPrints` — tüm `print_thermal` çağrılarını `Promise.allSettled` ile kuyruğa alır; kısmi başarı toast'u.
- `receiptLineFromOrderItem` — sipariş kalemini fiş context satırına dönüştürür.
- `buildReceiptDateTimeContext` — `created_at` (ISO), `date` (`dd.MM.yyyy`), `time` (`HH:mm`) alanlarını üretir; bkz. [[#Tarih ve saat (date / time)]].

POS sipariş detay modalı aynı `TableOrderModal` bileşenini kullanır ([[Frontend_POS]]); bu diyalog orada da geçerlidir.

Geçmiş satış detayı ([[Frontend_Sales]]) için sipariş fişi akışı farklıdır: yazıcı seçim diyaloğu açılır (aşağıdaki bölüm).

### Geçmiş satış detayı — `SaleReceiptPrintDialog`

`orderId` ile açılan modal (`isHistoricalSaleView`) başlıkta yalnızca **Sipariş Fişi Yazdır** sunar (mutfak seçeneği yok). Tıklanınca `SaleReceiptPrintDialog` açılır:

1. Şube: `orders[0].branch` (satışın bağlı siparişi).
2. `GET /printing/printers/?branch_id=&usage_type=POS&is_active=true` — POS yazıcı listesi.
3. `GET /reporting/receipts/?category=POS_RECEIPT` — fiş şablonları.
4. Kullanıcı yazıcı + şablon seçer → **Yazdır** → tek `print_thermal` işi.

Fiş context'i tamamlanmış satış verisini kullanır: `sale.payment_method_display`, bölünmüş ödemede `sale.payments[]`, tutarlar `sale.total_amount` / `discount_amount`, kasiyer `sale.created_by_name`. POS `paymentPrinters` tercihi bu akışta **kullanılmaz** — anlık yazıcı seçimi zorunludur.

### Tarih ve saat (`date` / `time`)

Fiş şablonlarındaki `{{ date }}`, `{{ time }}` ve `type: date|time` blokları backend `ReceiptRenderer._prepare_context` ile doldurulur. Backend yalnızca **ISO** `created_at` değerini güvenilir parse eder; `toLocaleString("tr-TR")` gibi yerel formatlar parse edilemezse **yazdırma anının** tarih/saati basılır.

Geçmiş satış yeniden baskısında (`dispatchOrderReceiptPrints`, `isHistoricalSaleView`) istemci bu sorunu önlemek için `buildReceiptDateTimeContext` ile alanları **açıkça** gönderir:

| Alan | Kaynak | Format |
|------|--------|--------|
| Tarih/saat kaynağı | `orders[0].created_at` (yoksa `sale.paid_at`) | Sipariş (öncelik) / ödeme (yedek) |
| `created_at` | Aynı an | ISO 8601 (`toISOString()`) |
| `date` | Aynı an | `dd.MM.yyyy` (tr-TR) |
| `time` | Aynı an | `HH:mm` (tr-TR) |

Backend ctx'te `date` / `time` zaten varsa üzerine yazmaz; böylece fiş **sipariş tarihinde** basılır, yazdırma anında değil.

Aktif adisyon baskısında (`!isHistoricalSaleView`) anlık tarih/saat kullanılır; `created_at` yine ISO gönderilir.

Bkz. [[ReceiptTemplate#_prepare_context davranışı]], [[Reporting#ReceiptRenderer]].

### İlişkili ekranlar
- Garson: [[Frontend_Waiter]] — ayrı rota; masa verisi aynı backend'den beslenir.
- Ürünler: [[Frontend_Menu]] — sipariş/adisyon kalemlerinin tanımı.

---

## Yerelleştirme (i18n)

Masa yönetimi `tables` namespace'ini kullanır:
- **`tables.grid`**: Arama, filtreleme ve masa yönetimi.
- **`tables.orderModal`**: Hesap detayı, indirim, iptal sebepleri, transfer talimatları ve **fiş yazdırma** (`printReceipt`, `printKitchenReceipt`, `printOrderReceipt`, `printDialog*`).
- **Durum Rozetleri**: `tables.orderModal.status` altındaki anahtarlar (Bekliyor, Hazırlanıyor, vb.) her iki dilde dinamik olarak gösterilir.
