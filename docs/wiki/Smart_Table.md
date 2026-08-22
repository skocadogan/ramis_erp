# Smart Table (Masaüstü Mobil Uygulaması)

> **Özet:** Restoran masalarında kullanılmak üzere React Native ile geliştirilmiş, Expo Managed Workflow ile çalışan self-servis menü ve sipariş uygulaması. Müşteriler menüyü görüntüleyebilir, sepete ürün ekleyebilir ve sipariş gönderebilir; garson çağrısı, profil yönetimi ve Smart Table'a özel müşteri geri bildirim anket akışları da içerir. **2026-07-08: Kapsamlı performans optimizasyonu** — menü verisi normalizasyonu, derived state, useShallow selector birleştirme, WS stabilizasyonu, FlatList optimizasyonu, CartSheet parçalama, lazy load, Hermes -O flag, metro minifier tuning.
> **Kütüphaneler:** React Native, Expo SDK 57+, NativeWind (TailwindCSS), Zustand 5.x, Lucide React Native.
> **Bağlantılar:** [[Orders]], [[WebSocket_Architecture]], [[State_Management]], [[Menu]], [[Mobile_Waiter_App]], [[Guest_Feedback]], [[Frontend_Surveys]], [[Mobile_Apps_Family]]

---

## Genel Bakış

Smart Table, restoran masalarına yerleştirilen tabletlerde çalışan bir müşteri uygulamasıdır. Web tabanlı garson/POS ekranından farklı olarak native performans ve offline dayanıklılık sağlar. Backend ile iletişim REST API ve WebSocket üzerinden gerçekleşir.

### Konum
```
mobile_app/smart_table/
├── app/                    # Expo Router sayfaları
│   ├── (auth)/login.tsx    # Giriş ekranı
│   ├── (tabs)/             # Alt tab navigasyonu
│   │   ├── _layout.tsx     # 3 tab: Menü, Siparişler, Garson
│   │   ├── menu.tsx        # Ana menü ekranı
│   │   ├── orders.tsx      # Siparişlerim ekranı
│   │   ├── profile.tsx     # Profil & ayarlar (gizli tab)
│   │   └── waiter-call.tsx # Garson çağrı ekranı
│   ├── product/[id].tsx    # Ürün detay sayfası (modal)
│   ├── _layout.tsx         # Kök Stack layout
│   └── index.tsx           # Redirect → (tabs)/menu
├── src/
│   ├── components/         # Paylaşılan UI bileşenleri
│   ├── hooks/              # Custom hook'lar
│   ├── services/           # API servisleri ve hook'lar
│   ├── store/              # Zustand store'ları
│   ├── types/              # TypeScript tipleri
│   └── utils/              # Yardımcı fonksiyonlar
```

---

## Navigasyon Yapısı

### Alt Tab Bar (3 sekme)

| Sekme | Dosya | İşlev |
|-------|-------|-------|
| Menü 🍴 | `menu.tsx` | Kategori/ürün listesi, sepete ekleme |
| Siparişler 📋 | `orders.tsx` | Aktif siparişler ve geçmiş |
| Garson 🔔 | `waiter-call.tsx` | Garson çağrısı gönderme |

**Profil sayfası** (`profile.tsx`) tab bar'da gösterilmez. Menü tab'ına **5× hızlı tık** (easter egg) ile açılır.

### Kök Stack (Root Layout)
```
app/_layout.tsx
├── index                  → Redirect
├── (auth)/login           → Giriş ekranı
├── (tabs)/                → Tab navigasyonu
├── product/[id]           → Ürün detay (modal)
├── waiter-call            → Garson çağrı (modal, alternatif)
└── SmartTableSurveyHost   → Global survey onay / seçim / doldurma host'u
```

---

## Menü Ekranı (`menu.tsx`)

### Top Bar
```
[🇷 RAMIS Akıllı Masa]     [📝] [🌐] [🌙]
```

- **📝 Anketler:** Aktif sipariş varken görünür; tek anketi doğrudan açar, birden fazla anket varsa seçim yüzeyi açar.
- **🌐 Dil değiştir:** TR/EN geçişi (`useUIStore.toggleLanguage`)
- **🌙 Tema değiştir:** Açık/Koyu mod (`useUIStore.toggleTheme`)

## Smart Table Survey Akışı

Smart Table survey deneyimi, [[POS_Display]] akışından bağımsız bir kanal olarak çalışır. UI tarafında tüm survey deneyimi `app/_layout.tsx` içine monte edilen global `SmartTableSurveyHost` üzerinden yönetilir; yeni bir WebSocket bağlantısı açılmaz, mevcut sipariş state'i ve `useOrderSync` yenileme akışı kullanılır.

### Giriş Noktaları

- **Header butonu:** `app/(tabs)/menu.tsx` içindeki top bar'dan manuel açılış sağlar.
- **Hesap çağrısı:** `WaiterCallScreen` içinde `BILL` çağrısı backend tarafından kabul edilirse başarı mesajından sonra survey onay ekranı tetiklenir.
- **Hazır sipariş gecikmeli daveti:** Tüm aktif siparişler müşteri durumunda `PREPARED / ON_THE_WAY / DELIVERED` seviyesine geldikten yaklaşık 3.5 dakika sonra survey onay ekranı açılır.

### Davranış Kuralları

- Aynı masa oturumunda Smart Table üzerinden cevaplanan anket tekrar listelenmez.
- Header akışında aktif survey kalmadıysa ve masa daha önce survey cevapladıysa kullanıcıya “anketi zaten cevapladınız” mesajı gösterilir; “aktif anket yok” mesajı yalnız gerçekten hiç uygun survey kalmadığında kullanılır.
- Survey host'u root layout altında global olduğu için, aktif sipariş bağlamı korunuyorsa onay ekranı karşılama ekranı üzerinde de açılabilir; bilerek tab ekranlarıyla sınırlandırılmamıştır.
- Ödeme sonrası backend `create_sale_for_order()` akışı Smart Table survey session'larını pasife çeker; mobil tarafta siparişlerin temizlenmesiyle survey state de sıfırlanır.

### Kategori Satırı (`CategoryRow`)
- Yatay scroll ile kategoriler listelenir.
- Her kart bir kategori adı ve ürün sayısı rozeti içerir.
- **Dil desteği:** `language === 'en'` ise `category.nameEn` gösterilir.
- Seçili kategori vurgulanır, alta ürün grid'i açılır.
- **Otomatik kaydırma:** Seçili kategori değiştiğinde (ör. swipe ile) ScrollView otomatik olarak o kategoriyi görünür yapacak şekilde kayar.
  - Her kartın `onLayout` ile `{ x, width }` pozisyonu `cardPositions` ref'inde saklanır.
  - `useEffect(activeCategoryId)` tetiklendiğinde `scrollRef.current?.scrollTo({ x: pos.x - 16, animated: true })` çağrılır.
  - Indicator (alt çizgi) de aynı efekt içinde animasyonla güncellenir.

### Sanal "Öne Çıkan" (Popüler) Kategorisi
Backend'de `isFeatured = true` işaretlenmiş ürünler, otomatik olarak **sanal bir "Öne Çıkan"** kategorisinde toplanır:
- Kategori listesinin başına eklenir (order: -1).
- `POPULAR_CATEGORY_ID = '__popular__'` — backend'de karşılığı yoktur.
- Eğer featured ürün varsa, varsayılan seçim "Öne Çıkan" olur.
- featured ürün yoksa kategori hiç gösterilmez.

### Ürün Grid'i (`ProductGrid`)
- Seçili kategoriye göre filtrelenmiş ürünler.
- Her ürün kartı: görsel, ad, fiyat, sepete ekle butonu.

### Yüzen Sepet Butonu
- Sepette ürün varken sağ alt köşede görünür.
- Toplam tutar + ürün sayısı rozeti gösterir.

### Swipe ile Kategori Değiştirme
`menu.tsx` içindeki ürün grid alanı, React Native'in built-in **`PanResponder`** API'si ile yatay kaydırma (swipe) algılar:

| Gesture | Davranış |
|---------|----------|
| **Sola kaydırma** (dx < -60px) | Mevcut kategorinin **sağındaki** kategoriye geçer (index + 1) |
| **Sağa kaydırma** (dx > 60px) | Mevcut kategorinin **solundaki** kategoriye geçer (index - 1) |

**Nasıl çalışır:**
1. `PanResponder.create()` ile `onMoveShouldSetPanResponder` sadece yatay hareket dikeyden baskınsa (`abs(dx) > abs(dy)`) devreye girer.
2. `onPanResponderRelease`'de `dx` değeri `SWIPE_THRESHOLD (60px)` ile karşılaştırılır.
3. Eşik aşılırsa `setSelectedCategoryId(nextCategory.id)` ile kategori state'i güncellenir.
4. Kategori satırı (`CategoryRow`) `useEffect` ile otomatik kayar ve indicator güncellenir.
5. `filteredProducts` yeniden hesaplanır, `ProductGrid` yeni ürünleri gösterir.

**Dikey scroll korunur:** PanResponder sadece yatay hareketlerde aktif olur, FlatList'in dikey kaydırması etkilenmez.

---

## WebSocket ile Gerçek Zamanlı Güncelleme

### `useOrderSync` Hook'u
Konum: `src/hooks/useOrderSync.ts`

Tab layout mount edildiğinde (`_layout.tsx` → `useOrderSync()`) bir WebSocket bağlantısı açar:

| WS Olayı | Etki |
|----------|------|
| `order_status_changed` | `order-store` güncellenir, siparişler debounce ile yeniden yüklenir |
| `orders_updated` / `kds_refresh` | Masa bazlı sipariş yenileme |
| `table_update` | Masa durumu değişikliği (FREE/CLEANING → sepet temizliği) |
| `menu_catalog_refresh` | **Menu store refreshVersion** artırılır → `useMenu` otomatik yeniden yüklenir |

**Yeniden bağlanma:** Exponential backoff (1sn → 2sn → 4sn → … → 30sn max).
**HTTP fallback:** WS kopukken 45 saniyede bir `fetchOrders` çağrılır.

Survey akışı yeni WS kanalı açmaz; hazır sipariş gecikmesi ve ödeme/reset davranışı `useOrderStore.activeOrders` ile bu mevcut senkronizasyon üstünden türetilir.

### `menu-store` (Zustand)
```typescript
interface MenuState {
  refreshVersion: number;   // Her menu_catalog_refresh'te artar
  signalRefresh: () => void; // WS handler'dan çağrılır
}
```

`useMenu` hook'u `refreshVersion` değişimini izler ve değişince API'den kategorileri/ürünleri yeniden yükler.

---

## Dialog Sistemi (Alert → Modal)

### `dialog-store` (Zustand)
Konum: `src/store/dialog-store.ts`

Native `Alert.alert()` yerine tema uyumlu Modal dialog sağlar.

| Metot | Kullanım |
|-------|----------|
| `alert(title, message)` | Tek "Tamam" butonlu bilgi dialogu |
| `confirm(title, message, onConfirm, onCancel?, ...)` | Evet/İptal onay dialogu |
| `show(title, message, actions[])` | Özel aksiyonlu dialog |
| `hide()` | Dialog'u kapat |

### `Dialog` Bileşeni
Konum: `src/components/ui/Dialog.tsx`

Root layout'a (`_layout.tsx`) monte edilir:
```tsx
<Stack>…</Stack>
<Dialog />
```

Tüm `Alert.alert()` çağrıları (login, orders, profile, waiter-call) bu sisteme taşınmıştır.

---

## Easter Egg: Gizli Profil

Menü tab'ına **2 saniye içinde 5 kez** tıklandığında profil sayfası açılır.

**Nasıl çalışır (`_layout.tsx`):**
```tsx
const handleMenuTabPress = useCallback((): boolean => {
  tapCountRef.current += 1;
  if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  if (tapCountRef.current >= 5) {
    tapCountRef.current = 0;
    router.push('/(tabs)/profile');
    return true; // ← default onPress engellenir, profil açık kalır
  }
  tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 2000);
  return false;
}, [router]);
```

- `tabBarButton` prop'u ile default tab press override edilir.
- Easter egg tetiklendiğinde `onPress?.(e)` **çağrılmaz** → menü tab'ına geri dönmez.
- Sayaç 2 saniye sonra sıfırlanır.

---

## Store'lar

### `useAuthStore`
Konum: `src/store/auth-store.ts`
- JWT token yönetimi, SecureStore ile persist.
- `serverUrl` bağlantı adresi.
- `init()` — uygulama açılışında token geri yükleme.

### `useTableStore`
Konum: `src/store/table-store.ts`
- Seçili şube (`selectedBranch`) ve masa (`selectedTable`).
- `init()` — SecureStore'dan geri yükleme.

### `useCartStore`
Konum: `src/store/cart-store.ts`
- Sepet kalemleri, ürün ekleme/çıkarma, toplam hesaplama.
- `getItemCount()` — tab bar rozeti için.

### `useOrderStore`
Konum: `src/store/order-store.ts`
- Sipariş listesi, WS ile senkronize durum.
- `fetchOrders()`, `applyWsOrderStatusChange()`, `clearOrders()`.

### `useUIStore`
Konum: `src/store/ui-store.ts`
- `theme` (dark/light), `language` (tr/en).
- Boşta kalma zaman aşımı (`idleTimeout`).

### `useSurveyStore`
Konum: `src/store/survey-store.ts`
- Smart Table survey uygunluk yükleme, onay ekranı, çoklu survey seçimi ve cevap gönderimini yönetir.
- `requestManualOpen()` header butonu akışını, `requestConsentFlow()` ise hesap çağrısı ve hazır sipariş davetlerini başlatır.
- `submitCurrentSurvey()` sonrası teşekkür durumu gösterir ve aynı masa için cevaplanmış survey'leri tekrar göstermeme kuralını uygular.

### `useMenuStore`
Konum: `src/store/menu-store.ts`
- `refreshVersion` — WebSocket `menu_catalog_refresh` sinyaliyle artar.
- `useMenu` hook'u bu değeri izleyerek otomatik yeniden yüklenir.

### `useDialogStore`
Konum: `src/store/dialog-store.ts`
- Global dialog durumu (visible/hidden, title, message, actions).
- `alert()`, `confirm()`, `show()`, `hide()` metotları.

---

## Tipografi & Temalar

- Tema: `useUIStore.theme` → `isDark` değişkeni ile bileşenlerde kullanılır.
- Renk paleti: `#D94A3D` (birincil, açık), `#E85D04` (birincil, koyu), `#1A1A2E` (arka plan koyu), `#EDEDED` (metin koyu).
- NativeWind (TailwindCSS) ile stil; `cn()` yardımcısı ile koşullu sınıf birleştirme.

---

## İptal İşlemleri (Cancellation)

Smart Table üzerinden verilen siparişlerin veya belirli kalemlerin iptal edilmesi, sıkı güvenlik ve audit kontrollerine tabidir:
- **Kalem İptali:** Müşteri, sipariş detay sayfasından (`OrderDetailSheet`) hazırlığına henüz başlanmamış (veya mutfak aşamasındaki yetkilendirilmiş) kalemler için iptal talebi gönderebilir.
- **Güvenlik Doğrulaması:** Backend, iptal talebini gönderen kullanıcının 'Smart Table' (Akıllı Masa) rolüne sahip olup olmadığını doğrular (`user_is_smart_table_actor`).
- **Gerekçe ve Kaynak Kaydı:** İptal talebi doğrulanırsa, backend tarafındaki iptal servis metodu (`ItemService.cancel_item`) iptal kaynağını `smart_table` olarak kaydeder ve iptal denetim loguna (`record_audit`) bu bilgiyi ekler. İptal gerekçe metni otomatik olarak yerelleştirilmiş "Müşteri Smart Table üzerinden iptal etti" (`SMART_TABLE_CANCEL_AUDIT_TEXT`) ifadesine set edilir.
- **Stok Geri Kazanımı:** İptal edilen ürünün tipine göre (ürün veya reçete) stok rezervasyonları geri bırakılır veya porsiyon sayıları güncellenir.

## İlgili Sayfalar

- [[Mobile_Waiter_App]] — Eski nesil garson mobil uygulaması (`mobile_app/waiter/`)
- [[Orders]] — Sipariş akışı ve backend servisleri
- [[WebSocket_Architecture]] — Gerçek zamanlı iletişim altyapısı
- [[State_Management]] — Tüm Zustand store'ları
- [[Menu]] — Backend menü modülü
- [[Internationalization]] — Çoklu dil (TR/EN)

---

## Performans Optimizasyonları (2026-07-08)

**Branch:** `perf/smart-table-optimization`  
**Kapsam:** Seviye C (Derinlemesine Mimari İyileştirme) — 22 dosya, 18 task

### Veri Katmanı

| Optimizasyon | Dosya | Açıklama |
|-------------|-------|----------|
| **Menü normalizasyonu** | `src/utils/menuNormalizer.ts` (yeni), `src/services/useMenuNormalized.ts` (yeni) | Düz `Category[]`/`Product[]` array'leri → `Map<string, Category>`, `Map<string, Product[]>` ve `descendantIdsCache` ile O(1) lookup. `getAllDescendantIds` recursive O(n²) → precomputed HashMap |
| **Cart derived state** | `src/store/cart-store.ts` | `totalAmount` ve `itemCount` store state'ine taşındı, action'larla inline güncelleniyor. `selectCartTotal` selector'ı artık compute-on-read değil |
| **useShallow birleştirme** | `app/(tabs)/menu.tsx` | 20+ bağımsız selector → `useShallow` ile 5 gruba indirgendi |
| **WS stabilizasyonu** | `src/hooks/useOrderSync.ts` | `useCallback` → `useRef` pattern. WS sadece `enabled`, `token`, `serverUrl`, `branchId`, `tableId` değişiminde yeniden bağlanır |

### UI Katmanı

| Optimizasyon | Dosya | Açıklama |
|-------------|-------|----------|
| **FlatList getItemLayout** | `src/components/menu/ProductGrid.tsx` | Sabit kart boyutu için `getItemLayout` eklendi, O(1) scroll konumlama. Batch tuning `{10,10,6}`. `key={numColumns}` → sabit key |
| **CategoryRow FlatList** | `src/components/menu/CategoryRow.tsx` | `ScrollView`+`map` → `Animated.FlatList` (virtualized). `scrollEventThrottle: 16→50ms`. `useAnimatedScrollHandler` |
| **CartSheet parçalama** | `src/components/order/` | 630 satır → `CartSheet.tsx` (~280) + `CartList.tsx` + `CartSummaryPanel.tsx` + `CartEmptyState.tsx` + `cart-layout.ts` |
| **Lazy load** | `app/(tabs)/menu.tsx`, `orders.tsx` | `React.lazy(() => import('@/components/order/CartSheet'))` + `<Suspense>` |
| **Image recyclingKey** | `src/components/menu/ProductCard.tsx` | `recyclingKey={product.id}` — FlatList geri dönüşümünde imaj cache korunur |
| **Inline style memo** | `CartSheet.tsx`, `ActiveOrderStrip.tsx` | Shadow/renk stil objeleri `useMemo` ile stabilize |

### Build ve Altyapı

| Optimizasyon | Dosya | Açıklama |
|-------------|-------|----------|
| **Hermes -O flag** | `app.json` | `hermesFlags: ["-O", "-max-dedup-size=64"]`, Android ProGuard, iOS deploymentTarget 15.1 |
| **Metro minifier** | `metro.config.js` | `mangle: { toplevel: true }`, `compress: { passes: 2, unsafe: true }` |
| **usePerformanceMark** | `src/hooks/usePerformanceMark.ts` (yeni) | Dev ortamında 16ms üzeri render'ları log'lar |

### Test Sonuçları
- **Test (2026-08-22):** 19/19 suite, 90/90 test PASS. Wiki’deki “14/16 + 2 kırık” kaydı güncel değil.
- **Yeni testler:** `menuNormalizer.test.ts` — 11 test PASS

## Oturum izolasyonu (2026-08-22)

- **`selectTable`:** `table-store.ts` `_get()` ile önceki masa okunur; masa değişince sepet ve sipariş listesi temizlenir (önceki `get()` ReferenceError sessizce yutuluyordu).
- **Idle timeout:** `IdleTimerProvider.navigateToWelcome` sepeti temizler ve cart sheet’i kapatır. Aktif masa siparişleri (welcome’da gösterim) kasıtlı olarak korunur.
