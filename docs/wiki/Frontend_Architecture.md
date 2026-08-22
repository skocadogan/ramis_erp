# Frontend Architecture (Frontend Mimarisi)

> **Özet:** Next.js 16 App Router üzerinde çalışan React 19 uygulaması. TailwindCSS 4, Zustand state yönetimi, TanStack Query, Serwist PWA ve React Compiler ile donatılmıştır.
> **Kütüphaneler:** Next.js 16, React 19, TailwindCSS 4, TypeScript 5
> **Bağlantılar:** [[State_Management]], [[API_Client]], [[UI_Components]], [[PWA]], [[Tech_Stack]], [[WebSocket_Architecture]]

---

## Konum
`frontend/src/`

## Dizin Yapısı

| Dizin | İçerik |
|-------|--------|
| `app/` | Next.js App Router sayfaları ve layout'lar |
| `components/` | Paylaşılan UI ve shell bileşenleri |
| `features/` | Modül bazlı feature dizinleri (18 modül) |
| `hooks/` | Custom React hook'ları |
| `lib/` | API client ([[API_Client]]), WebSocket, yardımcı fonksiyonlar |
| `store/` | Zustand state store'ları |
| `types/` | TypeScript tip tanımları |
| `environments/` | Ortam değişkeni şema ve doğrulaması |

## Layout (`app/layout.tsx`)
- **Font:** Inter (Google Fonts)
- **Dil:** Türkçe (`lang="tr"`)
- **Provider Zinciri:** `Providers` → `SerwistProvider`
- **Tema:** Light/Dark desteği (CSS custom properties)

## Sayfa Rotaları (App Router)

| Rota | Modül |
|------|-------|
| `/` | Ana sayfa (login) |
| `/(auth)` | Kimlik doğrulama |
| `/pos` | POS satış ekranı |
| `/kds` | Mutfak gösterim sistemi |
| `/kds/prep-window` | Login gerektirmeyen istasyon hazırlık kiosk ekranı |
| `/pos/display/[id]` | Müşteri ekranı (`display_token`); edge `PUBLIC_PATHS` + locale öneki |
| `/panel` | Yönetim paneli (kullanıcı, rol, şube, POS ayarları, yazıcılar…) |
| `/dashboard` | Restoran özeti |
| `/admin` | Kalıcı yönlendirme → `/panel` (Django admin öneki ile çakışmayı önler) |
| `/inventory` | Stok yönetimi |
| `/warehouse` | Depo yönetimi |
| `/menu-management` | Menü düzenleme |
| `/recipes` | Reçeteler |
| `/shifts` | Vardiyalar |
| `/sales` | Satış raporları |
| `/invoices` | Faturalar |
| `/reservations` | Rezervasyonlar |
| `/tables` | Masa yönetimi |
| `/production-planning` | Üretim planlaması |
| `/prep-management` | Hazırlık yönetimi |
| `/waiter` | Garson ekranı |
| `/recycle-bin` | Geri dönüşüm kutusu |
| `/offline` | Çevrimdışı sayfa (PWA) |

## Shell Bileşenleri

| Bileşen | İşlev |
|---------|-------|
| `AppShell.tsx` | Ana uygulama kabuğu (Sidebar + Header + Content) |
| `AppSidebar.tsx` | Navigasyon yan menüsü |
| `AppHeader.tsx` | Üst başlık çubuğu |
| `ThemeProvider.tsx` | Tema yönetimi |
| `BackendHealthProvider.tsx` | API sağlık kontrolü |

## Next.js Yapılandırması (`next.config.ts`)
- `poweredByHeader: false` — Güvenlik
- `reactCompiler: true` — Otomatik memoization
- Serwist PWA entegrasyonu
- Güvenlik header'ları (X-Frame-Options, CSP vb.)
- Dinamik API URL'den remote image pattern'leri

## WebSocket istemcisi (`lib/ws/`)

Gerçek zamanlı ekranlar ortak bir katman üzerinden bağlanır; bkz. [[WebSocket_Architecture]].

| Dosya | Rol |
|-------|-----|
| `managedWebSocket.ts` | Bağlantı yaşam döngüsü: exponential backoff (max 30 sn), 30 sn ping, 90 sn stale close |
| `sharedWebSocketHub.ts` | Ref-count ile tek TCP — aynı URL'ye birden fazla abone |
| `authWsUrl.ts` | JWT query ile WS URL üretimi |

**Hub anahtarları (örnek):**

| Anahtar | Rota | Kullanan özellikler |
|---------|------|---------------------|
| `posSyncHubKey` | `/ws/pos/sync/` | POS, masa yönetimi, aktif vardiya |
| `kitchenNotificationsHubKey` | `/ws/kitchen/notifications/` | KDS, panel bildirim çekmecesi, prep |
| `staffNotificationsHubKey` | `/ws/staff/notifications/` | Personel bildirimleri |

Olay geldiğinde çoğu ekran tam HTTP refetch yapar; KDS WS yenilemesi **1 sn debounce** ile birleştirilir ([[Frontend_KDS]]).

## Performans İyileştirmeleri (2026-06-27 & 2026-06-29)

### Query staleTime Optimizasyonları
- **Menü & Şube Verileri:** `usePosDataSync.ts` içindeki branches, zones, categories ve products sorgularına `staleTime: 5 * 60_000` (5 dk) eklenerek gereksiz HTTP istek patlamaları engellendi.
- **Masa Verileri:** Masa durum sorgusuna `staleTime: 60_000` (1 dk) eklendi.

### TableCard Hover Prefetching
- Masa occupied durumundayken masa kartı üzerine hover edildiğinde (`onMouseEnter`), adisyon detayları (`table-orders` query) `prefetchQuery` ile arka planda çekilmeye başlanır. Kullanıcı tıkladığında veri önbellekten anında (0ms) gelir.

### Masa Temizliği İyimser Güncellemeler (Optimistic Updates)
- `useTableCleaningActions.ts` içindeki `startCleaning` ve `finishCleaning` fonksiyonları, sunucu API yanıtını beklemeden masanın durumunu arayüzde `CLEANING` veya `FREE` yapacak şekilde iyimser hale getirildi. Hata durumunda otomatik rollback tetiklenir.

### Dynamic Lazy Imports
- `POSHeader.tsx` içerisindeki ağır ve nadir açılan `ConnectedUsersModal` ve `ProductionStatusModal` modalleri senkron importtan `lazy()` dynamic import yapısına taşındı ve `<Suspense>` ile sarmalandı.

### Prefetch Utility (`lib/prefetch.ts`)
Yeni yardımcı fonksiyon `prefetchOnHover(queryClient, queryKey, queryFn, staleTime=60_000)`. `onMouseEnter` handler'ı olarak bağlanır — kullanıcı bir link/buton üzerine geldiğinde React Query arka planda veriyi önden çeker. Sayfa geçişinde veri zaten cache'te olur.

### Suspense Boundary (`AppShell.tsx`)
`<main>` içindeki `{children}` bir `<Suspense>` boundary ile sarıldı. Fallback: `<PageLoadingState>` — sayfa-level code splitting veya async chunk yüklemesinde boş/flash ekran yerine loading state gösterir.

### Virtual Table Optimizasyonu (`ui/virtual-table.tsx`)
| Optimizasyon | Önce | Sonra |
|---|---|---|
| Scroll throttle | Yok | **100ms debounce** (`lastScrollRef` + `Date.now()`) |
| Overscan | 5 | **3** (daha az sanal satır, bellek tasarrufu) |
| Scroll trigger | 200px | **300px** (daha proaktif infinite scroll) |
| Varsayılan rowHeight | `48` | **`44`** (daha kompakt) |
| `estimateSize` fallback | `rowHeight ?? 48` | `rowHeight` (artık her zaman tanımlı) |
