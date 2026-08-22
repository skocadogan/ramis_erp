# Stock Man App (Depo & Satınalma Mobil Uygulaması)

> **Özet:** Tablet öncelikli (Android + iPad) React Native Expo uygulaması. Depo operasyonlarını (stok, satınalma, mal kabul, transfer, sayım, eksik listesi, iptal/iade, SKT) yönetir; barkod tarayıcı, çevrimdışı kuyruk, yazıcı entegrasyonu ve 4-dil desteği (TR/EN/BG/SQ) içerir. Hedef kullanıcı depo sorumluları, satınalma yetkilileri ve mutfak şefleridir.
> **Kütüphaneler:** Expo SDK 56, React Native 0.85.3, React 19.2.3, TypeScript 6, NativeWind 4, Zustand 5, TanStack Query 5, Axios, expo-secure-store, expo-sqlite, expo-camera, react-native-wifi-reborn.
> **Bağlantılar:** [[Mobile_Apps_Family]], [[Mobile_Waiter_App]], [[Smart_Table]], [[Inventory]], [[Warehouse]], [[Stock_Return_Cancel]], [[Auth_Flow]], [[RBAC]], [[Branch_Scope]], [[WebSocket_Architecture]], [[Internationalization]], [[State_Management]], [[Frontend_Formatters]], [[Printing]], [[Health_Endpoint]], [[Runtime_Config]]

---

## Özet

Stock Man, Ramis ERP'nin **depo ve satınalma** operasyonlarını yönetmek için geliştirilen bir Expo React Native uygulamasıdır. Aynı Django REST backend'i (`/api/v1`) kullanan [[Mobile_Waiter_App]] (garson) ve [[Smart_Table]] (masa) ile birlikte **üçlü mobil aile**nin üçüncü üyesidir. Bkz. [[Mobile_Apps_Family]].

**Hedef Kitle:** Depo sorumluları, satınalma memurları, mutfak şefleri.
**Hedef Cihaz:** Android tablet ve iPad (telefon uyumlu, tablet optimize).
**Çalışma Modeli:** Yarı çevrimdışı — Wi-Fi koptuğunda kritik işlemler (mal kabul, sayım, transfer, satınalma) SQLite kuyruğa alınır; bağlantı gelince idempotent API ile senkron edilir.

---

## Kütüphaneler (tech stack — package.json)

| Bağımlılık | Versiyon | Amaç |
|------------|----------|------|
| `expo` | ~56.0.11 | SDK yönetimi, native modül çözümlemesi |
| `expo-router` | ~56.2.10 | Dosya tabanlı navigasyon (Stack + Tabs) |
| `expo-secure-store` | ~56.0.4 | Token / sunucu URL / UI tercihi (SecureStore persist) |
| `expo-sqlite` | ~56.0.5 | Çevrimdışı kuyruk DB |
| `expo-camera` | ~56.0.8 | Barkod tarayıcı |
| `expo-build-properties` | ~56.0.18 | Android cleartext, iOS ATS |
| `expo-asset`, `expo-image`, `expo-splash-screen` | 56.x | Varlık yönetimi |
| `expo-constants` | ~56.0.16 | `extra.apiUrl` erişimi |
| `expo-linking`, `expo-status-bar` | 56.x | Derin link, durum çubuğu |
| `react` / `react-dom` | 19.2.3 | UI runtime |
| `react-native` | 0.85.3 | Native runtime |
| `react-native-reanimated` | 4.3.1 | Yüksek performans animasyonlar |
| `react-native-worklets` | 0.8.3 | Reanimated worklet runtime |
| `react-native-safe-area-context` | ~5.7.0 | Çentik / home indicator |
| `react-native-screens` | 4.25.2 | Native stack performansı |
| `react-native-svg` | 15.15.4 | İkonlar / logolar |
| `nativewind` | ^4.2.4 | TailwindCSS → RN |
| `tailwindcss` | 3.4.17 | Utility-first CSS |
| `zustand` | ^5.0.13 | Client state |
| `@tanstack/react-query` | ^5.100.10 | Server state |
| `axios` | ^1.16.1 | HTTP istemcisi |
| `lucide-react-native` | ^1.16.0 | İkon seti |
| `@react-native-async-storage/async-storage` | 2.2.0 | Offline queue meta |
| `@react-native-community/netinfo` | 12.0.1 | Ağ durumu (kuyruk flush trigger) |
| `@shopify/flash-list` | 2.3.1 | Sanallaştırılmış liste |
| `typescript` | ~6.0.3 | Tip güvenliği |

> **Not:** Web garson (waiter) ile aynı Expo SDK 56 ailesi; aynı native plugin zincirini paylaşır.

---

## Mimari Genel Bakış

### Katmanlı Yapı

```
┌──────────────────────────────────────────────────────────────────┐
│                          UI Katmanı                              │
│  app/* (Expo Router)  +  src/components/ui  +  src/features/*   │
│  - NativeWind + Design Tokens  - Tema: light / dark             │
│  - Tablet breakpoint'leri (phone < 600 < tablet < 1024)          │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────────────────┐
│              Servisler & Hook'lar Katmanı                        │
│  src/api/services/* (her modül için ayrı dosya)                  │
│  src/features/*/hooks/* (React Query wrapper'ları)               │
│  src/hooks/* (paylaşılan hook'lar: useResponsive, ...)           │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────────────────┐
│                    State Katmanı                                 │
│  Zustand (client)  ←→  React Query (server)                      │
│  useAuthStore / useUIStore / useBranchStore / useOfflineQueue    │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────────────────┐
│              Ağ & Kalıcılık Katmanı                             │
│  src/api/client.ts (axios + interceptors + retry)                │
│  expo-secure-store (token, ui preferences)                       │
│  expo-sqlite (offline queue DB)                                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                  ┌──────┴──────┐
                  │  Backend   │
                  │  REST API  │
                  │  /api/v1   │
                  │  + WS      │
                  └────────────┘
```

### Feature-Folder Organizasyonu

`mobile_app/stock_man/src/features/<module>/` her modül için **ekran + hook + servis** üçlüsünü barındırır. Feature klasörleri arası doğrudan import **yasaktır**; paylaşılan ihtiyaçlar `src/components/ui` veya `src/api/services` üzerinden karşılanır. Detay: `docs/skills/stock-man-app/SKILL.md`.

#### P3 pilot: `src/features/purchase/`

Satınalma modülü, feature-folder geçişinin **ilk pilotu**dur. Taşınan yapı:

```
src/features/purchase/
├── hooks/usePurchaseOrders.ts      # React Query + offline mutation bridge
├── services/purchaseOrderService.ts
├── components/                     # POCard, POFilterBar, POActionBar, pickers, …
│   └── wizard/                     # new.tsx 4-adım sihirbazı (Step1–4)
└── index.ts                        # public barrel export
```

Geriye dönük uyumluluk için eski yollar **shim** ile korunur:

| Eski import | Shim |
|-------------|------|
| `@/hooks/usePurchaseOrders` | `src/hooks/usePurchaseOrders.ts` → feature re-export |
| `@/services/purchaseOrderService` | `src/services/purchaseOrderService.ts` → feature re-export |
| `@/components/purchase/*` | `src/components/purchase/*.tsx` → feature re-export |

Yeni kod `@/features/purchase` veya `@/navigation/routes` (`routes.purchase.*`) tercih etmeli; diğer modüller (receiving, transfer, …) aynı kalıpla sırayla taşınacaktır.

**Satınalma çevrimdışı akışı:** `useCreatePurchaseOrder` ve `useSubmitPurchaseOrder` mutasyonları `createOfflineMutationFn` ile sarılıdır. Ağ yoksa veya backend sağlıksızsa istek SQLite `pending_ops` kuyruğuna yazılır; `isOfflineQueued` dönüşünde liste invalidation atlanır ve kullanıcıya kuyruk toast'u gösterilir. Bağlantı gelince `flushQueue()` FIFO ile `POST /warehouse/purchase-orders/` ve `POST .../submit/` çağrılarını `X-Idempotency-Key` ile tekrarlar. Detay: [[POS_Offline_Queue]].

**Typed navigasyon:** `src/navigation/routes.ts` — `routes.purchase.list`, `.new`, `.recommend`, `.detail(id)`, `.receivingFromPo(poId)`; purchase ekranlarında `router.push(... as any)` kaldırıldı.

### State Sınırları

| Durum | Teknoloji | Örnek |
|-------|-----------|-------|
| **Server state** (API verisi) | TanStack Query | `useQuery({ queryKey: ['warehouses'], queryFn: ... })` |
| **Client-only state** (oturum, tema, dil, kuyruk meta) | Zustand + SecureStore | `useAuthStore`, `useUIStore`, `useBranchStore` |
| **UI geçici state** (modal, form draft) | React `useState` / `useReducer` | `useState` lokal form state |

### i18n

- 4 dil: **TR** (kaynak), **EN**, **BG**, **SQ**. Sözlükler `src/i18n/{tr,en,bg,sq}.json`.
- `useI18n()` React hook'u, `tSync()` non-React ortamlar (Zustand action'ları, native modüller) için.
- `useUIStore.language` aktif dili tutar; SecureStore'a yazılır.
- Parametreler `{name}`, `{days}` formatında.

Detay: [[Internationalization]] (web referansı, aynı sözlük yapısı).

### Tema (NativeWind + CSS Variables)

- `global.css` HSL triplet formatında `--background`, `--primary`, vb. tanımlar.
- `tailwind.config.js` her rengi `rgb(var(--*) / <alpha-value>)` ile bağlar.
- Dark mode: `darkMode: 'class'`, `.dark` sınıfı `useColorScheme()` ile tetiklenir.
- 3 hazır kart varyantı: `card-elevated`, `card-flat`, `card-bordered`.
- Tipografi: `text-display`, `text-h1..h3`, `text-body`, `text-caption`, `text-mono`.
- Tablet dokunma alanı: `.touch-target` sınıfı (`min-w-[48px] min-h-[48px]`).

### Navigasyon (expo-router)

- **Stack + Tabs + Modal** kompozisyonu.
- **Auth grupları:** `(auth)` → login, `(main)` → korunan ekranlar.
- **(main)/(tabs)** — alt sekme: Dashboard, Stok, Satınalma, Transferler, Eksik, İptal/İade, Daha Fazla.
- **Modal stack** (root): scanner, settings, expiry gibi yardımcı ekranlar.
- `expo-router` parametreleri: `app/(main)/stock/[id].tsx` → `{ id }` typed params.

---

## Modüller / Features (ve Backend Endpoint'leri)

| Feature | Konum | Ana Sorumluluk | Backend Endpoint'leri |
|---------|-------|----------------|------------------------|
| `auth` | `src/features/auth/` | Login, logout, token yönetimi, sunucu seçimi | `POST /auth/token/`, `POST /auth/token/refresh/`, `GET /auth/me/` |
| `branch` | `src/features/branch/` | Şube seçimi, erişilebilir şubeler | `GET /branches/`, `GET /branches/me/assignments/` |
| `warehouse` | `src/features/warehouse/` | Depo listesi, depo bazlı stok seviyeleri | `CRUD /warehouse/warehouses/`, `GET /warehouse/warehouses/{id}/stock_levels/` |
| `stock-item` | `src/features/stock/` | Stok kalemi listesi/detayı, lot yönetimi, FEFO | `CRUD /inventory/stock-items/`, `GET /inventory/stock-items/{id}/lots/`, `GET /inventory/stock-items/expiring_lots/` |
| `supplier` | `src/features/supplier/` | Tedarikçi CRUD, performans özeti | `CRUD /inventory/suppliers/`, `GET /inventory/suppliers/{id}/performance/` |
| `purchase-order` | `src/features/purchase/` | PO yaşam döngüsü (taslak→onay→sipariş→teslim) | `CRUD /warehouse/purchase-orders/`, `POST .../submit/`, `.../approve/`, `.../mark_ordered/`, `.../cancel/`, `.../suggest/`, `.../suggest-preview/`, `.../recalculate-status/` |
| `goods-receiving` | `src/features/receiving/` | Barkodlu mal kabul, lot/SKT kaydı | `CRUD /warehouse/goods-receiving/`, `POST .../complete/`, `POST .../inspect/` |
| `transfer` | `src/features/transfer/` | Depolar arası transfer, sevkiyat | `CRUD /warehouse/transfers/`, `POST .../approve/`, `.../complete/`, `.../cancel/` |
| `stock-counting` | `src/features/counting/` | Sayım oluşturma, satır güncelleme, onay | `CRUD /warehouse/stock-counting/`, `POST .../start/`, `.../finish/`, `.../update_items/`, `.../approve/` |
| `deficiency` | `src/components/deficiency/`, `app/(main)/deficiency/` | Eksik listesi listesi/detay, kalem bazlı aksiyonlar, PO/transfer üretimi | `CRUD /warehouse/deficiency-reports/`, `POST .../approve/`, `.../cancel/`, `.../create_purchase_order/`, `.../create_transfer/`, `GET .../stock_availability/`, `POST .../auto_fulfill/`, `POST .../preview_item_actions/`, `POST .../execute_item_actions/` |
| `return-cancel` | `src/components/return-cancel/`, `app/(main)/return-cancel/` | Depo stok iptal/iade listesi, filtre, kayıt oluşturma ve soft-delete | `GET /inventory/stock-movements/` (`movement_types=RETURN,CANCEL`), `POST /inventory/stock-movements/`, `DELETE .../{id}/`, `GET .../reason-codes/` |

**Eksik listesi UI bileşenleri (2026-06):**

| Bileşen | Dosya | Rol |
|---------|-------|-----|
| `DeficiencyReportsTable` | `src/components/deficiency/DeficiencyReportsTable.tsx` | Sanallaştırılmış tablo + infinite scroll (Transfer deseni) |
| `DeficiencyFilterBar` | `src/components/deficiency/DeficiencyFilterBar.tsx` | Durum chip'leri + arama |
| `DeficiencyItemActionsPanel` | `src/components/deficiency/DeficiencyItemActionsPanel.tsx` | Web `DeficiencyReportDetailModal` kalem aksiyon akışı |
| `DeficiencyCreatedBanner` | `src/components/deficiency/DeficiencyCreatedBanner.tsx` | KDS/otomatik WS `deficiency_created` slide-in uyarı |
| `DeficiencyActionBar` | `src/components/deficiency/DeficiencyActionBar.tsx` | Onay/iptal/PO/transfer (tedarikçi+depo seçici) |

**İptal/iade UI bileşenleri (2026-06):**

| Bileşen | Dosya | Rol |
|---------|-------|-----|
| `ReturnCancelFilterBar` | `src/components/return-cancel/ReturnCancelFilterBar.tsx` | Tip, depo, neden, tedarikçi, tarih ve arama filtreleri |
| `ReturnCancelTable` | `src/components/return-cancel/ReturnCancelTable.tsx` | Sanallaştırılmış tablo + infinite scroll |

| Feature | Konum | Ana Sorumluluk | Backend Endpoint'leri |
|---------|-------|----------------|------------------------|
| `expiry` | `src/components/stock/`, `app/(main)/expiry.tsx` | SKT lot listesi, özet widget, aksiyon kaydı, süresi geçmiş lotlarda otomatik iptal/iade | `GET /inventory/expiry-warnings/`, `GET .../summary/`, `POST .../actions/`, `POST .../auto-return-cancel/`, `GET .../actions/history/`, `GET .../action-types/` |
| `printing` | `src/features/printing/` | Yazıcı listesi, fiş/etiket gönderimi | `GET /printing/printers/`, `POST /reporting/receipts/{slug}/print_thermal/` |
| `scanner` | `src/features/scanner/` | `expo-camera` barkod okutma + lokal lookup | (lokal; sadece `inventoryApi.lookup(barcode)` için API) |
| `offline` | `src/features/offline/` | SQLite kuyruğu, idempotency, NetInfo ile flush | (altyapı; API mutasyonlarına `X-Idempotency-Key` ekler) |

Her modülün API fonksiyonları `src/api/services/<domain>.ts` içinde export edilir; ilgili React Query hook'ları `src/features/<feature>/hooks/` içinde tanımlanır.

---

## Ekran Haritası (Screen Map)

| Route | Dosya | Açıklama |
|-------|-------|----------|
| `/` | `app/index.tsx` | Auth gate (oturum varsa `(main)`, yoksa `(auth)/login`) |
| `/(auth)/login` | `app/(auth)/login.tsx` | Kullanıcı adı/şifre, sunucu seçimi, dil seçimi |
| `/(main)/_layout` | `app/(main)/_layout.tsx` | Auth guard, provider zinciri, branch guard |
| `/(main)/(tabs)/_layout` | `app/(main)/(tabs)/_layout.tsx` | 7 tab tanımı (Dashboard, Stok, Satınalma, Transferler, Eksik, İptal/İade, Daha Fazla) |
| `/(main)/(tabs)/index` | `app/(main)/(tabs)/index.tsx` | Dashboard — KPI'lar, son etkinlikler, hızlı işlemler |
| `/(main)/(tabs)/stock` | `app/(main)/(tabs)/stock.tsx` | Stok listesi (depo/şube filtreli) |
| `/(main)/(tabs)/purchase` | `app/(main)/(tabs)/purchase.tsx` | Satınalma listesi (status chip filtresi) |
| `/(main)/(tabs)/transfers` | `app/(main)/(tabs)/transfers.tsx` | Transfer listesi (kaynak/hedef depo) |
| `/(main)/(tabs)/deficiency` | `app/(main)/(tabs)/deficiency.tsx` | Eksik listesi — filtre + tablo + infinite scroll |
| `/(main)/(tabs)/return-cancel` | `app/(main)/(tabs)/return-cancel.tsx` | İptal ve iadeler — filtre + tablo + infinite scroll |
| `/(main)/(tabs)/more` | `app/(main)/(tabs)/more.tsx` | Tedarikçi, SKT, Ayarlar kısayolları |
| `/(main)/stock/[id]` | `app/(main)/stock/[id].tsx` | Stok detay (lotlar, hareketler, FEFO) |
| `/(main)/stock/lot/[id]` | `app/(main)/stock/lot/[id].tsx` | Lot detay (SKT, miktar, aksiyonlar) |
| `/(main)/purchase/new` | `app/(main)/purchase/new.tsx` | Yeni PO sihirbazı (tedarikçi → kalemler → kaydet) |
| `/(main)/purchase/[id]` | `app/(main)/purchase/[id].tsx` | PO detay, aksiyonlar (submit, approve, mark_ordered, cancel) |
| `/(main)/purchase/recommend` | `app/(main)/purchase/recommend.tsx` | Satınalma öneri motoru (tüketim trendi + min stok) |
| `/(main)/receiving/new` | `app/(main)/receiving/new.tsx` | Yeni mal kabul — PO seç → barkod tara → lot/SKT gir |
| `/(main)/receiving/[id]` | `app/(main)/receiving/[id].tsx` | Tesellüm detay (kabul/ret, lot düzeltme) |
| `/(main)/transfer/new` | `app/(main)/transfer/new.tsx` | Yeni transfer (kaynak/hedef, kalemler, sevkiyat notu) |
| `/(main)/transfer/[id]` | `app/(main)/transfer/[id].tsx` | Transfer detay (approve, complete, cancel) |
| `/(main)/counting/new` | `app/(main)/counting/new.tsx` | Yeni sayım (depo seç → otomatik doldur veya manuel) |
| `/(main)/counting/[id]` | `app/(main)/counting/[id].tsx` | Sayım detay (start, finish, approve) |
| `/(main)/deficiency/index` | `app/(main)/deficiency/index.tsx` | Eksik listesi — filtre + sanallaştırılmış tablo + infinite scroll |
| `/(main)/deficiency/new` | `app/(main)/deficiency/new.tsx` | Manuel eksik listesi oluşturma |
| `/(main)/deficiency/[id]` | `app/(main)/deficiency/[id].tsx` | Eksik detay, kalem bazlı aksiyon önizle/uygula, PO/transfer |
| `/(main)/return-cancel/index` | `app/(main)/return-cancel/index.tsx` | İptal/iade listesi — filtre + sanallaştırılmış tablo + infinite scroll |
| `/(main)/return-cancel/new` | `app/(main)/return-cancel/new.tsx` | Yeni iptal/iade kaydı (RETURN/CANCEL) |
| `/(main)/supplier` | `app/(main)/supplier/index.tsx` | Tedarikçi listesi |
| `/(main)/supplier/[id]` | `app/(main)/supplier/[id].tsx` | Tedarikçi detay (performans, son siparişler) |
| `/(main)/scanner` | `app/(main)/scanner.tsx` | Barkod tarayıcı (modal; kamera izni flow) |
| `/(main)/settings` | `app/(main)/settings.tsx` | Tema, dil, sunucu, depo seçimi, çıkış |
| `/(main)/expiry` | `app/(main)/expiry.tsx` | SKT lot listesi (3/7 gün filtre, aksiyon menüsü) |

> **Tüm detay ekranları `(main)/_layout.tsx` içindeki auth guard'ın arkasındadır; oturum yoksa login'e yönlendirilir.**

---

## RBAC (İzin Kodları)

Bu izinler backend `[[RBAC]]` sisteminden gelir; frontend tarafında `useCan(permission)` helper'ı (örn. `useModulePermissions`) ile kontrol edilir. Eksik izin → ekran kilitli, aksiyon disabled, hata mesajı.

### warehouse

| İzin | Kullanım |
|------|----------|
| `warehouse.view_warehouse` | Depo listesi/detayı |
| `warehouse.manage_warehouse` | Depo oluşturma/düzenleme |
| `warehouse.view_purchase_order` | PO listesi/detayı |
| `warehouse.manage_purchase_order` | PO CRUD + submit/cancel |
| `warehouse.approve_purchase_order` | PO approve |
| `warehouse.place_purchase_order` | `mark_ordered` (sipariş verildi) |
| `warehouse.edit_purchase_order_post_approval` | Onay sonrası düzenleme |
| `warehouse.view_goods_receiving` | Tesellüm listesi/detayı |
| `warehouse.manage_goods_receiving` | Tesellüm CRUD + complete |
| `warehouse.view_transfer` | Transfer listesi/detayı |
| `warehouse.manage_transfer` | Transfer CRUD + complete/cancel |
| `warehouse.approve_transfer` | Transfer approve |
| `warehouse.view_stock_counting` | Sayım listesi/detayı |
| `warehouse.manage_stock_counting` | Sayım CRUD + start/finish/update_items |
| `warehouse.approve_stock_counting` | Sayım approve |
| `warehouse.delete_stock_counting_final` | Onaylanmış sayımı silme (geri alma) |
| `warehouse.view_deficiency_report` | Eksik listesi listesi/detayı |
| `warehouse.manage_deficiency_report` | Eksik CRUD + approve/cancel + create PO/transfer |
| `warehouse.view_purchase_recommendation` | Satınalma öneri listesi |
| `warehouse.commit_purchase_recommendation` | Öneriyi PO'ya dönüştürme |

### inventory

| İzin | Kullanım |
|------|----------|
| `inventory.view_stock_item` | Stok listesi/detayı |
| `inventory.manage_stock_item` | Stok CRUD |
| `inventory.view_stock_movement` | Stok hareketleri |
| `inventory.manage_stock_movement` | Manuel hareket oluşturma |
| `inventory.view_supplier` | Tedarikçi listesi/detayı |
| `inventory.manage_supplier` | Tedarikçi CRUD |
| `inventory.view_category` | Kategori listesi |
| `inventory.manage_category` | Kategori CRUD |
| `inventory.view_stock_unit` | Birim listesi |
| `inventory.manage_stock_unit` | Birim CRUD |
| `inventory.view_allergen` | Allerjen etiketleri (ürün kartında rozet) |
| `inventory.view_expiry_risk` | SKT lot listesi / özet widget |
| `inventory.manage_expiry_action` | SKT aksiyon kaydı (priority_consume vb.) |
| `inventory.view_return_cancel` | İptal/iade listesi ve filtreler |
| `inventory.manage_return_cancel` | İptal/iade kaydı oluşturma ve silme (soft-delete) |

### branches

| İzin | Kullanım |
|------|----------|
| `branches.view_branch` | Şube seçim listesi |
| `branches.manage_branch` | Şube atama (süper kullanıcı) |

### printing

| İzin | Kullanım |
|------|----------|
| `printing.view_printer` | Yazıcı listesi |
| `printing.manage_printer` | Yazıcı CRUD + test print + sync_status |

### financial

| İzin | Kullanım |
|------|----------|
| `financial.view_amount` | Tutar gösterme (PO toplam, supplier.totalSpend) |

> **404 = yasak, 403 = yetki yok.** 401'de `useAuthStore.logout()` + login'e yönlendirme (bkz. `src/api/client.ts`).

---

## API Endpoint Referansı

> Backend rotaları: `/api/v1/`. Tüm yazma istekleri `Content-Type: application/json` ve JWT `Authorization: Bearer <token>` taşır; offline'a düşenler `X-Idempotency-Key` header'ı alır (bkz. [[POS_Offline_Queue]]).

### auth

| Method | Path | Perm |
|--------|------|------|
| POST | `/auth/token/` | (anon) |
| POST | `/auth/token/refresh/` | (anon) |
| GET | `/auth/me/` | authenticated |

### branches

| Method | Path | Perm |
|--------|------|------|
| GET | `/branches/` | `branches.view_branch` |

### warehouse

| Method | Path | Perm |
|--------|------|------|
| GET | `/warehouse/warehouses/` | `warehouse.view_warehouse` |
| POST | `/warehouse/warehouses/` | `warehouse.manage_warehouse` |
| GET | `/warehouse/warehouses/{id}/` | `warehouse.view_warehouse` |
| PATCH | `/warehouse/warehouses/{id}/` | `warehouse.manage_warehouse` |
| GET | `/warehouse/warehouses/{id}/stock_levels/` | `warehouse.view_warehouse` |

### inventory — stock-items

| Method | Path | Perm |
|--------|------|------|
| GET | `/inventory/stock-items/` | `inventory.view_stock_item` |
| GET | `/inventory/stock-items/{id}/` | `inventory.view_stock_item` |
| POST | `/inventory/stock-items/` | `inventory.manage_stock_item` |
| PATCH | `/inventory/stock-items/{id}/` | `inventory.manage_stock_item` |
| GET | `/inventory/stock-items/{id}/lots/` | `inventory.view_stock_item` |
| GET | `/inventory/stock-items/expiring_lots/` | `inventory.view_expiry_risk` (legacy) |

### inventory — suppliers

| Method | Path | Perm |
|--------|------|------|
| GET | `/inventory/suppliers/` | `inventory.view_supplier` |
| GET | `/inventory/suppliers/{id}/` | `inventory.view_supplier` |
| POST | `/inventory/suppliers/` | `inventory.manage_supplier` |
| PATCH | `/inventory/suppliers/{id}/` | `inventory.manage_supplier` |
| GET | `/inventory/suppliers/{id}/performance/` | `inventory.view_supplier` |

### inventory — expiry

| Method | Path | Perm |
|--------|------|------|
| GET | `/inventory/expiry-warnings/` | `inventory.view_expiry_risk` |
| GET | `/inventory/expiry-warnings/summary/` | `inventory.view_expiry_risk` |
| GET | `/inventory/expiry-warnings/action-types/` | `inventory.view_expiry_risk` |
| POST | `/inventory/expiry-warnings/actions/` | `inventory.manage_expiry_action` |
| POST | `/inventory/expiry-warnings/auto-return-cancel/` | `inventory.manage_return_cancel` |
| GET | `/inventory/expiry-warnings/actions/history/` | `inventory.view_expiry_risk` |

### warehouse — purchase-orders

| Method | Path | Perm |
|--------|------|------|
| GET | `/warehouse/purchase-orders/` | `warehouse.view_purchase_order` |
| GET | `/warehouse/purchase-orders/{id}/` | `warehouse.view_purchase_order` |
| POST | `/warehouse/purchase-orders/` | `warehouse.manage_purchase_order` |
| PATCH | `/warehouse/purchase-orders/{id}/` | `warehouse.manage_purchase_order` (onay sonrası: `warehouse.edit_purchase_order_post_approval`) |
| POST | `/warehouse/purchase-orders/{id}/submit/` | `warehouse.manage_purchase_order` |
| POST | `/warehouse/purchase-orders/{id}/approve/` | `warehouse.approve_purchase_order` |
| POST | `/warehouse/purchase-orders/{id}/mark_ordered/` | `warehouse.place_purchase_order` |
| POST | `/warehouse/purchase-orders/{id}/cancel/` | `warehouse.manage_purchase_order` |
| POST | `/warehouse/purchase-orders/suggest/` | `warehouse.view_purchase_order` (öneri listesi) |
| POST | `/warehouse/purchase-orders/suggest-preview/` | `warehouse.view_purchase_order` (öneri önizleme) |
| POST | `/warehouse/purchase-orders/{id}/recalculate-status/` | `warehouse.manage_purchase_order` |
| GET | `/warehouse/purchase-recommendations/` | `warehouse.view_purchase_recommendation` (`?horizon_days=3|7|14` web'de) |
| POST | `/warehouse/purchase-recommendations/commit/` | `warehouse.commit_purchase_recommendation` |

**Web-only (API hazır, mobil UI yok):** `GET /warehouse/procurement-alerts/`, `GET /warehouse/purchase-orders/?overdue=true`, `GET /inventory/stock-items/price-increases/` — bkz. [[Procurement_Intelligence]].

### warehouse — goods-receiving

| Method | Path | Perm |
|--------|------|------|
| GET | `/warehouse/goods-receiving/` | `warehouse.view_goods_receiving` |
| POST | `/warehouse/goods-receiving/` | `warehouse.manage_goods_receiving` |
| GET | `/warehouse/goods-receiving/{id}/` | `warehouse.view_goods_receiving` |
| POST | `/warehouse/goods-receiving/{id}/complete/` | `warehouse.manage_goods_receiving` |
| POST | `/warehouse/goods-receiving/{id}/inspect/` | `warehouse.manage_goods_receiving` |

### warehouse — transfers

| Method | Path | Perm |
|--------|------|------|
| GET | `/warehouse/transfers/` | `warehouse.view_transfer` |
| POST | `/warehouse/transfers/` | `warehouse.manage_transfer` |
| GET | `/warehouse/transfers/{id}/` | `warehouse.view_transfer` |
| POST | `/warehouse/transfers/{id}/approve/` | `warehouse.approve_transfer` |
| POST | `/warehouse/transfers/{id}/complete/` | `warehouse.manage_transfer` |
| POST | `/warehouse/transfers/{id}/cancel/` | `warehouse.manage_transfer` |

### warehouse — stock-counting

| Method | Path | Perm |
|--------|------|------|
| GET | `/warehouse/stock-counting/` | `warehouse.view_stock_counting` |
| POST | `/warehouse/stock-counting/` | `warehouse.manage_stock_counting` |
| GET | `/warehouse/stock-counting/{id}/` | `warehouse.view_stock_counting` |
| POST | `/warehouse/stock-counting/{id}/start/` | `warehouse.manage_stock_counting` |
| POST | `/warehouse/stock-counting/{id}/finish/` | `warehouse.manage_stock_counting` |
| POST | `/warehouse/stock-counting/{id}/update_items/` | `warehouse.manage_stock_counting` |
| POST | `/warehouse/stock-counting/{id}/approve/` | `warehouse.approve_stock_counting` |
| DELETE | `/warehouse/stock-counting/{id}/` | `warehouse.delete_stock_counting_final` (onaylı) |

### warehouse — deficiency-reports

| Method | Path | Perm |
|--------|------|------|
| GET | `/warehouse/deficiency-reports/` | `warehouse.view_deficiency_report` |
| POST | `/warehouse/deficiency-reports/` | `warehouse.manage_deficiency_report` |
| GET | `/warehouse/deficiency-reports/{id}/` | `warehouse.view_deficiency_report` |
| POST | `/warehouse/deficiency-reports/{id}/approve/` | `warehouse.manage_deficiency_report` |
| POST | `/warehouse/deficiency-reports/{id}/cancel/` | `warehouse.manage_deficiency_report` |
| GET | `/warehouse/deficiency-reports/{id}/stock_availability/` | `warehouse.view_deficiency_report` |
| POST | `/warehouse/deficiency-reports/{id}/create_purchase_order/` | `warehouse.manage_deficiency_report` |
| POST | `/warehouse/deficiency-reports/{id}/create_transfer/` | `warehouse.manage_deficiency_report` |
| POST | `/warehouse/deficiency-reports/{id}/auto_fulfill/` | `warehouse.manage_deficiency_report` |
| POST | `/warehouse/deficiency-reports/{id}/preview_item_actions/` | `warehouse.manage_deficiency_report` |
| POST | `/warehouse/deficiency-reports/{id}/execute_item_actions/` | `warehouse.manage_deficiency_report` |

### inventory — stock-movements (return/cancel)

| Method | Path | Perm |
|--------|------|------|
| GET | `/inventory/stock-movements/` | `inventory.view_return_cancel` (filtre: `movement_types=RETURN,CANCEL`) |
| POST | `/inventory/stock-movements/` | `inventory.manage_return_cancel` |
| DELETE | `/inventory/stock-movements/{id}/` | `inventory.manage_return_cancel` |
| GET | `/inventory/stock-movements/reason-codes/` | `inventory.view_return_cancel` |

### printing

| Method | Path | Perm |
|--------|------|------|
| GET | `/printing/printers/` | `printing.view_printer` |
| GET | `/printing/printers/{id}/` | `printing.view_printer` |
| POST | `/printing/printers/{id}/test_print/` | `printing.manage_printer` |
| POST | `/printing/printers/{id}/sync_status/` | `printing.view_printer` |
| POST | `/reporting/receipts/{slug}/print_thermal/` | `reporting.generate_report` (fiş şablonu) |

> Tutar gösterimi için: `financial.view_amount` izni zorunlu; aksi halde değer maskelenir (`***`). Bkz. [[Frontend_Formatters]].

---

## WebSocket

**Kanal:** `/ws/warehouse/notifications/`

| Özellik | Açıklama |
|---------|----------|
| **Auth** | Kısa ömürlü `?ticket=` (`POST /auth/ws-ticket/`); JWT query string’e konmaz |
| **Branch scope** | Query `?branch_id=<uuid>` — çok şubeli kullanıcılar için zorunlu, tek şubelide otomatik |
| **Süper kullanıcı** | `?branch_id` olmadan `warehouse_notifications_global` grubuna bağlanır |
| **Reconnect** | Exponential backoff (1s/2s/4s/.../30s) — `src/api/wsClient.ts` |
| **Heartbeat** | 30 sn ping; koparsa otomatik yeniden bağlan |

### Olaylar (events)

| `type` | Payload | Tüketici |
|--------|---------|----------|
| `deficiency_created` | `{ id, report_number, station_name, branch_name, created_at, status }` | Dashboard KPI, `DeficiencyCreatedBanner`, toast |
| `deficiency_status_changed` | `{ id, report_number, status, station_id, branch_id }` | Eksik detay + liste refetch |
| `stock_low_alert` | `{ warehouse_id, stock_item_id, quantity, minimum_quantity, ... }` | Dashboard KPI, `LowStockBanner` |
| `transfer.status_changed` | `{ deficiency_report_id, transfer_id, transfer_number, status, station_id, branch_id }` | Eksik detay + transfer listesi (`WSPushHost` invalidation) |

> Not: `transfer.status_changed` KDS mutfak gruplarına **ve** `warehouse_notifications_{branch}` / `_global` gruplarına gider (`broadcast_kitchen_transfer_status_changed`). Detay: [[WebSocket_Architecture]], [[Warehouse]].

---

## Çevrimdışı (Offline Queue)

### Mimari

- **Depolama:** `expo-sqlite` — `ramis-stockman-queue.db`, tablo `pending_ops`.
  ```sql
  CREATE TABLE pending_ops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT UNIQUE NOT NULL,
    method TEXT NOT NULL,         -- 'POST' | 'PATCH' | 'DELETE'
    path TEXT NOT NULL,            -- '/api/v1/warehouse/purchase-orders/'
    body TEXT,                     -- JSON.stringify(payload)
    created_at INTEGER NOT NULL,   -- epoch ms
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    status TEXT DEFAULT 'pending'  -- 'pending' | 'in_flight' | 'failed'
  );
  ```
- **Bellek cache:** Zustand `useOfflineQueueStore` — `pendingCount`, `isFlushing`, `lastSyncAt`.
- **Network listener:** `@react-native-community/netinfo` + `AppState` `active`.
- **Idempotency header:** `X-Idempotency-Key: stockman:{op_type}:{uuid}`.
- **Sayım `update_items`:** Sabit `sm:stock-counting:update_items:{id}` kullanılmaz; `stableIdempotencyKey` payload’ı dahil eder. Aynı sayımda farklı kalem güncellemeleri 409 ile yutulmaz. `start` / `finish` / `approve` sabit anahtarları bilinçli (entity başına tek kez).
- **PO birim fiyat (düzenleme):** `financial.view_amount` yoksa `Amount` maskesi; fiyat input’u kapalı, miktar düzenlemesi açık.

### Akış

1. **UI mutasyonu** → `executeOrEnqueue(payload)` (feature hook içinde).
2. **Online + sağlıklı backend:** axios → başarılı → invalidation; başarısız (5xx) → kuyruğa al.
3. **Offline / sağlıksız backend:** doğrudan kuyruğa yaz, optimistic UI.
4. **NetInfo + AppState → 'active'** veya periyodik 30 sn tick → `flushQueue()`.
5. **Flush:** sıralı (FIFO) → 401 → logout; 409 IDEMPOTENCY_CONFLICT → `ReconciliationDialog`; 5xx → exponential backoff (max 5 deneme).
6. **Başarılı flush:** satırı sil, `useOfflineQueueStore.pendingCount--`.

### Sınırlamalar

- Yalnızca **mutasyon** (POST/PATCH/DELETE) kuyruğa alınır. GET'ler cache (React Query) ile yönetilir.
- **Büyük payload** (örn. 50 kalemlik PO) — SQLite sınırı yok ama JSON.stringify ~10 MB önerilen üst sınır.
- **Çakışma çözümü:** 409 IDEMPOTENCY_CONFLICT (aynı anahtar + farklı body) → kullanıcıya dialog ile "Bu işlem daha önce farklı verilerle gönderildi" seçenekleri sunulur (iptal, yeni anahtar ile yeniden dene).

Detaylı kontrat: [[POS_Offline_Queue]] (web/garson ile aynı sözleşme).

---

## Barkod Tarayıcı

- **Modül:** `expo-camera` (`CameraView` + `useCameraPermissions`).
- **Desteklenen formatlar:** `ean13`, `ean8`, `upc_a`, `upc_e`, `code39`, `code128`, `qr`, `pdf417`, `aztec`, `itf14`, `dataMatrix`.
- **İzin flow:** İlk açılışta `CameraView.requestCameraPermissionAsync()` → reddetme durumunda ayarlar yardım ekranı.
- **Tarama:** `onBarcodeScanned` callback → debounce 1500 ms (aynı barkodun arka arkaya tetiklenmesini önler).
- **Lookup:** `inventoryApi.lookupByBarcode(code)` → 1 sonuç → lot seçim ekranına; 0 → "Ürün bulunamadı" toast; çok → eşleşme seçim listesi.
- **Haptic feedback:** `expo-haptics` (varsa) ile kısa titreşim.

---

## Yazıcı Entegrasyonu

- **Yazıcı listesi:** `GET /printing/printers/?usage_type=POS` (POS fişleri) veya `usage_type=KITCHEN` (mutfak).
- **Yazıcı durumu:** `POST /printing/printers/{id}/sync_status/` — tablet için manuel veya periyodik kontrol.
- **Fiş/etiket gönderimi:** `POST /reporting/receipts/{slug}/print_thermal/` body:
  ```json
  {
    "printer_id": 12,
    "context": { "po_number": "PO-2025-0001", "supplier": "...", "lines": [...] },
    "idempotency_key": "stockman:print:po-2025-0001"
  }
  ```
- **Yanıt:** 202 Accepted + `print_job_id` (Celery kuyruğu); 200 (senkron debug); 503 (kuyruk dolu/kapalı).
- **Yazıcı türleri:** `EPSON`, `STAR`, `BIXOLON`, `GENERIC` (ESC/POS uyumlu).

Detay: [[Printing]] (backend, network/USB, Celery `printing` kuyruğu).

---

## Ortam Değişkenleri

### Build-time (app.json)

| Anahtar | Varsayılan | Açıklama |
|---------|-----------|----------|
| `expo.extra.apiUrl` | `http://RAMISSERVER_IP/api/v1` | API temel URL. EAS Secrets / `eas env:branch` ile override. |
| `expo.android.package` | `com.ramiserp.stockman` | Android paketi |
| `expo.ios.bundleIdentifier` | `com.ramiserp.stockman` | iOS bundle ID |
| `expo.ios.supportsTablet` | `true` | iPad layout desteği |
| `expo.ios.infoPlist.NSAppTransportSecurity` | `NSAllowsLocalNetworking=true`, `localhost` istisnası | LAN HTTP bağlantısı |

### Runtime (SecureStore)

| Anahtar | Tip | Açıklama |
|---------|-----|----------|
| `auth_token` | string | JWT access token |
| `auth_refresh_token` | string | JWT refresh token |
| `auth_user` | JSON | Kullanıcı profili (`useAuthStore.user`) |
| `server_url` | string | Aktif API base URL (login ekranından) |
| `saved_servers` | JSON array | Daha önce kullanılan sunucu listesi |
| `useUIStore.language` | enum | `tr` \| `en` \| `bg` \| `sq` |
| `useUIStore.themePreference` | enum | `light` \| `dark` \| `system` |
| `useBranchStore.selectedBranchId` | UUID | Son seçili şube |

### Backend (Django settings — etkileşim noktaları)

| Ayar | Varsayılan | Stock Man Etkisi |
|------|-----------|------------------|
| `JWT_REFRESH_TOKEN_DAYS` | 3 | Oturum süresi |
| `RBAC_CACHE_TTL` | 120 sn | İzin değişikliği yansıması (1 dakikadan kısa) |
| `STOCK_RESERVATION_ENABLED` | True | Sayım/transfer sırasında rezervasyon davranışı |
| `EXPIRY_WARNING_DAYS_DEFAULT` | 3 | SKT widget varsayılan gün penceresi |
| `EXPIRY_WARNING_DAYS_OPTIONS` | `[3, 7]` | SKT filtre seçenekleri |
| `DAPHNE_INSTANCES` | 1–4 | WebSocket paralelliği (depo için ≥2 önerilir) |
| `WS_KDS_STATS_THROTTLE_SECONDS` | 2 | Broadcast throttle (depo WS dahil) |

Detay: [[Backend_Environment]].

---

## Build & Deploy (EAS)

### Profiller (`eas.json`)

| Profil | Amaç | Dağıtım | Android Çıktı |
|--------|------|---------|---------------|
| `development` | Geliştirici cihazında `expo-dev-client` ile çalışma | Internal | `.apk` |
| `preview` | Ekip içi test / QA | Internal | `.apk` |
| `production` | Canlı yayın, otomatik versiyon artışı | Store | `.apk` (Play Store için `.aab`'ye çevrilebilir) |

`cli.version >= 18.13.0`, `appVersionSource: "remote"`, `autoIncrement: true` (production).

### iOS — `app.json`

- `bundleIdentifier: com.ramiserp.stockman`
- `supportsTablet: true` — iPad layout
- `infoPlist.NSAppTransportSecurity`:
  - `NSAllowsLocalNetworking: true`
  - `NSExceptionDomains.localhost.NSExceptionAllowsInsecureHTTPLoads: true`
- Kamera izin metni: `expo-camera.cameraPermission` (TR/EN/BG/SQ karşılığı `src/i18n/{lang}.json` `scanner.*`)

### Android — `app.json`

- `package: com.ramiserp.stockman`
- `usesCleartextTraffic: true` (LAN geliştirme için)
- Permissions: `android.permission.CAMERA`, `android.permission.INTERNET`, `android.permission.ACCESS_NETWORK_STATE` (NetInfo), `android.permission.USE_BIOMETRIC` (opsiyonel, SecureStore için).
- `predictiveBackGestureEnabled: false` (tablet UX)

### Build Komutları

```bash
cd mobile_app/stock_man

# Development (dev-client APK)
eas build --profile development --platform android

# Preview (internal test)
eas build --profile preview --platform android

# Production
eas build --profile production --platform all

# OTA (sadece JS/asset değişikliği)
eas update --branch production --message "Hotfix: PO taslak validator"
```

> **Statik IP'yi repoya yazmayın.** `app.json`'daki `extra.apiUrl` placeholder; gerçek değer `eas env:branch production --value EXPO_PUBLIC_API_URL=...` veya runtime `server_url` SecureStore üzerinden.

---

## Bilinen Sınırlar / Açık Sorular

| Konu | Durum | Notlar |
|------|-------|--------|
| Allergen etiketlerinin POS fişinde basılması | Açık | Web POS tarafında çalışıyor; Stock Man baskı şablonu eklenmeli |
| Print şablonu tasarımcısı (Receipt Designer) | Web-only | Tablet üzerinde görsel tasarım gerekmiyor, sadece `print_thermal` ile seçili şablon kullanılır |
| Çoklu dilde (BG/SQ) form hata mesajları | Kısmi | `errors.*` namespace'i 4 dilde; backend mesajları raw döner, çeviri tablosu tutulmuyor |
| Yazıcı yönetim ekranı (CRUD) | Web-only | Stock Man yalnızca yazıcı listesi + test print kullanır, yazıcı oluşturma web'de |
| Mutfak kapanışı (Kitchen Closing) | Açık | Backend + web UI hazır ([[Kitchen_Closing]]); Stock Man'de ayrı ekran yok |
| Fire raporları (Waste Reports) | Açık | Backend hazır; Stock Man'e eklenecek |
| İptal/iade PDF/Excel export | Web-only | Mobil listede export yok; web `ReturnCancelReportsTab` üzerinden |
| Servis katmanı test coverage gate | Planlanmış | `jest --coverage` + `services/` ≥%90; CI gate eklenecek |
| Push notification (deficiency.created → tablet) | ✅ (toast + banner) | `deficiency_created` WS olayı; native push (FCM/APNs) sonraki faz |
| Tablet landscape split-view | ✅ Tamam | `SplitView` bileşeni (`src/components/ui/SplitView.tsx`); Stock detail ekranı tablet modunda iki panelli (sol: hero + depo seviyeleri, sağ: lotlar + SKT + hareketler). PO/Transfer/Deficiency detayları zaten mevcut. |
| Reanimated 4 + Reanimated worklets uyumu | Doğrulanacak | SDK 56'da `react-native-worklets` 0.8.3 eşleşmesi; build sırasında `babel.config.js` `react-native-worklets/plugin` gerekir |
| Stock Man kendi EAS projectId | ✅ Tamam | `app.json:extra.eas.projectId` = `92e45f2a-d824-4816-a86a-e21af4095c54` mevcut |

---

## Test Durumu

Stock Man P5 sonunda **12 test dosyası, 210+ birim test** ile kapandı. Test
suite `mobile_app/stock_man/__tests__/` altında, `app/` ve `src/` ile yan
yana yaşar.

### Kapsanan Alanlar

| Katman | Dosyalar | Coverage (lines) |
|--------|---------|-----------------|
| `src/lib/format/**` (quantity, currency, date) | 3 test | 98.07% |
| `src/lib/offline/**` (queueService, db) | 1 test | 86–100% |
| `src/store/**` (UI, Permission, BackendHealth) | 3 test | 100% |
| `src/i18n/index.ts` (tSync + useI18n) | 1 test | 100% |
| `src/api/client.ts` (interceptors, helpers) | 1 test | 55% ⚠️ |
| `src/components/ui/{Button,Amount,Dialog}` | 3 test | 86–100% |

**Toplam (2026-08-22):** 15 suite, 228 geçen test.

### Komutlar

```bash
cd mobile_app/stock_man

# Hızlı koşu
npm test

# Coverage raporu (HTML + text)
npm run test:ci
```

### Bilinen Test Sınırlamaları

- **`api/client.ts` response interceptor'ı** `import("@/store/...")`
  dynamic ifadesi içerir. Jest'in default node ortamında bu,
  `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` fırlatır. Testlerde
  request interceptor doğrudan çağrılır; 401 → `refreshToken()` null
  dönüşünde logout + login redirect davranışı `useAuthStore` mock'u ile
  `__tests__/api/client.test.ts` içinde belgelenmiştir.
- **`expo-sqlite` mock'u** in-memory bir `Map<id, Row>` simülasyonu
  yapar; gerçek UNIQUE constraint davranışı sadece davranışsal
  olarak doğrulanır.
- **`formatQuantityWithUnit`:** `(0.5, "g")` → `"0,5 g"`; `(0.5, "kg")` → `"500 g"`. Eski “500 kg” kaydı mevcut kodda repro edilmiyor.

---

## Build Durumu

| Kontrol | Komut | Sonuç |
|---------|-------|--------|
| TypeScript | `npx tsc --noEmit` | ✅ 0 hata |
| ESLint | `npx eslint "src/**/*.{ts,tsx}" "app/**/*.{ts,tsx}"` | ✅ 0 hata, 0 uyarı |
| Jest | `npm test` | ✅ 12 suite, 210+ test, tümü geçiyor |
| EAS CLI | `npx eas --version` | ✅ 18+ (paketli `eas-cli` npm paketi mevcut) |

EAS `eas.json` 3 profil (development, preview, production) içerir;
Android APK çıktısı. iOS profili yok (Stock Man hedefi Android tablet
+ iPad, iOS build ileride eklenecek). EAS projectId `app.json:extra.eas.projectId` altında tanımlıdır.

---

## Faz Tamamlanma Özeti (P0–P5)

| Faz | Kapsam | Durum |
|-----|--------|-------|
| P0 | Konfig + dizin yapısı | ✅ |
| P1 | Tasarım sistemi (CSS, Tailwind, NativeWind) | ✅ |
| P2 | Layouts + auth flow (login, init) | ✅ |
| P3 | Domain modülleri (stock, purchase, receiving) | ✅ |
| P4 | Barkod tarayıcı, haptics, ses | ✅ |
| P5 | EAS yapılandırması + offline kuyruk + testler | ✅ |

**Toplam:** 140 TS/TSX dosyası, ~25K LOC, 8 service, 14 React Query
hook dosyası, 12+ UI kit bileşeni, 6+ feature modülü. 50+ backend
endpoint entegre.

## Yardımcı Fonksiyonlar

### `src/utils/stockMovementDisplay.ts`

Stok hareket tiplerini ve kısaltmalarını göstermek için merkezi yardımcı modül.

| Fonksiyon | Çıktı |
|-----------|-------|
| `getMovementTypeLabel(type, lang)` | Yerelleştirilmiş hareket tipi adı (TR/EN/BG/SQ) |
| `getMovementTypeAbbr(type)` | Kısa kısaltma (örn. `IN`, `OUT`, `RET`, `CNC`) |
| `getMovementTypeColor(type)` | NativeWind renk sınıfı (pozitif/negatif/nötr) |

`ReturnCancelTable`, `StockMovementList` ve ilgili bileşenler bu modülü kullanarak UI tutarlılığını sağlar.

### Çevrimdışı Kuyruk Güncellemeleri (v2)

`src/lib/offline/db.ts` genişletildi — `pending_ops` tablosuna ek alanlar ve sorgular eklendi. `queueService.ts` ve `syncSession.ts` senkronizasyon akışı iyileştirildi; kuyruk drenajında hata yönetimi ve yeniden deneme mantığı güçlendirildi.

---

## İlgili Wiki Sayfaları

- [[Mobile_Apps_Family]] — Üç mobil uygulamanın karşılaştırması
- [[Mobile_Waiter_App]] — Kardeş garson uygulaması (referans)
- [[Smart_Table]] — Kardeş self-servis uygulaması (referans)
- [[Inventory]] — Stok modülü (backend)
- [[Warehouse]] — Depo modülü (backend)
- [[Auth_Flow]] — JWT akışı
- [[RBAC]] — İzin sistemi
- [[Branch_Scope]] — Şube izolasyonu
- [[WebSocket_Architecture]] — WS altyapısı
- [[Internationalization]] — Çoklu dil (web referansı)
- [[State_Management]] — Zustand desenleri (web referansı)
- [[Frontend_Formatters]] — Para/birim formatları
- [[Printing]] — Yazıcı altyapısı
- [[Health_Endpoint]] — Sağlık kontrolü
- [[Runtime_Config]] — Çalışma zamanı konfigürasyonu
- [[POS_Offline_Queue]] — Kuyruk sözleşmesi (web/garson referansı)

---
*Bu sayfa, Stock Man mimari INGEST'i ile oluşturulmuştur. Faz ilerledikçe ekran haritası ve endpoint listesi güncellenecektir.*
