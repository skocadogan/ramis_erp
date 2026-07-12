# Mobile Apps Family (Mobil Uygulama Ailesi)

> **Özet:** Ramis ERP, aynı Django REST backend'i (`/api/v1`) ve WebSocket altyapısını paylaşan üç React Native (Expo SDK 56) uygulamasından oluşur: **Mobile Waiter** (garson el terminali), **Smart Table** (müşteri self-servis tablet) ve **Stock Man** (depo/satınalma tablet). Hepsi ortak desene (expo-router, NativeWind, Zustand, JWT+SecureStore, i18n) sahiptir; her biri farklı kullanıcı senaryosu ve cihaz profiline göre özelleşmiştir.
> **Kütüphaneler:** Expo SDK 56, React Native 0.85.3, TypeScript 6, NativeWind 4, Zustand 5, TanStack Query 5, Axios, expo-secure-store
> **Bağlantılar:** [[Mobile_Waiter_App]], [[Smart_Table]], [[Stock_Man_App]], [[API_Client]], [[Auth_Flow]], [[Internationalization]], [[WebSocket_Architecture]], [[POS_Offline_Queue]]

---

## Karşılaştırma Tablosu

| Özellik | Mobile Waiter | Smart Table | Stock Man |
|---------|---------------|-------------|-----------|
| **Dizin** | `mobile_app/waiter/` | `mobile_app/smart_table/` | `mobile_app/stock_man/` |
| **Odak** | Garson sipariş alma | Müşteri self-servis menü/sipariş | Depo + satınalma operasyonları |
| **Birincil kullanıcı** | Garson (el terminali) | Müşteri (masa tableti) | Depo sorumlusu, satınalma memuru, şef (depo tableti) |
| **Hedef cihaz** | Telefon (5–7") | Tablet (10–13" iPad/Android) | Tablet (10–13" iPad/Android) |
| **Expo SDK** | 56 | 56 | 56 |
| **React Native** | 0.85.3 | 0.85.3 | 0.85.3 |
| **TypeScript** | 6 | 6 | 6 |
| **i18n** | TR / EN / BG / SQ (4 dil) | TR / EN (2 dil) | TR / EN / BG / SQ (4 dil) |
| **State (client)** | Zustand (auth, pos, push) | Zustand (auth, ui, cart, order) | Zustand (auth, ui, branch, queue) |
| **State (server)** | TanStack Query | fetch + Zustand cache (sade) | TanStack Query |
| **API client** | Paylaşılan axios + interceptors | fetch wrapper (lightweight) | Paylaşılan axios + interceptors |
| **WebSocket** | `/ws/waiter/calls/`, `/ws/pos/sync/` | `/ws/orders/`, `/ws/menu/`, `/ws/tables/` | `/ws/warehouse/notifications/` |
| **Çevrimdışı kuyruk** | Var (AsyncStorage; sipariş/ödeme) | Yok (online-only) | Var (SQLite; PO/tesellüm/transfer/sayım/eksik) |
| **Barkod/QR tarayıcı** | Kamera (QR masa açma) | Yok | Kamera (barkod SKU/lot okuma) |
| **Yazıcı entegrasyonu** | Var (istasyon + ödeme fişi) | Yok (sadece sipariş) | Var (PO, transfer, etiket) |
| **Auth** | `/auth/token/` + `/auth/me/` (JWT+SecureStore) | `/auth/token/` (JWT+SecureStore) | `/auth/token/` + `/auth/me/` (JWT+SecureStore) |
| **Birincil backend modülleri** | `orders`, `tables`, `menu`, `shifts`, `waiter-calls` | `menu`, `orders`, `tables`, `waiter-calls` | `warehouse`, `inventory`, `printing`, `branches` |
| **Bildirim tipi** | Push + ses + WS overlay | Toast + WS sync | Toast + WS banner |
| **Vardiya kapısı** | `ShiftGate` (POS terminal seçimi) | Yok (self-servis) | Yok (depocular tek şubede) |
| **Easter egg** | Yok | Menü tab'a 5× hızlı tık → profil | Yok |
| **PanResponder swipe** | Masalarda bölge değişimi | Menüde kategori değişimi | Yok (form-odaklı) |
| **Bundle ID** | `com.ramiserp.waiter` | `com.ramiserp.smarttable` | `com.ramiserp.stockman` |
| **EAS projectId** | `b8a93cb5-…-c575e2612fde` | (kendi projesi) | (kendi projesi — eklenecek) |
| **AGENTS.md** | Var (Expo 55, runtime config notları) | Yok | Yok (skill: `stock-man-app`) |
| **Plan dosyası** | `plan.md` (Faz 1–4) | `smart_table_api.md` | (skill üzerinden) |

---

## Paylaşılan Desenler

Üç uygulama da aşağıdaki ortak desene sahiptir; bu, aynı ekip tarafından sürdürülebilirlik ve yeni uygulama eklemenin hızı için kritik bir karardır.

### 1. Dizin Yapısı

```
mobile_app/<app_name>/
├── app/                  # Expo Router (Stack + Tabs + Modal)
├── src/
│   ├── api/              # Axios/fetch client + servisler
│   ├── components/       # Paylaşılan UI bileşenleri
│   ├── features/         # Feature modülleri (waiter/stock_man)
│   ├── hooks/            # Paylaşılan hook'lar
│   ├── i18n/             # JSON sözlükleri + useI18n
│   ├── lib/              # Yardımcı kütüphaneler
│   ├── services/         # (waiter) — domain servisleri
│   ├── store/            # Zustand store'ları
│   ├── types/            # TypeScript tipleri
│   └── utils/            # cn(), theme, responsive
├── app.json
├── eas.json
├── global.css
├── tailwind.config.js
└── tsconfig.json
```

> Smart Table, `features/` ve `services/` klasörlerini feature-light yapısı nedeniyle kullanmaz; geri kalan waiter/stock_man feature-sliced yaklaşımı benimser.

### 2. Auth (JWT + SecureStore)

- `POST /api/v1/auth/token/` (login) + `POST /api/v1/auth/token/refresh/`
- Token **expo-secure-store**'ta saklanır; bellek içi cache (`_cachedToken`) ile her istekte I/O önlenir.
- 401 → `useAuthStore.logout()` + login'e yönlendirme.
- Sunucu URL'si `server_url` SecureStore anahtarında (statik IP repoya yazılmaz).
- Detay: [[Auth_Flow]] (web tarafı; aynı kontrat).

### 3. i18n (JSON + useI18n)

- `src/i18n/{tr,en,bg,sq}.json` — waiter/stock_man için 4 dil, smart_table için 2 dil.
- `useI18n()` React hook'u, `tSync()` non-React ortamlar için.
- Parametreler `{name}`, `{count}` formatında; `t('key', { name: '...' })`.
- Detay: [[Internationalization]].

### 4. Tema (NativeWind + CSS Variables)

- `global.css` HSL triplet formatında `--background`, `--primary`, vb.
- `tailwind.config.js` her rengi `rgb(var(--*) / <alpha-value>)` ile bağlar.
- Dark mode: `darkMode: 'class'`, `.dark` sınıfı `useColorScheme()` ile.
- **Stock Man** ek olarak: tablet breakpoint (`useResponsive`), 48px touch target.

### 5. State Management (Zustand + React Query / fetch)

- **Tüm uygulamalar:** client state için Zustand (auth, ui, locale).
- **Waiter + Stock Man:** server state için TanStack Query + paylaşılan axios.
- **Smart Table:** server state için basit `fetch` + Zustand cache (daha az feature, offline yok).
- Detay: [[State_Management]] (web + smart_table store'ları).

### 6. API Client

- **Waiter + Stock Man:** `src/api/client.ts` — ortak axios instance:
  - Request interceptor: token + baseURL injection, SecureStore race-condition koruması (`waitForApiReady`).
  - Response interceptor: 502/503/504 retry (max 2), 401 → logout, backend health marking.
  - TTL: 10 sn, retry-after header parsing.
- **Smart Table:** `fetch` wrapper (`apiClient.ts` benzeri isimde ama wrapper).
- Detay: [[API_Client]] (web tarafı; kontrat aynı).

### 7. Backend Bağlantısı

- Aynı Django REST + Channels backend, `/api/v1` prefix.
- Tüm uygulamalar aynı `[[Auth_Flow]]`, `[[RBAC]]`, `[[Branch_Scope]]` kurallarına tabi.
- WebSocket: Daphne (`/ws/...`); yük dağılımı nginx `least_conn` upstream `ramis_daphne`.

### 8. Ortam Konfigürasyonu

- `app.json` → `extra.apiUrl` (placeholder; EAS Secrets ile override)
- `server_url` SecureStore (runtime; kullanıcı tarafından değiştirilebilir)
- Web `[[Runtime_Config]]` ile simetrik: `install.sh` her iki tarafı senkronize eder.

---

## Tip-Specific Farklar

### Mobile Waiter — Garson El Terminali

- **Senaryo:** Garson el terminaliyle masaları yönetir, sipariş alır, ödeme başlatır.
- **Önemli akışlar:**
  - Vardiya kapısı (`ShiftGate`) — uygulama açılışında aktif vardiya + POS terminal seçimi.
  - Bölge (zone) swipe — `PanResponder` ile sağa/sola kaydırma + `zonePositions` ref'i.
  - Masa durumu senkronizasyonu — `useTableSync` WS hook (`table_update`).
  - Garson çağrısı senkronu — `useWaiterCallNotifications` (`/ws/waiter/calls/`) + sesli bildirim.
  - QR ile masa açma (kamera).
  - Çevrimdışı sipariş kuyruğu (AsyncStorage).
- **Performans kritik:** FlashList ile sanal listeler, Reanimated ile hızlı geri bildirim.
- **Dil:** 4 dil (garson çok dilli ekip).
- **Eklenecek / sonraki:** Smart Table ile aynı mimariye taşınabilir mi analizi (birleşik "masa + garson" senaryosu).

### Smart Table — Müşteri Self-Servis Tablet

- **Senaryo:** Müşteri masada oturur, menüden seçer, sipariş verir, garson çağırır.
- **Önemli akışlar:**
  - Idle timer (`useUIStore.idleTimeout`) — uzun süre hareketsizlikte varsayılan ekrana dön.
  - Tema değiştirme (light/dark) — `useUIStore.toggleTheme()`.
  - "Sanal Öne Çıkanlar" kategorisi — backend `isFeatured` ürünleri otomatik gruplanır.
  - 5× tap easter egg — menü tab'ına 2 sn'de 5 tık → gizli profil.
  - Dialog sistemi — native `Alert.alert` yerine tema-uyumlu Modal (`useDialogStore`).
  - PanResponder swipe ile kategori değişimi.
- **Offline:** YOK (Wi-Fi bağımlı; restoran içi LAN). Hata durumunda `useUIStore.offlineMode` toast.
- **Dil:** 2 dil (TR/EN) — yeterli çünkü menü zaten self-servis, personel yardım eder.
- **Performans:** Sanal "Öne Çıkan" kategori, FlashList grid, PanResponder sadece yatay.

### Stock Man — Depo & Satınalma Tableti

- **Senaryo:** Depo sorumlusu tabletle mal kabul eder, satınalma siparişi açar, transfer başlatır, sayım yapar, eksik listelerini yönetir, SKT lotlarını takip eder.
- **Önemli akışlar:**
  - Dashboard KPI'ları — düşük stok, SKT, bekleyen PO, açık transferler, eksik raporlar.
  - Barkod tarayıcı (SKU/lot) — `expo-camera`, çoklu format, haptics.
  - Yazıcı seçimi — `GET /printing/printers/?usage_type=POS` + `print_thermal`.
  - Çevrimdışı kuyruk (SQLite) — PO/tesellüm/transfer/sayım/eksik (5 ayrı tip) için idempotent senkron.
  - 4 dil — Bulgaristan ve Arnavutluk operasyonları için BG/SQ.
  - Satınalma öneri motoru (`purchase-recommendations/`) — tüketim trendi + ufuk günü (web); mobil henüz `horizon_days` kullanmıyor.
  - Geciken PO / fiyat artışı API'leri web depo modülünde — mobil sonraki faz ([[Procurement_Intelligence]]).
  - Otomatik karşılama (`deficiency.auto_fulfill` + `preview_item_actions` / `execute_item_actions`).
  - Tablet layout — `useResponsive` ile ≥1024 dp split-view (planlanmış).
- **Performans:** FlashList uzun tablolar (SKT, hareketler), Reanimated.
- **Çevrimdışı:** SQLite, idempotency, 409 çakışma çözümü, exponential backoff.
- **İzin derinliği:** 30+ RBAC izni (warehouse, inventory, branches, printing, financial).
- **Faz planı:** 7 faz (altyapı → dashboard/stok → PO → tesellüm/transfer → sayım/eksik → SKT/yazıcı → çevrimdışı/build).

---

## Bağlantılar

- [[Mobile_Waiter_App]] — Garson mobil uygulaması (`mobile_app/waiter/`)
- [[Smart_Table]] — Self-servis masa uygulaması (`mobile_app/smart_table/`)
- [[Stock_Man_App]] — Depo & satınalma uygulaması (`mobile_app/stock_man/`)
- [[Auth_Flow]] — JWT kimlik doğrulama
- [[API_Client]] — Web Axios istemcisi (referans)
- [[State_Management]] — Zustand desenleri
- [[Internationalization]] — Çoklu dil
- [[WebSocket_Architecture]] — WS altyapısı
- [[POS_Offline_Queue]] — Çevrimdışı kuyruk sözleşmesi
- [[Runtime_Config]] — Çalışma zamanı konfigürasyonu
- [[Health_Endpoint]] — Backend sağlık kontrolü
- [[Inventory]] — Stok modülü (Stock Man backend)
- [[Warehouse]] — Depo modülü (Stock Man backend)
- [[Orders]] — Sipariş modülü (Waiter/Smart Table backend)
- [[Menu]] — Menü modülü (Smart Table backend)

---
*Bu sayfa, üç mobil uygulamanın mimari INGEST'i sırasında oluşturulmuştur. Yeni bir uygulama eklendiğinde karşılaştırma tablosu güncellenmelidir.*
