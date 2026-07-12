# Waiter Uygulaması — Hızlı Kazanç & Kritik Altyapı Tasarımı

> **Kapsam:** Performans optimizasyonları, kod kalitesi iyileştirmeleri, WebSocket birleştirme ve Offline queue/SQLite refactor’ü.
> **Hedef:** Mevcut davranışı bozmadan, küçük bağımsız task’larla kullanıcı deneyimi ve sürdürülebilirliği hızla iyileştirmek.

---

## 1. Kapsam ve Sınırlar

### 1.1 Dahil Olanlar

1. **Render / liste performansı**
   - `tables.tsx`, `table-order/[id].tsx`, `ProductCard.tsx`, `OrderProductGridCell.tsx` üzerinde optimizasyonlar.
   - FlashList remount sorunlarının giderilmesi.
   - Inline style ve callback memoization.

2. **Kod kalitesi**
   - ESLint (flat config) + Prettier kurulumu.
   - En yoğun `any` hot-spot’larının `types/models.ts` ile tipilendirilmesi.
   - Dashboard (`app/(main)/index.tsx`) erken return bloklarının alt bileşenlere ayrılması.
   - Inline WebSocket URL/token oluşturma mantığının `src/api/wsUrl.ts` utility’sine taşınması.

3. **WebSocket birleştirme**
   - `useTableSync.ts` (456 satır) ve `useWaiterCallNotifications.ts` (211 satır) içindeki ayrı bağlantıların tek yöneticiye indirgenmesi.
   - Ortak heartbeat, reconnect, stale detection.
   - Kanal bazlı mesaj routing’i (`pos/sync` ve `waiter/calls`).

4. **Offline queue / SQLite refactor**
   - `queueService.ts` sorumluluk ayrımı: orchestration vs execution.
   - `sqliteDb.ts` DB katmanının sadeleştirilmesi; retry/init utility’ye taşınması.
   - Hata işleme ve loglamanın merkezileştirilmesi.

### 1.2 Dahil Olmayanlar

- `usePosStore.ts` gibi büyük store’ların yapısal olarak ikiye/üçe bölünmesi.
- Jest / React Native Testing Library test altyapısı kurulumu.
- UI/UX redesign veya yeni feature’lar.
- Backend API değişiklikleri.

---

## 2. Mevcut Durum ve Tespitler

### 2.1 Büyük Dosyalar

| Dosya | Satır | Sorun |
|-------|-------|-------|
| `app/(main)/table-order/[id].tsx` | 1075 | Sepet, kategori, ürün grid, modaller, sipariş gönderimi hepsi bir arada |
| `app/(main)/table/[id]/index.tsx` | 814 | Masa detayı, sipariş kartları, transfer, iptal, temizlik hepsi bir arada |
| `app/(main)/tables.tsx` | 582 | Zone, arama, grid, PanResponder, badge hepsi bir arada |
| `app/(main)/index.tsx` | 510 | Dashboard, 4+ erken return, health pulse, terminal/shift/network durumları |
| `src/store/usePosStore.ts` | 528 | Cart, UI preferences, API çağrıları, terminal yönetimi karışmış |
| `src/hooks/useTableSync.ts` | 456 | WS bağlantısı, batch, debounce, sound, query cache hepsi bir arada |
| `src/features/offline/sqliteDb.ts` | 375 | DB init retry, serialization, CRUD, hata yutma bir arada |
| `src/features/offline/queueService.ts` | 272 | Queue orchestration, API call, print jobs, retry logic bir arada |

### 2.2 Performans Tespitleri

- `tables.tsx` içinde `FlashList key={columnCount}` var. Ekran döndüğünde tüm liste yeniden mount olur.
- `table-order/[id].tsx` içinde `FlashListAny key={`products-grid-${columnCount}`}` var. Benzer şekilde remount yapar.
- `ProductCard.tsx` dışarıdan aldığı `onPress`, `onLongPress`, `onUpdateQuantity` callback’leri stabilize edilmemişse her render’da değişir ve `memo` etkisiz kalır.
- Dashboard birden fazla erken return ile farklı layout’lar döndürür; her return kopyalanmış header/footer içerir.
- `tables.tsx` içinde `renderTable` bağımlılık dizisi çok kalabalık (`getStatusLabel`, `tableItemStyle`, `isDark`, `cartItemCount` vb.).

### 2.3 Teknik Borç Tespitleri

- `any` kullanımı yaygın; özellikle `tables.tsx`, `table-order/[id].tsx`, `ProductionStatusModal.tsx`, `waiterApi.ts` dönüş tiplerinde.
- Proje kökünde ESLint / Prettier yapılandırması yok.
- `src/features/offline/__tests__` dizini boş; gerçek test yok.
- WebSocket URL’si ve base64 token encoding doğrudan hook içinde oluşturuluyor.
- Offline queue hataları sessizce yutuluyor (`console.warn` ile); merkezi bir hata raporlama yok.

### 2.4 Güvenlik Notu

- `useTableSync.ts` içinde `btoa(token)` ile token gizleniyor ancak bu gerçek bir güvenlik değil. Backend’de kısa ömürlü WS token desteği önerilir, fakat bu tasarım kapsamı dışındadır. Bu fazda token’ın URL construction utility’sine taşınması ve yorumda bu riskin belirtilmesi yeterlidir.

---

## 3. Tasarım

### 3.1 Performans İyileştirmeleri

#### 3.1.1 FlashList Remount Sorunu

**İlke:** `key` prop’u listeyi yeniden mount etmek için kullanılmamalı; sütun sayısı değiştiğinde `numColumns` prop’u yeterlidir.

**Değişiklikler:**
- `tables.tsx`: `key={columnCount}` kaldırılacak. `estimatedItemSize` ve `numColumns` sabit kalacak.
- `table-order/[id].tsx`: `key={`products-grid-${columnCount}`}` kaldırılacak.
- Ekran döndüğünde state korunacak; layout değişiklikleri `useWindowDimensions` ile yönetilecek.

#### 3.1.2 Stil ve Callback Memoization

**İlke:** Render içinde oluşturulan obje/fonksiyonlar her render’da yeni referans oluşturur; `useMemo` / `useCallback` ile sabitlenmeli.

**Değişiklikler:**
- `tableItemStyle`, `productItemWidth`, `columnCount` gibi değerler `useMemo` ile hesaplanacak.
- `getTableCardStyle`, `getStatusColor`, `getStatusLabel` gibi saf fonksiyonlar component dışına taşınacak.
- `renderTable`, `renderProductItem`, `renderCategoryItem` bağımlılıkları azaltılacak; gerekirse `useCallback` ile sarmalanacak.

#### 3.1.3 Liste Öğesi Stabilizasyonu

**İlke:** `React.memo` ile sarmalanmış liste öğeleri, parent render edildiğinde bile değişmeyen prop’lara sahipse yeniden render edilmemeli.

**Değişiklikler:**
- `ProductCard` zaten `memo`; aldığı callback’ler stabilize edilecek.
- `OrderProductGridCell` benzer şekilde optimize edilecek.
- `tables.tsx` içindeki her masa kartı ayrı bir `TableCard` bileşenine çıkarılacak.

### 3.2 Kod Kalitesi İyileştirmeleri

#### 3.2.1 ESLint + Prettier Kurulumu

**Dosyalar:**
- `eslint.config.js` — flat config, TypeScript, React, React Hooks kuralları
- `prettier.config.js` — single quote, 100 karakter satır uzunluğu, trailing comma
- `package.json` script’leri: `lint`, `lint:fix`, `format`

**Kural:** Mevcut kodu toplu fix yapılmayacak. Sadece değişen dosyalar lint kurallarına uygun hale getirilecek.

#### 3.2.2 Tip Güvenliği

**Hot-spot’lar:**
- `tables.tsx`: `table: Table`, `zone: Zone`
- `table-order/[id].tsx`: `product: Product`, `category: Category`
- `ProductionStatusModal.tsx`: `ProductionPlan`, `AvailabilityLine`
- `waiterApi.ts`: dönüş tipleri `T[]` yerine `{ results: T[] } | T[]` union’ı ile belirlenecek; `unwrapList<T>` zaten bu yapıyı destekliyor

**Eylem:** `types/models.ts` genişletilecek (`ProductionPlan`, `AvailabilityLine`, `ApiListResponse<T>` gibi tipler); ilgili dosyalarda `any` yerine kullanılacak.

#### 3.2.3 Dashboard Alt Bileşenleri

**Hedef:** `app/(main)/index.tsx` sadece state composition yapsın; her durum ayrı bileşende render edilsin.

**Yeni bileşenler:**
- `DashboardPosTerminalRequiredView`
- `DashboardNetworkErrorView`
- `DashboardShiftClosedView`
- `DashboardHeader`
- `DashboardStatsCard`
- `DashboardMenuGrid`
- `DashboardActionList`

**Konum:** `src/components/dashboard/` alt dizini.

#### 3.2.4 WebSocket URL Utility

**Yeni dosya:** `src/api/wsUrl.ts`

```ts
export function buildWsUrl(
  baseApiUrl: string,
  path: string,
  params: Record<string, string | null | undefined>,
  token?: string
): string;
```

**İlke:** Hook’lar URL oluşturma detayını bilmemeli; sadece `buildWsUrl(getApiUrl(), '/ws/pos/sync/', { branch_id: branchId }, token)` çağrısı yapsın.

### 3.3 WebSocket Birleştirme

#### 3.3.1 Mevcut Durum

- `useTableSync.ts`: POS sync WS (`/ws/pos/sync/`)
- `useWaiterCallNotifications.ts`: Waiter call WS (`/ws/waiter/calls/`)
- Her ikisi de bağımsız heartbeat, reconnect, stale detection içeriyor.

**Backend doğrulaması:** `apps/branches/routing.py` içinde iki endpoint ayrı consumer’a bağlı:
- `^ws/pos/sync/$` → `PosSyncConsumer`
- `^ws/waiter/calls/$` → `WaiterCallConsumer`

Dolayısıyla fiziksel olarak tek bağlantı mümkün değil. "Birleştirme" ortak client yönetim mantığını paylaşmak anlamına gelir.

#### 3.3.2 Hedef Mimari

**Yeni dosyalar:**
- `src/api/wsClient.ts` — genel WS client
  - `connect(url)`
  - `disconnect()`
  - `send(message)`
  - `onMessage(handler)`
  - `onConnectionChange(handler)`
  - Heartbeat / pong kontrolü
  - Exponential backoff reconnect

- `src/hooks/useUnifiedSync.ts` — tek hook
  - `wsClient.ts` üzerinden iki ayrı fiziksel bağlantıyı yönetir (`/ws/pos/sync/` ve `/ws/waiter/calls/`)
  - `branchId` ve `token` değiştiğinde her iki bağlantıyı da reconnect eder
  - Gelen mesajları `type` alanına göre ilgili handler’a yönlendirir
  - Mevcut debounce/batch mantığını korur

**Kanallar:**
- `pos/sync` kanalı: `table_update`, `kds_refresh`, `order_status_changed`, `menu_catalog_refresh`, `force_disconnect`
- `waiter/calls` kanalı: `waiter_call`, `waiter_call_dismissed`

**Token iletimi:**
- Backend `apps/users/ws_auth.py` hem ham token hem de base64 encode edilmiş `?token=` değerini kabul eder.
- Hem `pos/sync` hem `waiter/calls` için token aynı şekilde query string üzerinden gönderilir.
- Tutarlılık için her iki bağlantıda da `buildWsUrl` token’ı base64 encode edebilir; bu sadece log gizleme amaçlıdır, gerçek güvenlik değildir.

### 3.4 Offline Queue / SQLite Refactor

#### 3.4.1 Mevcut Durum

- `queueService.ts`: orchestration + execution + print jobs + retry logic
- `sqliteDb.ts`: DB init retry + serialization + CRUD
- `useOfflineQueue.ts`: sync cycle + NetInfo listener

#### 3.4.2 Hedef Mimari

**Yeni dosyalar / sorumluluklar:**
- `src/features/offline/queueService.ts` → sadece orchestration
  - `enqueueOperation`
  - `flushOfflineQueue` (trigger)
  - `subscribeOfflineQueue`
  - `getQueueCounts`, `listActiveQueueOperations`

- `src/features/offline/queueExecutor.ts` (yeni)
  - `syncOneOperation`
  - `runDeferredPrints`
  - `isNetworkError`
  - `buildIdempotencyKey`

- `src/features/offline/sqliteDb.ts` → sadece CRUD
  - `dbPutOperation`
  - `dbDeleteOperation`
  - `dbListOperations`
  - `dbGetQueueCountsAggregated`

- `src/features/offline/dbInit.ts` (yeni)
  - `getDatabase()`
  - `_openDatabaseWithRetry()`
  - `initDatabase()`
  - `runSerialized()`

- `src/features/offline/queueErrors.ts` (yeni)
  - `class QueueSyncError extends Error`
  - `class QueueConflictError extends QueueSyncError`
  - Merkezi hata sınıfları

**İlke:** Her dosyanın tek bir sorumluluğu olur; değişim sebepleri birbirinden bağımsız hale gelir.

---

## 4. Veri Akışı

### 4.1 WebSocket Birleştirme Sonrası

```
useUnifiedSync(enabled)
  │
  ├─► wsClient.connect(posSyncUrl)
  │   ├─► onMessage → routeByType
  │   │   ├─► table_update → queueTableUpdateFromWs + scheduleReadyFetch
  │   │   ├─► kds_refresh → bumpTableFromKdsPayload + scheduleKdsInvalidate
  │   │   ├─► menu_catalog_refresh → refreshMenu
  │   │   └─► force_disconnect → setDisconnectModal
  │   └─► heartbeat / reconnect
  │
  └─► wsClient.connect(waiterCallsUrl)  [eğer ayrı endpoint gerekirse]
      ├─► onMessage → routeByType
      │   ├─► waiter_call → addWaiterCall + sound
      │   └─► waiter_call_dismissed → applyWaiterCallDismissed
      └─► heartbeat / reconnect
```

### 4.2 Offline Queue Sonrası

```
executeOrEnqueue
  │
  ├─► online → apiClient.post → deferred prints
  │
  └─► offline → queueService.enqueueOperation
      │
      ▼
  useOfflineQueueState
      │
      ├─► NetInfo / interval trigger
      │
      ▼
  queueService.flushOfflineQueue
      │
      ▼
  queueExecutor.syncOneOperation
      │
      ├─► apiClient.post
      ├─► runDeferredPrints
      └─► sqliteDb.dbDeleteOperation
```

---

## 5. Hata İşleme

### 5.1 Genel İlkeler

- Yeni kodda `console.warn`/`console.error` yerine merkezi hata sınıfları veya en azından tutarlı mesajlar kullanılacak.
- TypeScript `strict` modu açık; yeni kodda `any` kullanımından kaçınılacak.
- Her task’tan sonra `npx tsc --noEmit` çalıştırılacak.

### 5.2 Offline Queue Hataları

- `QueueSyncError`, `QueueConflictError` sınıfları tanımlanacak.
- Ağ hatası (`isNetworkError`) durumunda status `pending` olarak kalacak.
- 409 idempotency conflict durumunda `conflict` status’üne geçilecek.
- `failed` durumunda son hata `lastError` alanında saklanacak ve UI’da gösterilecek.

### 5.3 WebSocket Hataları

- `wsClient.ts` içinde `onerror` ve `onclose` ayrımı net olacak.
- Reconnect exponential backoff max 30 saniye ile sınırlı kalacak.
- Stale detection 95 saniye olarak korunacak.

---

## 6. Doğrulama

### 6.1 Her Task İçin Zorunlu Kontroller

1. `npx tsc --noEmit` → sıfır hata
2. `npx eslint <changed-files>` → sıfır hata (sadece değişen dosyalar)
3. Manuel smoke test:
   - Login → terminal seçim → dashboard yüklenmesi
   - Masa listesi kaydırma + ekran rotasyonu
   - Kategori değiştirme + ürün grid kaydırma
   - Sepete ürün ekleme + sipariş gönderme
   - Offline moda geçiş (airplane mode) + queue sync
   - WebSocket bağlantısı, masa güncellemesi, garson çağrısı

### 6.2 Regresyon Kontrolü

- Mevcut API kontratları değişmeyecek.
- Zustand store action isimleri ve davranışları korunacak.
- Offline queue formatı (SQLite şema) değişmeyecek.

---

## 7. Bağımlılıklar

### 7.1 Yeni Geliştirme Bağımlılıkları

- `eslint`
- `@eslint/js`
- `typescript-eslint`
- `eslint-plugin-react`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`
- `prettier`
- `eslint-config-prettier`
- `eslint-plugin-prettier`

### 7.2 Mevcut Bağımlılıklar

- `expo` ~56.0.13
- `react-native` 0.85.3
- `react` 19.2.3
- `zustand` ^5.0.13
- `@tanstack/react-query` ^5.100.10
- `@shopify/flash-list` 2.3.1
- `expo-sqlite` ~56.0.5

---

## 8. Riskler

| Risk | Olasılık | Etki | Önlem |
|------|----------|------|-------|
| WebSocket birleştirme sırasında mesaj kaybı | Düşük | Yüksek | Mevcut debounce/batch mantığını aynen taşı; aşamalı rollout |
| Offline queue refactor veri kaybı | Düşük | Yüksek | SQLite şemasını değiştirme; sadece kod katmanını ayır |
| FlashList key kaldırma sonrası layout bozulması | Düşük | Orta | Ekran rotasyonunda test et; `numColumns` yeterli |
| ESLint kural seti çok katı olursa ekip engellenir | Orta | Orta | Sadece yeni/değişen dosyalara uygula; mevcut kodu ignore et |

---

## 9. Sonraki Fazlar (Bu Tasarım Dışı)

- `usePosStore.ts` 528 satırlık monolitik store’un cart / preferences / terminal yönetimi olarak bölünmesi.
- Jest + React Native Testing Library kurulumu ve kritik business logic için unit testler.
- Backend’de kısa ömürlü WS token desteği eklenmesi.
- Bundle analizi ve lazy loading optimizasyonları.
