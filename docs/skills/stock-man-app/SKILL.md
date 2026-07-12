---
name: stock-man-app
description: Project-specific conventions for the Stock Man (Depo & Satınalma) Expo React Native app at mobile_app/stock_man/. Apply when adding features, screens, services, components, store slices, i18n keys, or styling to the Stock Man app. Enforces shared axios client, Zustand + React Query boundaries, NativeWind design tokens, 4-locale i18n, and offline-queue-aware mutations.
applicable_to: mobile_app/stock_man
license: Internal
metadata:
  author: Ramis ERP Architect
  version: "1.0.0"
  references:
    - docs/wiki/Stock_Man_App.md
    - docs/wiki/Mobile_Apps_Family.md
    - docs/wiki/Inventory.md
    - docs/wiki/Warehouse.md
---

# Stock Man — Project Skill

> **Bu skill, Stock Man uygulamasına özel kuralları içerir. Tüm RN/Expo/TS kuralları için `docs/skills/react-native-skills/`, `docs/skills/expo/` ve `docs/skills/react-best-practices/` referans alınır.**

## 1. Mimari Genel Bakış

```
┌──────────────────────────────────────────────────────────────┐
│  Expo Router (app/)   — Stack + Tabs + Modal ekranlar       │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────────────┐
│  src/features/{feature}/  — ekran-bazlı modüller             │
│  src/components/ui/      — paylaşılan atomik bileşenler      │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────────────┐
│  src/services/   — Axios + React Query hook'ları              │
│  src/store/      — Zustand (client state)                    │
│  src/hooks/      — Paylaşılan hook'lar                       │
│  src/lib/        — Yardımcı kütüphaneler                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────────────┐
│  src/api/client.ts  — Tek axios instance + interceptor'lar   │
│  src/api/queryClient.ts — React Query ayarları                │
│  src/features/offline/    — SQLite kuyruk + idempotency      │
└──────────────────────────────────────────────────────────────┘
```

Stock Man **iki katmanlı state** kullanır:

| Katman | Sorumluluk | Teknoloji |
|--------|-----------|-----------|
| **Server state** | API'den gelen veriler, cache, retry, mutation | **TanStack Query (React Query)** |
| **Client state** | Oturum, tema, dil, UI durumu, kuyruk meta | **Zustand** (SecureStore persist) |

**Kural:** API'den gelen hiçbir veri Zustand store'unda tutulmaz; sadece React Query cache'inde yaşar. Zustand yalnızca **client-only** bilgi taşır (seçili şube, UI tercihi, kuyruktaki öğe sayısı vb.).

## 2. Dizin Yapısı (Feature-Folder)

```
mobile_app/stock_man/
├── app/                          # Expo Router — sayfa tanımları
│   ├── (auth)/                   # Auth grup layout (giriş)
│   ├── (main)/                   # Korunan grup — kimlik doğrulama gerekir
│   │   ├── _layout.tsx           # Auth guard + provider zinciri
│   │   ├── (tabs)/               # Alt sekme navigasyonu
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx         # Dashboard
│   │   │   ├── stock.tsx
│   │   │   ├── purchase.tsx
│   │   │   ├── transfers.tsx
│   │   │   └── more.tsx
│   │   ├── stock/[id].tsx        # Stok detay (dinamik route)
│   │   ├── purchase/             # Satınalma akışı
│   │   ├── receiving/            # Tesellüm
│   │   ├── transfer/             # Transfer
│   │   ├── counting/             # Sayım
│   │   ├── deficiency/           # Eksik listesi
│   │   ├── supplier/             # Tedarikçi
│   │   ├── scanner.tsx           # Barkod tarayıcı (modal)
│   │   ├── settings.tsx
│   │   └── expiry.tsx            # SKT ekranı
│   └── _layout.tsx               # Root layout (provider'lar)
│
├── src/
│   ├── api/                      # Axios client + servisler
│   │   ├── client.ts             # Tek axios instance
│   │   ├── queryClient.ts        # React Query config
│   │   └── services/             # Modül servisleri (warehouse.ts, inventory.ts, ...)
│   ├── components/               # Paylaşılan bileşenler
│   │   └── ui/                   # Atomik UI (Button, Card, Input, Badge, ...)
│   ├── features/                 # Feature modülleri
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── stock/
│   │   ├── purchase/
│   │   ├── receiving/
│   │   ├── transfer/
│   │   ├── counting/
│   │   ├── deficiency/
│   │   ├── expiry/
│   │   ├── supplier/
│   │   ├── scanner/
│   │   ├── printing/
│   │   └── offline/              # SQLite kuyruk modülü
│   ├── hooks/                    # Paylaşılan hook'lar
│   ├── i18n/                     # 4-locale JSON sözlükleri + useI18n
│   ├── lib/                      # Yardımcılar (formatters, validators)
│   ├── store/                    # Zustand store'ları
│   ├── types/                    # TypeScript tipleri
│   └── utils/                    # cn(), theme, responsive
│
├── assets/                       # İkonlar, splash, fonts
├── app.json                      # Expo config (apiUrl, bundle id, izinler)
├── eas.json                      # EAS Build profilleri
├── global.css                    # CSS değişkenleri (HSL triplet)
├── tailwind.config.js            # NativeWind token tanımları
├── tsconfig.json                 # TS config (path aliases)
└── babel.config.js
```

### Klasör Açıklamaları

| Klasör | Amaç |
|--------|------|
| `app/` | Sadece **sayfa** ve **layout** tanımları. İş mantığı burada yazılmaz. |
| `src/features/<modül>/` | Modüle özel ekran, hook, servis ve bileşenler. Diğer feature'lara bağımlılık **yasaktır** (sadece `src/components/ui` ve `src/api/services` paylaşılır). |
| `src/components/ui/` | Tüm feature'ların kullanabileceği stateless, tema-duyarlı atomik bileşenler. |
| `src/api/services/` | Her backend modülü için ayrı dosya (örn. `warehouse.ts`, `inventory.ts`). Sadece axios çağrıları + tipler. |
| `src/store/` | Zustand store'ları; her store tek bir domain'den sorumlu. |
| `src/hooks/` | Cross-cutting hook'lar (useNetworkStatus, useDebouncedValue, ...). |

## 3. State Management Kuralları

### 3.1 Server State (React Query)

```typescript
// ✅ DOĞRU — server state için React Query
const { data, isLoading, error } = useQuery({
  queryKey: ['warehouses', branchId],
  queryFn: () => warehousesApi.list({ branchId }),
  staleTime: 30_000,
});

// ✅ DOĞRU — mutation + invalidation
const createPO = useMutation({
  mutationFn: (payload: PurchaseOrderInput) => purchaseOrderApi.create(payload),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  },
});
```

**Kurallar:**

- `queryKey` her zaman `src/api/queryKeys.ts` üzerinden üretilir (sihirli string yok).
- any type kullanılmaz. Mutlaka somut tanımlama yapılır.
- Varsayılan `staleTime: 30s`, `gcTime: 5m`, `retry: 2` (bkz. `src/api/queryClient.ts`).
- Mutation'lar **idempotency** ile sarılır (bkz. §8).
- Offline'da mutation → `offlineQueue.enqueue()` ile kuyruğa alınır (bkz. §8).

### 3.2 Client State (Zustand)

```typescript
// ✅ DOĞRU — sadece client-only bilgi
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      language: 'tr',
      themePreference: 'system',
      setLanguage: (l) => set({ language: l }),
      setThemePreference: (p) => set({ themePreference: p }),
    }),
    {
      name: 'ramis-stockman-ui',
      storage: createJSONStorage(() => SecureStore),
    }
  )
);
```

**Yasak:**

```typescript
// ❌ YANLIŞ — server verisi Zustand'da
const useStocks = create((set) => ({
  items: [],                     // ← API'den geliyor; React Query kullan
  fetch: async () => { ... },
}));
```

### 3.3 Store Listesi

| Store | Domain | Persist | Bağlantılar |
|-------|--------|---------|-------------|
| `useAuthStore` | Oturum, kullanıcı, token | SecureStore | [[Auth_Flow]] |
| `useUIStore` | Dil, tema, son senkron zamanı | SecureStore | [[Internationalization]] |
| `useBranchStore` | Seçili şube ve erişilebilir depolar | SecureStore | [[Branch_Scope]] |
| `useOfflineQueueStore` | Kuyruk durumu, sync durumu | AsyncStorage | §8 |
| `useBackendHealthStore` | Backend erişilebilirlik, son hata | (in-memory) | [[Health_Endpoint]] |

## 4. i18n Kuralları (4 Dil: TR / EN / BG / SQ)

- **Asla hardcoded string.** Tüm kullanıcı metinleri `useI18n()` üzerinden gelir.
- **4 dosya paralel:** `src/i18n/{tr,en,bg,sq}.json`. Yeni anahtar eklenirken **dört dosyaya** da yazılır (eksikse `tr` döner — CI/QA'da tespit için).
- **Namespace** stratejisi: `common`, `auth`, `dashboard`, `stock`, `purchase`, `receiving`, `transfer`, `counting`, `deficiency`, `expiry`, `supplier`, `scanner`, `printing`, `settings`, `errors`.
- **Parametreler:** `{days}`, `{name}` gibi yer tutucular desteklenir.
- **Çeviri dışı kaynak:** Marka adları ("Stock Man", "Ramis ERP") `app.*` namespace'inde ya doğrudan ya da marka policy'si gereği çevrilmeden bırakılır.

```typescript
// ✅ DOĞRU
const { t } = useI18n();
<Text>{t('purchase.title')}</Text>
<Text>{t('transfer.insufficientStock', { name: item.name })}</Text>

// ❌ YANLIŞ
<Text>Satınalma</Text>
```

Detay: [[Internationalization]].

## 5. Stil Kuralları (NativeWind + Design Tokens)

### 5.1 Token Sistemi

Renkler, radius, font boyutları **yalnızca** `tailwind.config.js` üzerinden `var(--*)` token'larına bağlanır. `global.css` HSL triplet formatında değişken tanımlar.

```typescript
// ✅ DOĞRU
<View className="bg-card rounded-lg p-4" />
<Text className="text-h2 text-foreground">Başlık</Text>
<Pressable className="bg-primary active:opacity-80 touch-target" />

// ❌ YANLIŞ
<View style={{ backgroundColor: '#1E40AF' }} />     // raw hex
<View style={{ padding: 16, borderRadius: 8 }} />   // inline style for token
<Text style={{ fontSize: 18, fontWeight: '600' }}>  // typography bypass
```

### 5.2 Dark Mode

- `darkMode: 'class'` — `<View className="dark">` veya `useColorScheme()` ile.
- Her renk token'ının hem light hem dark değeri `global.css`'te tanımlıdır.
- Inline `style={{ color: ... }}` ile karanlık/aydınlık geçişi kırılır — **yasak**.

### 5.3 Tablet / Dokunma Alanı

- Tüm etkileşimli öğeler `min-w-[48px] min-h-[48px]` (`touch-target` sınıfı).
- Liste hücreleri için `min-h-[56px]` tercih edilir.
- Layout breakpoint'leri `useResponsive()` hook'u ile: `phone` (<600), `tablet` (600–1023), `desktop` (≥1024).

Detay: `src/utils/theme.ts`, `src/hooks/useResponsive.ts`.

## 6. API Client Kuralları

- **Asla raw `fetch` veya yeni axios instance.** Her istek `src/api/client.ts` üzerinden.
- **Asla `baseURL` hardcode.** `Constants.expoConfig?.extra?.apiUrl` veya SecureStore'taki `server_url`.
- **Interceptors zaten yönetir:** 401 → logout + redirect, 502/503/504 → retry (max 2).
- **Yeni servis dosyası:** `src/api/services/<domain>.ts` — sadece fonksiyon + tip, hook değil.

```typescript
// ✅ DOĞRU
import apiClient from '@/api/client';
export const warehousesApi = {
  list: (params: ListParams) => apiClient.get('/warehouse/warehouses/', { params }),
  stockLevels: (id: string) => apiClient.get(`/warehouse/warehouses/${id}/stock_levels/`),
};

// ❌ YANLIŞ
const response = await fetch(`${SERVER_URL}/warehouse/warehouses/`, { ... });
const axios = require('axios');
const local = axios.create({ baseURL: '...' });
```

Detay: [[Auth_Flow]], [[API_Client]] (web referansı).

## 7. Bileşen Kuralları

- **TypeScript zorunlu.** `any` yalnızca dış kütüphane tip uyumsuzluğunda + yorum satırıyla.
- **`forwardRef` kullanımı:** Modal, Sheet, Input gibi parent'tan kontrol edilen bileşenlerde.
- **48px dokunma hedefi** — `touch-target` sınıfı veya eşdeğer stil.
- **A11y:** `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` her etkileşimli bileşende. Liste satırlarında `accessibilityRole="button"`.
- **Kompozisyon:** Büyük ekranlar küçük parçalardan oluşur (atomic design). `src/components/ui/` içinde 30 satırı aşan JSX olmamalı; karmaşık mantık feature klasöründe.

## 8. Çevrimdışı Kuyruk (SQLite + Idempotency)

### 8.1 Yapı

- **Depolama:** `expo-sqlite` — `ramis-stockman-queue.db`, tablo `pending_ops`.
- **Trigger:** `AppState === 'active'` + periyodik 30 sn tick + backend health OK.
- **Idempotency:** Her mutation `X-Idempotency-Key: stockman:{op}:{uuid}` header'ı taşır. Backend 409 `IDEMPOTENCY_CONFLICT` dönerse kullanıcıya manuel uzlaşma dialog'u gösterilir.

### 8.2 Kurallar

- **Önce kuyruğa yaz, sonra gönder.** UI anında optimistic update.
- **Başarılı flush** → kuyruktan sil, success toast.
- **Başarısız retry** → exponential backoff (1s/2s/4s/8s, max 5 deneme).
- **Kullanıcı kapatırsa** → kuyruk SQLite'ta kalır; sonraki açılışta `flushPending()` çağrılır.

Detay: [[Stock_Man_App]] (Çevrimdışı bölümü), [[POS_Offline_Queue]] (web/mobil garson).

## 9. Test Kuralları

| Katman | Kapsam | Tool |
|--------|--------|------|
| Servisler (`api/services/*`) | **≥ %90** statement | Jest + msw |
| Hook'lar (`features/*/hooks/*`) | ≥ %80 | @testing-library/react-hooks |
| Bileşenler | Snapshot + interaction smoke | @testing-library/react-native |
| Store'lar | Reducer/state geçişleri | Jest |
| E2E (smoke) | Login + senaryo akışı | Maestro (önerilir) |

**Kural:** Bir PR, servislerde coverage eşiğini düşürüyorsa CI'da kırmızıya düşer.

## 10. Anti-Patterns (Yasaklar)

| ❌ Yasak | ✅ Alternatif |
|----------|---------------|
| `style={{ backgroundColor: '#hex' }}` | `className="bg-primary"` |
| Hardcoded Türkçe/İngilizce string | `useI18n().t('key')` |
| Doğrudan `fetch` / ikinci axios | `apiClient.get(...)` |
| Server verisi Zustand'da | `useQuery({ queryKey, queryFn })` |
| AsyncStorage ile auth/UI persist | `expo-secure-store` (Zustand persist adapter) |
| Mutation'da idempotency header'sız POST | `executeOrEnqueue` wrapper |
| `any` (gerekçesiz) | `unknown` + type guard veya gerçek tip |
| 30 satırı aşan JSX `src/components/ui/` içinde | Feature klasörüne taşı |
| Feature → feature import | `src/components/ui` veya `src/api/services` üzerinden |
| `console.log` prod build'de | `src/lib/logger.ts` (geliştirilecek) |

## 11. Faz Planı

Detaylı faz listesi için → [[Stock_Man_App]] (Bilinen Sınırlar bölümü).

| Faz | İçerik | Durum |
|-----|--------|-------|
| 1 | Altyapı, auth, branch seçimi, tema, i18n, navigasyon iskeleti | ✓ |
| 2 | Dashboard + Stok listesi/detayı + Lotlar + Barkod tarayıcı | planned |
| 3 | Tedarikçi + Satınalma siparişi (CRUD + aksiyonlar) | planned |
| 4 | Tesellüm + Transfer | planned |
| 5 | Sayım + Eksik listesi + Otomatik karşılama | planned |
| 6 | SKT ekranı + Yazıcı entegrasyonu | planned |
| 7 | Çevrimdışı kuyruk, EAS production build | planned |

---
*Bu skill, proje kökündeki `docs/skills/` hiyerarşisine aittir. Genel RN/Expo kuralları için `react-native-skills` ve `expo` skill'lerine bakın.*
