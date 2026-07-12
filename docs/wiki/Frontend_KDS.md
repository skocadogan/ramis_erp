# Frontend KDS (Mutfak Gösterim Sistemi)

> **Özet:** Mutfak personeli için gerçek zamanlı sipariş görüntüleme ekranı. İstasyon bazlı filtreleme, sipariş durumu güncelleme ve sesli bildirimler. **Smart Firing v2** (bayrak açıkken): planlı/gecikmiş sol accent, yoğunluk ipucu, kalem menüsünden şimdi başlat / ertele.
> **Kütüphaneler:** React, WebSocket
> **Bağlantılar:** [[Orders]], [[Branches]], [[RBAC]], [[WebSocket_Architecture]], [[Smart_Firing_v2]], [[Inventory]], [[Warehouse]], [[Prep]]

---

## Konum
- **Sayfa:** `frontend/src/app/kds/`
- **Feature:** `frontend/src/features/kds/` (varsa)

## Özellikler
- İstasyon bazlı sipariş filtreleme
- **Tasarım Sistemi v2:** Tam tema (Açık/Koyu/Kontrast) ve yoğunluk (Density) desteği.
- PENDING → PREPARING → READY durum geçişleri
- Smart Firing zamanlama desteği (`scheduled_start_time` geri sayım)
- Smart Firing v2 UI ve operatör aksiyonları (bk [[Smart_Firing_v2]]): `OrderCard.tsx`, `kdsApi` (`firing/force-now`, `firing/snooze`)
- Gerçek zamanlı WebSocket güncellemeleri (`kitchenNotificationsHubKey` — paylaşımlı hub)
- **Geri çağır drawer (2025-05):** Alt banttan açılan `KdsRecallDrawer` — servise gönderilmiş (`READY` / `DELIVERED`) kalemler; geri çağırma ve iptal (POS/garson ile aynı API). Bkz. [[Orders#KDS geri çağır]].
- **Performans Optimizasyonu (Yoğun Sipariş Yükü Altında):**
  - **Optimistic UI Updates:** Kullanıcı butonlara tıkladığında, API yanıtı beklemeden `orders` state'i anında güncellenerek KDS ekranında anlık tepki süresi (response time) sağlanır.
  - **WS refetch debounce (1 sn):** `orders_updated` / `kds_refresh` / `order_status_changed` ardışık geldiğinde `fetchOrders` tek seferde birleştirilir (`useKdsData.ts`).
  - **Durum güncelleme debounce (400 ms):** Toplu "Tümünü İşaretle" sonrası API yanıtlarından gelen ek `fetchOrders` çağrıları birleştirilir.
  - **Prep-only refresh filtresi:** Yalnız `prep_update` alt tipindeki `kds_refresh` olayları sipariş listesini yenilemez (prep ekranı ayrı dinler).
  - **Memoization:** `groupKdsOrders` dönüşümleri `useMemo` ile korunur.

## Geri çağır drawer

| Dosya | Rol |
|-------|-----|
| `components/KdsBottomBand.tsx` | Alt bant — drawer aç/kapa, bekleyen kalem rozeti |
| `components/KdsRecallDrawer.tsx` | Gönderilen sipariş listesi, geri çağır / iptal |
| `hooks/useKdsRecall.ts` | Liste yenileme, iptal hedefi, API çağrıları |
| `services/kdsApi.ts` | `fetchKdsRecallList`, `postKdsRecallItem`, iptal yardımcıları |

Süre penceresi: `KDS_RECALL_WINDOW_MINUTES` ([[Backend_Environment]], [[Orders#KDS geri çağır]]).

## KDS kalem kapsamı (istasyon ataması)

Backend: `backend/apps/orders/kds_item_scope.py` — `user_may_kds_line_item_by_assignment()`.

`orders.view_kds` yetkisi olan ve `branches.manage_station` / `orders.manage_order` / süper kullanıcı **olmayan** aşçılar:

| Durum | Davranış |
|-------|----------|
| `CookStationAssignment` yok veya istasyon listesi boş | KDS durum güncellemesi **reddedilir** |
| `order_item.station_id` NULL | Ataması olan tüm aşçılar güncelleyebilir (ortak kalem) |
| İstasyon atanmış kalem | Yalnızca atanan istasyonlar listesindeki istasyon |

Kontrol noktaları: `OrderViewSet` kalem durum PATCH'leri (`enforce_waiter_order_item_scope` garson hattı için ayrı). Regresyon: `backend/core/tests/test_branch_scope.py` (`TestKdsBranchScopeSecurity`).

`useKdsData` ve `OrderCard` optimistic güncelleme sonrası 403 alınırsa liste WS/refetch ile senkron kalır.

## İstasyon Hazırlık Ekranı (Station Display)

`/kds/station-display/[stationId]` — KDS header'ındaki **Monitor** butonuyla yeni tarayıcı penceresinde açılan büyük ekran modu.

| Özellik | Detay |
|---------|-------|
| Sayfa | `app/kds/station-display/[stationId]/page.tsx` |
| Auth | `AuthGuard module="kds"` — mevcut KDS oturumu yeni sekmede otomatik çalışır |
| WebSocket | `kitchenNotificationsHubKey(branchId)` — `prep_updated` / `kds_refresh[prep_update]` olayları; `onOpen` her bağlantıda `fetchTasks()` çağırır |
| UUID karşılaştırma | `normalizeId = (v) => String(v ?? "").toLowerCase().trim()` — harf/boşluk duyarsız istasyon eşleşmesi |
| API | `adminApi.getStation(stationId)` + `prepApi.getTasks({ station_id, branch_id? })` |
| URL Parametrik Açılış | `branch_id`, `station_name`, `station_color`, `branch_name` query paramları ile ilk render’da station bilgisi hydrate edilir |
| Tasarım | Koyu tema (`bg-slate-950`), büyük kart ızgarası, renk kodlu durum, canlı saat, WS göstergesi |
| Sıralama | IN_PROGRESS → PENDING → COMPLETED → CANCELLED; sonra priority azalan |
| Atanan kişi | Başlık üstünde indigo rozet (`assigned_to_name` — baş harf avatar + tam ad) |
| Buton | `KDSHeader` → istasyon select yanındaki Monitor ikonu; `window.open` ile yeni pencere |

### WS Güncelleme Akışı

```
KDS Drawer (recordProgress)
  → POST /prep/tasks/{id}/record-progress/
  → PrepService.record_progress() → broadcast_prep_update()
  → kitchen_notifications_{branch_id} + kitchen_notifications (global)
  → Station Display onMessage:
       isPrepEvent? → normalizeId(task.station) === normalizeId(stationId)?
         → setTasks() ile anlık güncelleme
```

## KDS Ana Sayfa — Prep WS Entegrasyonu

`app/kds/page.tsx` içinde `usePrepSocket(branchId)` hook'u çağrılır.  
`prep-management` dışındaki sayfalardan (örn. KDS Prep Drawer) yapılan görev değişiklikleri artık KDS Drawer'ında da anlık yansır.  
Bkz. `frontend/src/features/prep/hooks/usePrepSocket.ts` ve `mergePrepWsCache.ts`.

## Prep Window (Public Kiosk Route)

`/kds/prep-window` route’u, login cookie gerektirmeyen istasyon hazırlık ekranı akışıdır.

| Özellik | Detay |
|---|---|
| Sayfa | `app/kds/prep-window/page.tsx` |
| Session storage | `localStorage["prep-window-session"]` |
| Setup API | `prepDisplayApi.getBranches/getStations/createSession` |
| Session verify | `prepDisplayApi.verifySession` (`/prep-display/verify/`) |
| WS URL | `getPrepDisplayKitchenNotificationsWsUrl(branchId, displayToken)` |
| Ortak render | `StationDisplayScreen` bileşeni hem authenticated station-display hem kiosk prep-window tarafından paylaşılır |
| Electron köprüsü | `window.electronAPI.getPrepWindowConfig/savePrepWindowConfig/resetPrepWindowConfig` |

Bu route middleware’de public whitelist’e eklenmiştir (`proxy.ts`) ve locale-prefix ile de (`/tr/kds/prep-window`) izinlidir.

## Mutfak stok çekmecesi

İstasyona bağlı depodaki stok kalemlerini KDS üzerinden gösterir; kritik filtre ve eksik listesine aktarma.

| Dosya | Rol |
|-------|-----|
| `components/KdsKitchenStockDrawer.tsx` | Yan çekmece UI, kritik vurgu, eksik listesi öneri miktarı |
| `hooks/useKdsLinkedStock.ts` | `GET /api/v1/stations/:id/linked-stock-levels/` |
| `lib/stockMinimum.ts` | Minimum gösterimi (`-1` = sınırsız) |

**API:** Her satırda backend `is_low_stock` döner (`quantity < minimum_quantity`; pozitif minimum, `-1`/`0` hariç — [[Inventory#Düşük / kritik stok eşiği]]).

**UI:** `filterCritical` yalnızca `is_low_stock === true` kalemleri listeler; kalan = minimum olanlar kritik filtresine **dahil edilmez**. `addAllCritical` aynı küme için eksik listesi modalını açar.

**Yenileme:** Sipariş / mutfak WebSocket olaylarında liste otomatik yenilenir (`useKdsLinkedStock`).

## Birleşik ürün (menü) gösterimi

KDS API istasyon filtresinde birleşik menünün **alt bileşenlerini** döner; ana satır (parent) listeden çıkarılır. Serializer alt kalemlere `combined_parent_name`, `combined_parent_quantity`, `is_combined_component` ekler.

| Bileşen | Rol |
|---------|-----|
| `utils/kdsCombinedDisplay.ts` | Kart içi parent + alt bileşen gruplama |
| `utils/kdsOrderTotals.ts` | Sol panel toplamları — parent adı altında bileşen listesi |
| `components/OrderCard.tsx` | `1× Menü Adı` + içindekiler + bileşen başına aksiyon |
| `components/KdsOrderTotalsPanel.tsx` | Kategori bazlı ürün toplamları, birleşik içerik alt listesi |

Sol panel ve kartta reçetesiz / süresiz kalemler Smart Firing ile **hemen gönder** (`firing_state: late`) olarak işaretlenir — bkz. [[Smart_Firing_v2#Birleşik ürün (menü) zamanlaması]].
