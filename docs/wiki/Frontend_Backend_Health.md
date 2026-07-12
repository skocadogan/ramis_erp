# Backend Health — Sunucu Sağlık İzleme

> **İki ayrı uygulama, iki ayrı mekanizma.** Bu sayfa her ikisini de belgelendirir:
> 1. **Web (Next.js)** — `frontend/` projesi, React Context tabanlı provider
> 2. **Mobil (Expo / React Native)** — `mobile_app/smart_table` projesi, Zustand store + guard bileşeni

- **Bağlantılar:** [[Health_Endpoint]], [[Frontend_Architecture]], [[Smart_Table]], [[Mobile_Waiter_App]]

---

## 1. Web Frontend (Next.js) — `frontend/`

- **Kütüphaneler:** React Context API, fetch
- **Konum:** `frontend/src/components/shell/BackendHealthProvider.tsx`

### Bileşenler

#### `BackendHealthProvider`

React Context sağlayıcısı. `providers.tsx` içinde sarmalanmıştır.

| Özellik | Değer |
|---------|-------|
| **Yoklama aralığı** | 120 saniye |
| **Tetikleyiciler** | `visibilitychange`, `online` / `offline` olayları |
| **Ağ algılama** | `navigator.onLine` (tarayıcı; React Native NetInfo karşılığı) |
| **Endpoint** | `GET /api/v1/health/` |
| **Sağlanan veri** | `{ status: 'checking' \| 'ok' \| 'down', recheck }` |

#### `BackendHealthIndicator`

Üst menüde (AppHeader) gösterilen küçük durum ikonu.

| Durum | Görünüm |
|-------|---------|
| Sağlıklı | 🟢 Yeşil monitör ikonu |
| Erişilemez | 🔴 Kırmızı monitör ikonu |

#### `BackendHealthBanner`

Backend erişilemez olduğunda sayfanın üstünde gösterilen tam genişlikte kırmızı uyarı bandı.

### Hook

```typescript
const { status, recheck } = useBackendHealth();
```

POS offline kuyruğu (`features/pos/offline/connectivity.ts`) bu provider'ın
`healthSnapshot` yayını ile tarayıcı `online`/`offline` olaylarını birleştirerek
çevrimdışı moda geçer; kuyruk flush'ı `getCanSyncNow()` üzerinden tetiklenir.

---

## 2. Mobil — `mobile_app/smart_table/` (Expo / React Native)

> **Müşteri yüzü:** Restoran masalarına kurulu tabletlerde çalışan self-servis
> uygulamasıdır. Ağ kopması modal ile kullanıcıyı uyarır, düzelince otomatik
> kapatır ve siparişleri arka planda yeniler.
> **Kütüphaneler:** Zustand, fetch, React Native `AppState`
> **Bağlantılar:** [[Smart_Table]], [[Mobile_Waiter_App]], [[Auth_Flow]]

### Mimari

İki parçalıdır:

1. **Zustand store** — `useBackendHealthStore` (src/store/useBackendHealthStore.ts)
2. **Koruyucu bileşen** — `ConnectivityGuard` (src/components/ConnectivityGuard.tsx)

`ConnectivityGuard` `app/_layout.tsx` içine monte edilir; uygulamanın
kök katmanında sürekli yaşar, görünür UI yalnızca bağlantı koptuğunda
gösterilir.

### Sabitler (Constants)

| Sabit | Değer | Açıklama |
|-------|-------|----------|
| `HEALTH_INTERVAL_MS` | `30_000` | Sağlıklı durumda periyodik health-check aralığı |
| `FAST_RECHECK_MS` | `10_000` | Down durumunda daha sık recheck (kullanıcı beklerken hızlı toparlanma) |
| `INITIAL_CHECK_DELAY_MS` | `2_000` | İlk health-check öncesi bekleme (auth/UI mount olsun) |
| `MAX_AUTO_LOGIN_ATTEMPTS` | `5` | Token doğrulamasında en fazla deneme sayısı |
| `VALIDATE_TIMEOUT_MS` | `5_000` | Tek seferlik `/auth/me/` timeout süresi |
| `FAIL_THRESHOLD` | `2` | Down işaretlemek için gereken ardışık hata sayısı |

`computeBackoff(attempt)` 2s, 4s, 8s, 16s (16s sonrası sabit) üretir.

### Durum Makinesi

```
                  ┌─────────────────────────────┐
                  │                             │
                  ▼                             │
   ┌──── checking ──────┐  1 hata                │
   │                    ├─────────►  down        │
   │  ok (recordSuccess)│                        │
   │  ◄──────────────┐  │  2 ardışık hata        │
   │                 │  ├─────────►  down        │
   │                 │  │                        │
   │       ┌─  down ─┴──┴──┐                     │
   │       │              │                      │
   │       │ 1 başarılı   │  5 deneme tükendi    │
   │       │ yanıt        │                      │
   │       ▼              ▼                      │
   │      ok           logout()                  │
   │                    + router.replace         │
   │                    '/(auth)/login'          │
   │                                           │
   └──────────────────────────────────────────┘
```

### `useBackendHealthStore` API

```typescript
interface BackendHealthState {
  status: 'checking' | 'ok' | 'down';
  failCount: number;
  lastOkAt: number | null;        // epoch ms

  checkHealth(): Promise<boolean>;   // 5s timeout, in-flight dedup
  recordSuccess(): void;             // status='ok' + lastOkAt = Date.now()
  setStatus(status): void;           // down/checking için (lastOkAt'a dokunmaz)
}
```

`recordSuccess()` başarı anlarının atomik kaydıdır; `setStatus('ok')` ile
aynı etkiyi yapar ama ek olarak `lastOkAt` damgasını günceller ve "zaten
ok" durumunda no-op olur (gereksiz re-render tetiklemez).

`checkHealth()` çağrıları modül kapsamında paylaşılır: aynı anda yalnız
bir HTTP isteği uçar, diğerleri aynı Promise'i döner.

### `ConnectivityGuard` Davranışı

| Olay | Aksiyon |
|------|---------|
| `isAuthenticated` ilk kez `true` | Saklı JWT'yi `/api/v1/auth/me/` ile doğrula. 5 deneme × üstel geri-çekilme. Tükendiyse → login'e at. |
| Token doğrulandı | 30 sn aralıkla `/api/v1/health/` polling başlat |
| `status === 'down'` | Polling aralığı 10 sn'ye düşer |
| `status === 'down'` + güvenli olmayan rota | "Bağlantı Koptu" modal'ı aç |
| `status === 'down'` + güvenli rota (`/` veya `login`) | Modal AÇILMAZ |
| `status === 'down' → 'ok'` geçişi | Modal kapanır + seçili masanın siparişleri arka planda yenilenir |
| `AppState` → `active` | Anında bir `checkHealth()` tetikle |
| Modal "Çıkış Yap" | `await logout()` → `router.replace('/(auth)/login')` |
| Modal "Tekrar Dene" | Token hâlâ geçerliyse `recordSuccess()`, değilse logout + login |

### Güvenli Rotalar (Modal GÖSTERİLMEZ)

`useSegments()` (expo-router) kullanılarak türetilir:

```typescript
const isAuthRoute = segments[0] === '(auth)' || segments.includes('login');
const isIndexRoute = segments.length === 0;   // app/index.tsx → '/'
const isSafeRoute = isAuthRoute || isIndexRoute;
```

> **Not:** `pathname.startsWith('/(auth)')` ÇALIŞMAZ — parantezli grup
> dizinleri URL'ye dahil değildir. Bu yüzden `useSegments()` (segment
> listesi) tercih edilir. Expo Router 56'da `(auth)` grubu `segments[0]`
> olarak görünür; savunma amaçlı `includes('login')` de kontrol edilir.

### Auto-Login Akışı (Token Doğrulama)

`isAuthenticated && serverUrl && !isLoading` koşulu sağlandığında bir kez
başlatılır. Daha sonra auth `false → true` dönerse (yeni login) tekrar
çalışır. Aynı oturumda tekrar çalışmaması için `isRunningRef` koruması
vardır.

```
1 sn bekle (SecureStore otursun)
  ↓
validateStoredToken() ──► /api/v1/auth/me/
  ├─ 200 OK            → recordSuccess()      → BİTTİ
  └─ 401/network/timeout
       ↓
   attempt < 5 ?
     evet → computeBackoff(attempt) sonra tekrar dene
     hayır → logout() + router.replace('/(auth)/login')
```

### Sınırlamalar / Bilinen Eksikler

- **NetInfo entegrasyonu yok:** Cihazın fiziksel ağ bağlantısı
  (WiFi vs Cellular) kontrol edilmiyor; yalnızca HTTP seviyesinde
  yoklama yapılıyor. Kullanıcı bir sonraki turda NetInfo'yu opsiyonel
  olarak ekleyebilir.
- **Offline kuyruğu (bu bileşende) yok:** Health mekanizmasının kendisi
  bağlantı koptuğunda istekleri kuyruğa almaz. Ancak POS modülü kendi
  offline kuyruk sistemine sahiptir ([[POS_Offline_Queue]]); health
  snapshot'ı (`healthSnapshot`) üzerinden çevrimdışı moda geçiş yapılır.
- **WebSocket yeniden bağlanması bu mekanizmadan bağımsızdır:**
  `useOrderSync` kendi backoff stratejisini uygular.

### Test Altyapısı

- `src/store/__tests__/useBackendHealthStore.test.ts` — birim testleri
  (status geçişleri, failCount, lastOkAt, recordSuccess, in-flight dedup)
- `src/components/__tests__/ConnectivityGuard.test.tsx` — entegrasyon
  testleri (modal açma/kapama, route guard, logout akışı, sipariş
  yenileme)

Çalıştırma: `npm test` veya `npm run test:watch`.

---

## Kaynak Dosyalar

- Web (Next.js): [`BackendHealthProvider.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/components/shell/BackendHealthProvider.tsx)
- Mobil (Expo):
  - [useBackendHealthStore.ts](file:///home/sedat/pyProjects/ramis_erp/mobile_app/smart_table/src/store/useBackendHealthStore.ts)
  - [ConnectivityGuard.tsx](file:///home/sedat/pyProjects/ramis_erp/mobile_app/smart_table/src/components/ConnectivityGuard.tsx)
  - [app/_layout.tsx](file:///home/sedat/pyProjects/ramis_erp/mobile_app/smart_table/app/_layout.tsx) — guard'ın monte edildiği kök layout
