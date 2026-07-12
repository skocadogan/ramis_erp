# Smart Table — Performans Optimizasyonu Tasarım Dokümanı

> **Tarih:** 2026-07-08
> **Branch:** `perf/smart-table-optimization`
> **Kapsam:** Derinlemesine mimari iyileştirme (Seviye C)
> **Hedef platform:** iOS / Android (Expo SDK 57, React Native 0.86, Hermes)

---

## 1. Giriş

Bu doküman, `mobile_app/smart_table` uygulamasının performans optimizasyonu için onaylanmış tasarımı içerir. Uygulama, restoran müşterilerinin QR kod ile masadan menüye erişip sipariş verebildiği bir React Native/Expo mobil uygulamasıdır.

### 1.1 Mevcut Mimari Özeti

| Katman | Teknoloji |
|--------|-----------|
| Framework | Expo SDK 57, React Native 0.86, React 19.2 |
| State | Zustand 5.x (9 store) |
| Styling | NativeWind (Tailwind 3.4) + inline styles |
| Animasyon | react-native-reanimated 4.5 |
| Görüntü | expo-image (memory-disk cache) |
| Gerçek Zamanlı | WebSocket (`/ws/pos/sync/`) + HTTP fallback |
| Test | Jest + Testing Library |

### 1.2 Branch ve Merge Stratejisi

- Tüm değişiklikler **`perf/smart-table-optimization`** branch'inde yapılacak
- Her aşama tamamlandığında test edilecek
- Kullanıcı test edip onayladıktan sonra `main` branch'e merge edilecek

---

## 2. Performans Sorunları ve Kök Nedenler

### 2.1 Veri Katmanı

| # | Sorun | Dosya | Kök Neden | Etki |
|---|-------|-------|-----------|------|
| 2.1.1 | `getAllDescendantIds()` recursive O(n²) | `useMenu.ts` | Her kategori değişiminde tüm ağaç yeniden taranıyor | Her kategori tıklamasında ~2-15ms gecikme |
| 2.1.2 | `filteredProducts` her seferinde tüm array'i tarıyor | `useMenu.ts` | Tüm ürünler `filter()` ile taranıyor (500+ ürün) | Scroll performansını etkiliyor |
| 2.1.3 | `buildLineMap()` her cart işleminde çağrılıyor | `cart-store.ts` | Gereksiz GC baskısı | Sık sepete ekleme/çıkarmada mikro gecikme |
| 2.1.4 | `selectCartTotal` ve `selectCartItemCount` her render'da reduce | `cart-store.ts` | Derived state compute-on-read antipattern | Sepet FAB güncellenirken gereksiz hesaplama |
| 2.1.5 | 20+ zustand selector ayrı subscription | `menu.tsx` | Her selector bağımsız listener | MenuScreen gereksiz re-render |

### 2.2 UI Katmanı

| # | Sorun | Dosya | Kök Neden | Etki |
|---|-------|-------|-----------|------|
| 2.2.1 | `FlatList`'te `getItemLayout` yok | `ProductGrid.tsx` | Scroll pozisyonu tahmini yapılamıyor | Hızlı kaydırmada takılma |
| 2.2.2 | `numColumns` değişince FlatList yeniden mount | `ProductGrid.tsx` | `key={numColumns}` pattern'i | Döndürme/tablet geçişinde tam remount |
| 2.2.3 | `CategoryRow`'da 16ms throttle + sürekli spring | `CategoryRow.tsx` | Gereksiz UI thread yükü | Menü ekranında frame drop |
| 2.2.4 | `CartSheet` 630 satır monolitik | `CartSheet.tsx` | Aşırı büyük component | İlk açılışta gecikme, bundle'a tamamen dahil |
| 2.2.5 | Inline style objeleri her render'da yeniden oluşuyor | `CartSheet.tsx`, `CartItemRow` | `StyleSheet.create` yerine inline | Gereksiz object allocation |

### 2.3 Build ve Bundle

| # | Sorun | Kök Neden | Etki |
|---|-------|-----------|------|
| 2.3.1 | Hermes optimizasyonları varsayılan | `-O` flag kullanılmamış | Başlangıç süresi +%10-15 daha yavaş olabilir |
| 2.3.2 | Bundle analizi yapılmamış | Boyut bilinmiyor | Gereksiz kod bundle'da olabilir |
| 2.3.3 | `lucide-react-native` tree-shaking doğrulanmamış | 1000+ ikon | Kullanılmayan ikonlar bundle'da olabilir |
| 2.3.4 | Ağır component'ler eager load | `CartSheet`, `OrderDetailSheet` | İlk bundle parse süresini artırıyor |

---

## 3. Tasarım

### 3.1 Veri Katmanı — Menü Veri Normalleştirmesi

**Yeni dosya:** `src/services/useMenuNormalized.ts`

```typescript
interface NormalizedMenu {
  categoriesById: Map<string, Category>;
  productsByCategory: Map<string, Product[]>;
  descendantIdsCache: Map<string, Set<string>>;
  rootCategories: Category[];
  childCategories: Map<string, Category[]>;
}
```

**Davranış değişiklikleri:**
- Menü verisi ilk fetch'te normalize edilir, tüm lookup'lar O(1)
- `descendantIdsCache` bir kere hesaplanır, sonsuza kadar cache'lenir
- `filteredProducts` artık `descendantIdsCache.get()` + `productsByCategory` join'i ile çalışır
- Mevcut `useMenu.ts` deprecated edilir, migrasyon sonrası kaldırılır

### 3.2 Veri Katmanı — Zustand Store Optimizasyonları

| Store | Değişiklik |
|-------|-----------|
| `cart-store.ts` | `totalAmount` ve `itemCount` store state'i olarak tutulur, action'larla güncellenir. `buildLineMap` sadece ihtiyaç duyulduğunda çağrılır |
| `menu.tsx` (ekran) | `useShallow` ile selector'lar birleştirilir |
| `order-store.ts` | `useShallow` ile alt slice selector'ları gruplanır |

### 3.3 Veri Katmanı — WebSocket Stabilizasyonu

- `handleWsMessage`, `startSocketHealthChecks`, `stopSocketHealthChecks`, `clearRefetchSchedulers`, `runRefetch` callback'leri `useRef` ile stabilize edilir
- `useOrderSync` dependency array: `[enabled, token, serverUrl, branchId, tableId]`
- WS yeniden bağlanma sadece gerçek parametre değişiminde

### 3.4 UI Katmanı — FlatList Optimizasyonları

**ProductGrid:**
- `getItemLayout` eklenir (kart yüksekliği sabit)
- `key` stratejisi: `"products-grid"` sabitlenir
- `FlashList` entegrasyonu değerlendirilir (conditional: 100+ ürün varsa)
- Batch tuning: `maxToRenderPerBatch=10`, `windowSize=10`, `initialNumToRender=6`

### 3.5 UI Katmanı — CategoryRow FlatList'e Geçiş

- `ScrollView` + `map` → yatay `FlatList`
- `scrollEventThrottle`: 16ms → 50ms
- `onViewableItemsChanged` + `viewabilityConfig` ile pozisyon takibi
- `useAnimatedScrollHandler` ile indicator animasyonu

### 3.6 UI Katmanı — CartSheet Parçalama

```
CartSheet.tsx (630 satır)
    → CartSheet.tsx           (~200 satır)
    → CartItemRow.tsx         (~140 satır) (mevcut, optimize)
    → CartList.tsx            (~30 satır)
    → CartSummaryPanel.tsx    (~120 satır)
    → CartEmptyState.tsx      (~40 satır)
    → cart-layout.ts          (~30 satır)
```

- `CartSheet` lazy load: `React.lazy(() => import('./CartSheet'))`
- Inline style objeleri `useMemo` ile stabilize edilir

### 3.7 UI Katmanı — ProductCard İmaj Optimizasyonu

- `recyclingKey={product.id}` eklenir (FlatList geri dönüşümünde imaj cache korunur)
- `blurhash` `useMemo` ile cache'lenir
- Progressive loading stratejisi

### 3.8 Build — Hermes Optimizasyonları

`app.config.ts` içinde:
```json
{
  "android": {
    "hermesFlags": ["-O", "-max-dedup-size=64"],
    "enableProguardInReleaseBuilds": true
  },
  "ios": {
    "hermesFlags": ["-O", "-max-dedup-size=64"],
    "deploymentTarget": "16.4"
  }
}
```

### 3.9 Build — Bundle Analizi ve Tree-Shaking

- `react-native-bundle-visualizer` ile analiz
- `metro.config.js` minifier yapılandırması
- `lucide-react-native` tree-shaking doğrulaması
- `React.lazy` ile ağır component lazy load

### 3.10 Performans İzleme Altyapısı

- `usePerformanceMark` hook'u (16ms threshold uyarı)
- Geliştirme build'lerinde FPS overlay
- Sentry Performance (production screen transitions)

---

## 4. Test Stratejisi

| Test Tipi | Kapsam |
|-----------|--------|
| **Unit test** | `useMenuNormalized`, `cart-store` derived state, `getItemLayout` hesaplaması |
| **Integration test** | `MenuScreen` render, `CartSheet` açma/kapama, kategori değiştirme |
| **Manual test** | Gerçek cihazda 100+ ürünlü menü scroll, tablet döndürme, WS reconnect |
| **Bundle size** | CI gate: iOS bundle < 5MB |
| **Performance** | FPS ölçümü (geliştirme build), ekran geçiş süreleri |

### 4.1 Regresyon Önleme

- Mevcut tüm testler (`npm test --passWithNoTests`) geçmeli
- TypeScript strict mode: `tsc --noEmit` hatasız
- ESLint: `eslint . --max-warnings 0`
- Expo build: `npx expo export --platform ios` başarılı

---

## 5. Dosya Envanteri

### 5.1 Yeni Dosyalar

| Dosya | Amaç |
|-------|------|
| `src/services/useMenuNormalized.ts` | Normalleştirilmiş menü hook'u |
| `src/hooks/usePerformanceMark.ts` | Performans ölçüm hook'u |
| `src/components/menu/CategoryRowFlatList.tsx` | FlatList tabanlı CategoryRow |
| `src/components/order/CartList.tsx` | Cart FlatList wrapper |
| `src/components/order/CartSummaryPanel.tsx` | Sepet özet paneli |
| `src/components/order/CartEmptyState.tsx` | Boş sepet görünümü |
| `src/components/order/cart-layout.ts` | Tablet/landscape layout hesapları |
| `src/utils/menuNormalizer.ts` | Menü verisi normalleştirme |
| `src/constants/menu-cache.ts` | Menü cache TTL sabitleri |
| `src/store/__tests__/cart-store.test.ts` | Cart store unit testleri |
| `src/services/__tests__/useMenuNormalized.test.ts` | Menü normalizasyon testleri |
| `.github/workflows/perf.yml` | CI performans gate |

### 5.2 Değişecek Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `app/(tabs)/menu.tsx` | useShallow, useMenuNormalized entegrasyonu |
| `app/_layout.tsx` | CartSheet lazy load |
| `src/components/menu/ProductGrid.tsx` | getItemLayout, key stratejisi, batch tuning |
| `src/components/menu/CategoryRow.tsx` | FlatList'e geçiş veya deprecate |
| `src/components/order/CartSheet.tsx` | Parçalara böl, lazy load entegrasyonu |
| `src/components/menu/ProductCard.tsx` | recyclingKey, blurhash memo |
| `src/hooks/useOrderSync.ts` | useRef stabilizasyonu |
| `src/store/cart-store.ts` | Derived state |
| `src/store/order-store.ts` | useShallow uyumluluğu |
| `src/store/order/orderWsSlice.ts` | useRef stabilizasyonu (gerekirse) |
| `metro.config.js` | Minifier yapılandırması |
| `app.config.ts` | Hermes flags, ProGuard |
| `src/components/order/ActiveOrderStrip.tsx` | arePropsEqual |
| `src/components/menu/product-detail/shared.tsx` | Inline style stabilizasyonu |
| `src/services/menuService.ts` | Normalize API response (gerekirse) |

---

## 6. Faz Planı

| Faz | İçerik | Süre |
|-----|--------|------|
| **Faz 1** | Veri Katmanı: `useMenuNormalized`, `cart-store` derived state, `useShallow`, WS stabilizasyonu | 3 gün |
| **Faz 2** | UI Katmanı: `ProductGrid` getItemLayout, `CategoryRow` FlatList, `CartSheet` parçalama, lazy load, imaj optimizasyonu | 4 gün |
| **Faz 3** | Build/Altyapı: Hermes flags, bundle analizi, tree-shaking doğrulama, CI gate, `usePerformanceMark` | 2 gün |
| **Faz 4** | Test & Doğrulama: Unit testler, integration testler, gerçek cihaz testi, regresyon kontrolü | 2 gün |
| **Toplam** | | **~11 iş günü** |

---

*Bu doküman `perf/smart-table-optimization` branch'inde oluşturulmuştur. Tüm implementasyon bu branch'te yapılacak, test ve kullanıcı onayı sonrası `main`'e merge edilecektir.*
