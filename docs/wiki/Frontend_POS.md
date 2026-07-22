# Frontend POS (Satış Ekranı)

> **Özet:** Tam donanımlı POS satış ekranı. Masa seçimi, ürün kataloğu, sepet yönetimi, sipariş gönderme, ödeme alma, müşteri ekranı (CFD) senkronizasyonu, çoklu yazıcı yönetimi, canlı durum göstergesi ve bağlı cihaz yönetimi.
> **Kütüphaneler:** React, Zustand (usePosStore), WebSocket, TanStack Query, Sonner
> **Bağlantılar:** [[State_Management]], [[Orders]], [[Sales]], [[POS_Display]], [[Menu]], [[Branches]], [[Frontend_Tables]], [[Reporting]], [[Printing]], [[ReceiptTemplate]], [[GateHomeButton]], [[Shifts]], [[Smart_Firing_v2]], [[POS_Connected_Users]], [[RBAC]], [[WebSocket_Architecture]], [[Allergens]], [[Menu_Product_Recommendations]]

---

## Konum
- **Sayfa:** `frontend/src/app/pos/`
- **Feature:** `frontend/src/features/pos/`
  - `components/CartSidebar.tsx` — Sepet ve sipariş gönderim
  - `components/PrinterStatusIndicator.tsx` — Canlı yazıcı durumu
  - `components/PosSettingsDialog.tsx` — POS ayarları (yazıcı seçimi, stok modu, vb.)
  - `components/GateHomeButton.tsx` — Kapı ekranlarında `/panel` dönüşü (bkz. aşağı)
  - `components/POSHeader.tsx` — POS üst çubuğu (şube, terminal, bağlı cihazlar butonu)
  - `components/ConnectedUsersModal.tsx` — Bağlı cihazlar modal'ı ([[POS_Connected_Users]])

---

## Kapı ekranları (`app/pos/page.tsx`)

Tam ekran blokajlar (ana POS grid’i gösterilmeden önce sırayla değerlendirilir):

| Koşul | İçerik |
|-------|--------|
| Vardiya sorgusu / terminal listesi yükleniyor | `PosLoadingScreen` |
| Şubede aktif POS terminali yok | Bilgilendirme + **[[GateHomeButton]]** |
| Terminal seçilmemiş (`posTerminalUuid` boş) | Ödeme noktası listesi + **[[GateHomeButton]]** |
| Açık vardiya yok | `OpenShiftPanel` veya yetkisiz mesaj + **[[GateHomeButton]]** |

Panele dönüş, üst bar `POSHeader` içindeki `/panel` bağlantısı ile aynı hedefi kullanır.

> [!NOTE]
> Kapı ekranından veya ayarlar menüsünden yapılan terminal seçimleri `persistTerminalSelection` aksiyonu ile anında bulut tercihlerine (cloud preferences) kaydedilir.

---

## Paket (takeaway) grid

Sanal masalar `GET /tables/takeaway_virtual/` ile yüklenir (`usePosTables` merge); fizik `GET /tables/` listesi ile birleştirilir.

| `virtual_kind` | UI | Sipariş |
|----------------|-----|---------|
| `new_slot` | "Yeni paket" kartı | `table_id: tw-new__{zone}`, `order_type: TAKEAWAY` (backend zone’u çözer) |
| `takeaway_order` | Dolu kart (sipariş no) | Mevcut sipariş modalı; sepete ekleme `takeawayOrderBlocked` |

**Gerçek zamanlı senkron (önemli):** Paket siparişlerin fizik `table_id`’si yoktur → `table_update` WS gelmez. POS cache `staleTime: Infinity` olduğundan:

1. Yerel aksiyon sonrası `PosWaiterShell.refreshPosTables` → `pos-tables` invalidate
2. Diğer terminaller: `TableSync` + `shouldHttpFallbackPosTables` (`order_created` / `complete_table` / `table_id`siz `order_status_changed`) → `/tables/` + `takeaway_virtual` HTTP yedeği

`kitchenPosEvents.ts` — paket için `order_status_changed` + `table_id` yokken HTTP yedek **zorunlu** (fizik masada `table_update` yeter).

- RBAC: `takeaway.view_takeaway` — yetkisiz tıklamada izin modalı
- `TableCard`: `OUT_OF_SERVICE` / `CLEANING` seçilemez; **RESERVED** sarı accent (POS + masa ekranı ile uyumlu)
- Müşteri ekranı: `PosDisplaySync` takeaway sanal masa değişimlerini dinler

Bkz. [[Branches#Paket (takeaway) sanal masalar]], [[WebSocket_Architecture]].

## Temel Akış
1. Şube ve terminal seçimi
2. Masa seçimi (bölge bazlı) veya paket sipariş (sanal slot)
3. Ürün kataloğundan sepete ekleme (birim + **seçenek grubu** desteği). Reçeteli ürünlerde allerjen ikonu → dialog ([[Allergens]]). Önerili ürünlerde kart içi **Öneriler** şeridi → çapraz satış dialog'u ([[Menu_Product_Recommendations]]).
4. Sipariş gönderme → WebSocket ile KDS'e iletim → opsiyonel **otomatik mutfak/sipariş fişi baskısı**
5. Ödeme alma (nakit/kart/diğer/split) → Satış kaydı → opsiyonel **otomatik ödeme fişi baskısı**
6. Müşteri ekranı (CFD) senkronizasyonu

## Allerjen uyarısı (ürün kartı)

`features/pos/components/ui/ProductCard.tsx` — `is_allergenic && allergens.length` ise amber ikon; dialog yalnızca `name` + `risk_score`. İkon, sepete ekleme düğmesinden ayrı konumlandırılır (iç içe `<button>` yok). Garson web layout'u (`layout="waiter"`) aynı bileşeni kullanır.

## Kalori gösterimi (kCal)

`Product.calories` doluysa ürün adının altında amber tonlu `{değer} kCal` etiketi gösterilir (`utils/formatProductCalories.ts`, `pos.product.caloriesValue`). Boş/null/0 değerlerde etiket yoktur. Garson layout'u aynı kartı kullanır ([[Frontend_Waiter]]).

## Yanında önerilen ürünler (ürün kartı)

`has_recommendations && recommendations.length` → kart içinde mor **Öneriler** şeridi (`Sparkles`). Tıklanınca `RecommendedProductsDialog`: birim seçimi, `(+)` / `(-)` ile sepete ekleme (ayrı kalem; zorunlu modifier yok). POS'ta dialog açıkken `displayRecommendedModal` CFD'ye yansır.

| Bileşen | Dosya |
|---------|--------|
| Dialog | `components/RecommendedProductsDialog.tsx` |
| CFD payload | `utils/displayRecommendedModal.ts` |
| Store | `usePosStore.displayRecommendedModal` |
| WS | `hooks/usePosDisplaySync.ts` |

Ayrıntı: [[Menu_Product_Recommendations]], [[POS_Display]].

## Birim ve seçenek seçimi

`MenuSection` ürün tıklamasında birim ve/veya `modifier_groups` varsa **`ProductOptionsModal`** açar (`features/pos/components/ProductOptionsModal.tsx`):

1. Satış birimi (varsa) — eski `UnitSelectionModal` akışının birleşik hali
2. Seçenek grupları — `is_required` / `is_multiple` kuralları UI'da doğrulanır
3. Onay → `usePosStore.addToCart(product, unit, selectedModifiers)`

Sepet satırı birleştirme imzası: `productId|unit|notes|sortedModifierIds`. Sipariş payload'ında `modifier_ids` gönderilir (`CartSidebar`). KDS `OrderItem.modifiers` satırları `OrderCard` içinde `+ modifier_name` olarak gösterilir.

## WebSocket (`/ws/pos/sync/`)

POS, masa yönetimi ve vardiya ekranları **paylaşımlı hub** (`posSyncHubKey`, `sharedWebSocketHub.ts`) ile tek bağlantı kullanır — önceden `TableSync` + `useActiveShift` ayrı ayrı açıyordu.

| Olay | Davranış |
|------|----------|
| `table_update` | Masa kartları / grid anında güncellenir |
| `shift_event` | Vardiya durumu yenilenir |
| `orders_updated` | Sipariş listesi tetikleyicisi (KDS ile aynı olay ailesi) |

Terminal bazlı müşteri ekranı ayrı kanaldadır: `/ws/pos/display/{terminal}/` ([[POS_Display]]). Bağlı oturum listesi: [[POS_Connected_Users]].

---

## usePosStore Entegrasyonu
POS ekranının tüm durumu `usePosStore` üzerinden yönetilir; cloud preferences ile şube genelinde paylaşılır. Bkz: [[State_Management]].

---

## Sepet ve Sipariş — `CartSidebar.tsx`

### Ön-stok kontrolü
Sipariş gönderilmeden önce `checkPosStationStock(items, stockTrackingMode)` çağrılır:
- `INSUFFICIENT_STOCK` → `AlertDialog` ile hata gösterilir, sipariş engellenir.
- `CRITICAL_STOCK` → uyarı dialog'u; kullanıcı **"Yine de devam et"** ile geçici override edebilir.
- `stockTrackingMode` (`PRODUCT` / `INGREDIENT`) `usePosStore`'dan gelir; ürün düzeyi (`86 listesi`) ya da reçete bazlı (hammadde) kontrol seçeneğini belirler.

**Smart Firing v2 Entegrasyonu:**
- `CartSidebar`, sepet her değiştiğinde (debounced 800ms) arka planda mutfak kuyruk durumunu kontrol eder. 
- Eğer beklenen buffer **≥ 15 dakika** ise, "Siparişi Mutfağa İlet" butonu **amber (turuncu)** renge döner ve üzerinde yoğunluk uyarısı belirir.
- Sipariş başarılı olduktan sonra API `kitchen_queue_notice` dönerse bilgilendirme toast’u gösterilir. Bkz. [[Smart_Firing_v2]].

### Otomatik fiş baskısı (sipariş)
`autoPrintOrder=true` ise sipariş başarıyla oluşturulduktan sonra `buildStationOrderPrintJobs` sepeti ürünün `category_station` alanına göre gruplar:

- Sepette **tek istasyon** varsa tüm kalemler o istasyonun yazıcısından basılır.
- **Birden fazla istasyon** varsa her istasyon için ayrı fiş üretilir.
- Yazıcı/şablon eşlemesi admin panelinde tanımlı **KITCHEN** yazıcılarından (`kitchen_station` + `receipt_template_slug`) okunur; POS ayarlarında yazıcı seçimi yoktur.

```ts
adminApi.printReceiptThermal(
  job.templateSlug,    // yazıcıda tanımlı şablon
  job.printerId,         // istasyona bağlı KITCHEN yazıcısı
  job.context,
  job.idempotencyKey     // orderId + printer + template
)
```

`idempotencyKey` aynı sipariş + yazıcı + şablon kombinasyonunda çift fiş çıkmasını engeller.

---

## Yazıcı Durumu — `PrinterStatusIndicator.tsx`

POS üst barında konumlanır.
- `useQuery({ queryFn: adminApi.getPrinters, refetchInterval: 30_000 })` ile **30 saniyede bir** otomatik yenileme.
- `autoPrintOrder` açıksa şubedeki aktif **KITCHEN** yazıcıları; `paymentPrinters` listesindeki yazıcılar durum göstergesine dahil edilir.
- Tek yazıcıysa rozet (online/offline/uyarı), birden fazlaysa açılır menü (her bir yazıcı için ayrı satır).
- Menü içi aksiyonlar:
  - **Test Sayfası Bas** → `adminApi.testPrint(printerId)`
  - **Durumu Yenile** → `adminApi.syncPrinterStatus(printerId)` (mutation)

---

## POS Ayarları — `PosSettingsDialog.tsx`

### Yazıcı & Şablon Eşlemesi

| Ayar | Açıklama |
|------|----------|
| `autoPrintOrder` | Açıkken sipariş sonrası istasyon yazıcılarına otomatik baskı (yazıcı/şablon seçimi yok). |
| `paymentPrinters` | Ödeme tamamlandığında yazılacak `{ printerId, templateSlug }` çiftleri (`POS_RECEIPT`). |

Ödeme baskısı satırlarında yazıcı + şablon seçilir (`adminApi.getPrinters`, `adminApi.getReceiptTemplates({ category: "POS_RECEIPT" })`).

### Otomatik Baskı Anahtarları

| Switch | State |
|--------|-------|
| Sipariş alındıktan sonra fiş yazdır | `autoPrintOrder` |
| Ödeme sonrası fiş yazdır | `autoPrintPayment` |

### Ürün Takip Yöntemi (Stock Tracking Mode)

Yeni eklenen radio:

| Seçenek | Değer | Etki |
|---------|-------|------|
| **Ürün Kısıtına Göre (86)** | `PRODUCT` | Stok kontrolü ürün düzeyinde — `Product.is_in_stock` ve manuel "86 listesi". |
| **Hammaddeye Göre** | `INGREDIENT` | Stok reçete üzerinden hammaddeye düşülerek kontrol edilir; mutfak deposu bazlı. |

`usePosStore.stockTrackingMode` cloud preferences ile şube içi tüm terminallerde senkronize olur.

---

## Masa kartı durumu (POS)

Bölge grid'inde dolu masalar, sipariş kalemi durumlarına göre iki fazda gösterilir:
- **Turuncu — BEKLEYEN:** `pos_occupied_flow === 'KITCHEN'` (en az bir üst kalem mutfak/teslim öncesi).
- **Kırmızı (rose):** `SETTLE` veya API alanı yok (legacy); ürünler teslim edilmiş, hesap kapanışı bekleniyor.
- **Gökyüzü mavisi — TEMİZLENİYOR (`CLEANING`):** Ödeme sonrası otomatik veya manuel; geri sayım, **Hazır (Boş)** butonu. Sipariş seçilemez. Boş masada **Temizlemeye Al** kısayolu.

Bkz. [[Branches]] (`pos_occupied_flow`), [[Frontend_Tables]].

## Müşteri Ekranı (CFD) Sync
- `activeDisplayOrder` — Aktif sipariş snapshot'ı
- `displayMetadata` — Ödeme modu bilgisi
- `displaySuccessSignal` — ORDER / PAYMENT başarı bildirimi
- `displayRecommendedModal` — Önerilen ürünler dialog'u (kasiyer açtığında müşteri ekranında `CustomerDisplayRecommendedModal`; [[Menu_Product_Recommendations]])
- `displayOptionsModal` — Birim/seçenek seçimi sırasında `CustomerDisplayOptionsModal`; payload'da `calories` (ürün adının altında kCal)
- Sepet listesi (`CustomerDisplayView`) — her kalemde ürün adının altında kalori etiketi (sepet `CartItem.product.calories`)

Kalori biçimlendirme: `utils/formatProductCalories.ts` — i18n `pos.display.caloriesValue` / `pos.product.caloriesValue`. Bkz. [[POS_Display#Müşteri ekranı — kalori senkronu]].

---

## Çevrimdışı işlem kuyruğu (EPIC-07)

`NEXT_PUBLIC_POS_OFFLINE_QUEUE=true` üretimde varsayılan (`install.sh` / `update.sh`). Bkz. [[POS_Offline_Queue]], [[Frontend_Environment]].

- `OfflineQueueProvider` — `/pos` ve `/waiter` sayfalarında flush döngüsü
- `SyncProgressDialog` — bağlantı dönüşünde tam ekran senkron ilerleme (progress bar)
- `OfflineQueueIndicator` — `POSHeader` içinde bekleyen/başarısız işlem rozeti
- `ReconciliationDialog` — sanal liste ile yeniden dene / sil
- `CartSidebar` + `useTableOrderModal` — `executeOrEnqueue` entegrasyonu

---

## Sipariş detay modalı — manuel fiş yazdırma

POS ve garson layout'u masa/paket sipariş detayını `TableOrderModal` ile açar (`OrderModalSwitch` / `PosWaiterShell`). Başlıkta **Fiş Yazdır** butonu bulunur. Butona tıklandığında `OrderReceiptPrintChoiceDialog` açılır:

- **Mutfak Fişi Yazdır** — admin **KITCHEN** yazıcıları + istasyon yönlendirmesi (`buildKitchenReprintJobsFromOrders`). İptal edilmeyen tüm kalemler (teslim edilenler — `DELIVERED` dahil) basılır.
- **Sipariş Fişi Yazdır** — `usePosStore.paymentPrinters` (POS ayarlarındaki `{ printerId, templateSlug }` çiftleri).

Otomatik baskı (`autoPrintOrder`, `autoPrintPayment`) ile bağımsızdır. Bkz. [[Frontend_Tables#Manuel fiş yazdırma — OrderModalHeader ve OrderReceiptPrintChoiceDialog]].

---

## POSHeader — Bağlı Cihazlar Butonu

`POSHeader.tsx` içinde `pos.manage_connections` iznine sahip kullanıcılara **"Bağlı Cihazlar"** butonu gösterilir.

```typescript
const { canManage } = useModulePermissions();
const canOpenConnectedUsers = canManage(PERMISSION_POS_MANAGE_CONNECTIONS);
```

Butona tıklandığında `ConnectedUsersModal` açılır. Bkz. [[POS_Connected_Users]].

> **İzin Senkronizasyonu:** `useRequireModulePermission` hook'u her POS sayfası yüklenişinde `/auth/me/` çağrısı yaparak Zustand store'undaki `user.permissions`'ı tazeler. RBAC rolü değişen kullanıcılar sayfayı yenileyince güncel izinlerle çalışır.
