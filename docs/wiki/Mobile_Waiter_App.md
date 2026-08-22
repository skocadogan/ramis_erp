# Mobile Waiter App (Garson Mobil Uygulaması)

> **Özet:** Garsonların masaları yönetmesi ve sipariş alması için geliştirilen React Native tabanlı mobil uygulama (v0.1.6). Backend API ile tam entegre çalışır ve anlık güncellemeler için WebSocket kullanır. 2026-06-27 itibariyle kurumsal **slate-blue** tasarım diline geçmiştir.
> **Kütüphaneler:** React Native, Expo, NativeWind, Zustand, TanStack Query, Axios.
> **Bağlantılar:** [[Frontend_Waiter]], [[API_Client]], [[Auth_Flow]], [[Orders]], [[Shifts]], [[Branches]], [[WebSocket_Architecture]], [[Allergens]], [[Design_System_v2]], [[POS_Offline_Queue]], [[Mobile_Apps_Family]]

---

## Genel Bakış
Bu uygulama, `frontend/` içerisindeki web tabanlı garson ekranının (`[[Frontend_Waiter]]`) yerel (native) performans ve mobil özelliklerle donatılmış versiyonudur. Restoran içerisindeki el terminalleri ve tabletlerde çalışmak üzere optimize edilmiştir.

## Mimari Yapı
Uygulama `mobile_app/waiter` dizininde bulunur ve **Expo Managed Workflow** kullanır.

### Temel Modüller
- **Kimlik Doğrulama:** JWT tabanlı, `[[Auth_Flow]]` ile uyumlu.
- **Vardiya Yönetimi:** Açık vardiya kontrolü (`[[Shifts]]`).
- **Masa Haritası:** Şubedeki masaların durumunun izlenmesi.
- **Sipariş Akışı:** Ürün seçimi, modifier yönetimi ve mutfağa gönderim (`[[Orders]]`).

## Teknik Detaylar
- **State Management:** Web projesinde olduğu gibi **Zustand** tercih edilmiştir (`usePosStore`, `useAuthStore`).
- **WebSocket:** Masa durumu ve mutfak bildirimleri için `[[WebSocket_Architecture]]` üzerinden anlık veri alır.
- **Design:** `[[Design_System_v2]]` renk ve semantik kurallarına sadık kalınarak NativeWind ile stilize edilmiştir.

## Slate-Blue UI Redesign (v0.1.6 — 2026-06-27)

Uygulama tamamen **slate-blue (#1E2A4A)** kurumsal palete geçirildi — 34 dosyada renk token'ları yenilendi. Eski yeşil/emerald (#5DB075/#10B981) paleti terk edildi.

### Global CSS Token Değişiklikleri (`global.css`)

| Token | Yeni Değer |
|---|---|
| `--primary` | `#1E2A4A` (slate-blue/lacivert) |
| `--primary-foreground` | `#ffffff` |
| `--background` | `#F9F8F6` (sıcak beyaz) |
| `--foreground` | `#1A1816` |
| `--muted-foreground` | `#6B6560` |
| `--destructive` | `#C53030` (derin kırmızı) |
| `--radius` | `14px` |

**Dark mode:** Background `#0F1119`, Primary `#4B6BA8` (açık slate).

### Renk Geçiş Haritası

| Eski | Yeni |
|---|---|
| `#5DB075` / `#10B981` (emerald) | `#1E2A4A` (primary) |
| `bg-emerald-*` | `bg-primary`, `bg-primary/10`, `bg-primary/20` |
| `text-slate-400/500/600` | `text-muted-foreground` veya `text-foreground/80` |
| `bg-slate-*` (açık) | `bg-secondary` veya `bg-muted` |
| `border-slate-100/200` | `border-border` |
| `text-[#BDBDBD]` (16 kez) | `text-muted-foreground` |
| `bg-rose-*` | `bg-destructive`, `text-destructive` |

### NativeWind Uyumluluğu
`text-primary-foreground` NativeWind ile düzgün çözümlenemediği için primary arka plan üzerindeki metinlerde `text-white` kullanılır (3 dosyada 8 satır değişiklik — aynı görsel sonuç, `--primary-foreground` zaten `#ffffff`).

### Bileşen Değişiklikleri
- **Dashboard:** Avatar baş harf dairesi, istatistikler tek kartta, shift durumu `bg-primary/10` rozet
- **Zone hapları:** `rounded-full`, seçili `bg-primary text-white`
- **Sipariş butonları:** Ana aksiyon `bg-primary h-16 rounded-2xl`, iptal `bg-destructive/10 border-destructive/20`
- **Modallar:** CustomDialog success/error token'lı, onay `bg-primary shadow-primary/15`
- **Boş liste durumları:** `bg-muted` daire içinde `#1E2A4A` ikon

## ShiftGate Bileşeni

**Konum:** `mobile_app/waiter/src/components/ShiftGate.tsx`

Uygulama, çocuk bileşenleri renderlamadan önce aktif vardiya kontrolü yapar. Terminal seçilmişse (`posTerminalUuid`) kontrolü terminale özelleştirir:

```typescript
GET /shifts/active/?branch_id={branchId}&terminal_id={posTerminalUuid}
```

- Yanıt `status === "OPEN"` ise çocuk ekranlar gösterilir.
- Aktif vardiya yoksa hata ekranı ile çıkış seçeneği sunulur.
- `effectiveBranchId(user.branchId, activeBranchId)` yardımcı fonksiyonu; seçili şube veya kullanıcının varsayılan şubesini döner.

## Masa Senkronizasyonu

`mobile_app/waiter/src/hooks/useTableSync.ts` — WebSocket bağlantısı üzerinden masa durumu güncellemelerini dinler ve React Query önbelleğine yansıtır. `table_update` olayında **`CLEANING`** durumu ve `cleaning_until` / `cleaning_remaining_seconds` alanları da senkronize edilir.

## Masalar Ekranı (`tables.tsx`)

Konum: `app/(main)/tables.tsx`

Ana masalar ekranı; şubedeki tüm masaları bölge (zone) bazında filtreleyerek grid halinde gösterir.

### Bölge (Zone) Yapısı
- `fetchZones(branchId)` ile bölgeler API'den çekilir.
- `selectedZone` state'i seçili bölge ID'sini tutar.
- `filteredTables` — `selectedZone` ve `searchQuery`'e göre masalar filtrelenir.
- Aktif masası olmayan bölgeler otomatik olarak listeden çıkarılır (`activeZoneIds` set filtresi).

### Bölge Butonları (ZoneRow)
```
[ 🍽️ Ana Salon ] [ 🪟 Balkon ] [ 🎉 Özel Oda ]
```
- Yatay `ScrollView` içinde `Pressable` butonlar.
- `onLayout` ile her butonun `x` pozisyonu `zonePositions` ref'inde saklanır.
- Seçili bölge değişince `zoneScrollRef.scrollTo({ x: pos.x - 16, animated: true })` ile **otomatik kaydırma** yapılır.
- Aktif buton `bg-primary`, pasif buton `bg-transparent` stilindedir.

### Swipe ile Bölge Değiştirme
Masalar grid alanı, React Native **`PanResponder`** API'si ile yatay kaydırma algılar:

| Gesture | Davranış |
|---------|----------|
| **Sola kaydırma** (dx < -60px) | Mevcut bölgenin **sağındaki** bölgeye geçer |
| **Sağa kaydırma** (dx > 60px) | Mevcut bölgenin **solundaki** bölgeye geçer |

**Nasıl çalışır:**
1. `PanResponder.create()` ile `FlashList` sarmalayan `<View {...panResponder.panHandlers}>` tüm masalar alanını kaplar.
2. `onMoveShouldSetPanResponder` sadece yatay hareket dikeyden baskınsa aktive olur → **dikey scroll etkilenmez**.
3. `onPanResponderRelease`'de `dx` değeri `SWIPE_THRESHOLD (60px)` ile karşılaştırılır.
4. Eşik aşılırsa `setSelectedZone(nextZone.id)` ile bölge değişir.
5. Bölge butonları otomatik kayar; `filteredTables` yeniden hesaplanır; `FlashList` güncellenir.

### Masa temizlik (CLEANING)

- **Liste:** `tables.tsx` — `CLEANING` masalar gökyüzü mavisi rozet; detay ekranına gidilir.
- **Detay:** `table/[id]/index.tsx` — Boş masada **Temizlemeye Al**; temizlikte geri sayım + **Hazır (Boş)**.
- **API:** `waiterApi.startTableCleaning` / `finishTableCleaning` → `POST .../start_cleaning/`, `finish_cleaning/`.

Ödeme sonrası otomatik temizlik akışı: [[Orders]], [[Branches]].

## Allerjen uyarısı (ürün kartı)

`src/components/ProductCard.tsx` — API'den gelen `is_allergenic` / `allergens` alanları. İkon sepete ekleme `Pressable`'ından bağımsız konumlandırılır; dialog `order.allergenDialogTitle` / `order.allergenRisk` i18n anahtarlarını kullanır. Bkz. [[Allergens]].

## Garson Çağrısı ve Görüldü Senkronu

Mobil uygulama `useWaiterCallNotifications(enabled)` hook'u ile `/ws/waiter/calls/` kanalına bağlanır. Hook açılışta `GET /waiter-calls/pending/` ile bekleyen çağrıları yükler (WS kaçırılan çağrılar). Rezervasyon saati geldi ve misafir geldi uyarıları da aynı kanaldan gelir ([[Reservation_Alerts]]).

**Desteklenen WS mesajları:**

| `type` | Aksiyon |
|--------|---------|
| `waiter_call` | `useWaiterPosPushStore.addWaiterCall(data)` + ses çal |
| `waiter_call_dismissed` | `useWaiterPosPushStore.applyWaiterCallDismissed({ dismissAll, callIds })` |

Görüldü işareti kullanıcı aksiyonu ile tetiklenir (`TableCallsModal`, `WaiterNotificationOverlay`):
1. Store'dan bildirim anında silinir (optimistik).
2. `waiterApi.dismissWaiterCalls()` → `POST /waiter-calls/dismiss/` çağrısı yapılır.
3. Backend WS üzerinden tüm bağlı istemcilere (`waiter_call_dismissed`) yayınlar.

Detaylar için: [[Waiter_Call_Dismiss]]

## Entegrasyon
Uygulama, backend tarafındaki `[[Branch_Scope]]` kurallarına tabiidir ve her kullanıcı sadece yetkili olduğu şube verilerini görebilir.

## Yazıcı ayarları (istasyon bazlı baskı)

`app/(main)/settings.tsx` — web garson/POS ile hizalı:

| Ayar | Davranış |
|------|----------|
| `autoPrintOrder` | Açıkken sipariş sonrası ürünler `category_station` → admin **KITCHEN** yazıcısına yönlendirilir (`buildStationOrderPrintJobs`). |
| `autoPrintPayment` | Açıkken ödeme fişi için `paymentPrinterId` + `paymentTemplateSlug` (POS yazıcı/şablon) kullanılır. |

Sipariş gönderimi: `app/(main)/table-order/[id].tsx` — `fetchPrinters(..., { usage_type: "KITCHEN" })` ile yazıcı listesi alınır; istasyon başına ayrı fiş basılır. Bkz. [[Printing]], [[Frontend_Waiter]].

## Çevrimdışı sipariş kuyruğu (EPIC-07)

Mobil uygulama internet kesintisinde sipariş almaya devam eder. Bkz. [[POS_Offline_Queue]].

| Bileşen | Konum |
|---------|--------|
| Kuyruk modülü | `src/features/offline/` |
| Provider | `OfflineQueueProvider` — `(main)/_layout.tsx` |
| Sipariş entegrasyonu | `app/(main)/table-order/[id].tsx` → `executeOrEnqueue` |
| Senkron dialog | `SyncProgressModal` — "Veriler sunucuya aktarılıyor" |
| Yerel depolama | AsyncStorage (`ramis-waiter-offline-queue-v1`) |
| Bağlantı göstergesi | `useBackendHealthStore` + mevcut disconnect dialog (ek UI gerekmez) |

**Akış:** Offline sipariş → AsyncStorage → bağlantı gelince reconcile + flush → progress modal → başarılı sync veya kopma halinde offline devam.

## Performans İyileştirmeleri (2026-06-29)

### FlashList estimatedItemSize Entegrasyonu
Hafıza geri dönüşüm (cell recycling) performansını ve kaydırma hızını (frame rate) native düzeyde optimize etmek amacıyla, uygulamada yer alan tüm `@shopify/flash-list` bileşenlerine `estimatedItemSize` tanımlandı:
- **tables.tsx** (Masa listesi): `estimatedItemSize={125}`
- **table-order/[id].tsx** (Ürün listesi): `estimatedItemSize={140}`
- **table-order/[id].tsx** (Kategori listesi): `estimatedItemSize={75}`
- **orders.tsx** (Sipariş listesi): `estimatedItemSize={110}`
- **table/[id]/index.tsx** (Masa detay sipariş satırları): `estimatedItemSize={70}`
- **CartModal.tsx** (Sepet listesi): `estimatedItemSize={80}`
- **ProductionStatusModal.tsx** (Üretim plan listesi): `estimatedItemSize={65}`
- **ReadyItemsModal.tsx** (Hazır ürünler listesi): `estimatedItemSize={80}`
- **TransferTableModal.tsx** (Masa seçim satırları): `estimatedItemSize={55}`

## JWT yenileme ve offline kuyruk (2026-08-22)

- **Refresh:** Login `access` + `refresh` alır; `auth_refresh_token` SecureStore’da. 401 interceptor `POST /auth/token/refresh/` + istek kuyruğu (Stock Man deseni). SimpleJWT `ROTATE_REFRESH_TOKENS` için yeni refresh diske yazılır. Refresh yoksa veya başarısızsa mevcut logout.
- **Stale `syncing`:** Flush, 120 sn’den eski `syncing` satırlarını yeniden işler (crash/kill sonrası kayıp sipariş).
- **SQLite yazma:** `dbPutOperation` hatayı yutmaz; kuyruğa alma başarısızsa UI hata gösterir (sahte “gönderildi” yok).
- **Migration:** AsyncStorage → SQLite geçişi başarısız olursa `MIGRATION_KEY` yazılmaz; bir sonraki erişimde tekrar denenir.

---
*Bu sayfa INGEST operasyonu ile güncellenmiştir.*
