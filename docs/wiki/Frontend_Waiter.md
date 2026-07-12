# Frontend Waiter (Garson Ekranı)

> **Özet:** Garson için sadeleştirilmiş mobil-öncelikli sipariş alma ekranı. Atanmış masa ve bölgelere göre filtreleme; açık vardiya yoksa tam ekran bilgi ve panele dönüş.
> **Kütüphaneler:** React, TanStack Query, WebSocket
> **Bağlantılar:** [[Branches]], [[Orders]], [[Frontend_POS]], [[Frontend_Architecture]], [[Shifts]], [[GateHomeButton]], [[Allergens]], [[Menu_Product_Recommendations]]

---

## Konum
- **Sayfa:** `frontend/src/app/waiter/`

## Vardiya kapısı
Şubede **açık vardiya** yoksa garson ana içeriği açılmaz; kullanıcıya POS üzerinden kasa açılması beklendiği anlatılır. Bu ekranda **[[GateHomeButton]]** ile `/panel` adresine dönülebilir.

### POS Terminal Seçimi
Garson ekranı, bir POS terminaline (ödeme noktasına) bağlı çalışır. 
- Eğer kullanıcıya daha önce bir terminal atanmamışsa, "Kasa Seç" butonu ile aktif terminaller listelenir.
- **Otomatik Atama:** Garson ekranında bir terminal seçildiğinde (veya değiştirildiğinde), bu seçim kullanıcının **Garson Ayarları** (cloud preferences) altına otomatik olarak kaydedilir. Böylece sonraki oturumlarda aynı terminal varsayılan olarak seçili gelir.
- Bu işlem `usePosStore.persistTerminalSelection()` aksiyonu ile gerçekleştirilir.

## Çevrimdışı sipariş kuyruğu (EPIC-07)

Web garson ekranı POS ile aynı offline kuyruk modülünü paylaşır. Üretimde `install.sh` / `update.sh` ile `NEXT_PUBLIC_POS_OFFLINE_QUEUE=true` otomatik etkinleştirilir. Bkz. [[POS_Offline_Queue]], [[Frontend_Environment]].

- `OfflineQueueProvider` — `app/waiter/page.tsx`
- `executeOrEnqueue` — `CartSidebar`, `useTableOrderModal` (sipariş + ödeme)
- `SyncProgressDialog` — bağlantı dönüşünde "Veriler sunucuya aktarılıyor" progress dialog
- Mevcut `BackendHealthBanner` — ek offline göstergesi gerekmez

---

## Yerelleştirme (i18n)

Garson ekranı `waiter` namespace'ini kullanır:
- **Shift (Vardiya):** Vardiya durumu ve zorunlu vardiya uyarıları.
- **Reservation:** Masa üzerindeki rezervasyon çakışma uyarıları ve onaylar.
- **LanguageSwitcher:** Header alanında dil değiştirme desteği eklenmiştir.
- **Paylaşılan Modüller:** Masa listesi için `tables` ve menü için `pos` namespace'leri kullanılır.

## Allerjen uyarısı
Menü grid'i [[Frontend_POS]] ile paylaşılan `ProductCard` (`layout="waiter"`) kullanır. Görsel alana uzun basış açıklama dialog'unu açar; allerjen ikonu ayrı tıklama ile risk dialog'unu gösterir ([[Allergens]]).

## Kalori etiketi
Aynı `ProductCard` bileşeninde `Product.calories` tanımlıysa ürün adının altında `{değer} kCal` gösterilir ([[Frontend_POS#Kalori gösterimi (kCal)]]). Garson web'de müşteri ekranı senkronu yoktur.

## Yanında önerilen ürünler
Aynı `ProductCard` bileşeninde `has_recommendations` ise kart içi **Öneriler** şeridi görünür; `RecommendedProductsDialog` ile sepete ekleme yapılır. Garson web'de CFD senkronu yoktur (yalnızca POS layout). Bkz. [[Menu_Product_Recommendations]].

## Yazdırma ayarları

Garson ekranı POS ile aynı `usePosStore` yazdırma tercihlerini kullanır ([[Frontend_POS]], [[Printing]]):

| Ayar | Davranış |
|------|----------|
| `autoPrintOrder` | Açıkken sipariş sonrası ürünler kategori istasyonuna göre **KITCHEN** yazıcılarına otomatik gider; yazıcı/şablon seçimi yok. |
| `autoPrintPayment` | Açıkken ödeme sonrası seçilen POS yazıcısı ve fiş şablonu ile baskı. |

Sipariş baskısı `buildStationOrderPrintJobs` ile istasyon bazlı gruplanır; tek istasyona bağlı menüde tüm sipariş tek yazıcıdan basılır. Çevrimdışı kuyrukta `deferredPrints` ile senkron sonrası baskı devam eder ([[POS_Offline_Queue]]).
