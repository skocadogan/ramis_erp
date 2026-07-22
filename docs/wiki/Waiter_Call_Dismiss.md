# Waiter Call Dismiss (Garson Çağrısı Görüldü Senkronu)

> **Özet:** Garson çağrısının "görüldü" olarak işaretlenmesini tüm bağlı istemcilere (POS web, mobil uygulama) gerçek zamanlı olarak yayan senkronizasyon sistemi. Tek çağrı, toplu çağrı veya tüm çağrıları silme modlarını destekler.
> **Kütüphaneler:** Django REST Framework, Django Channels, Redis, Zustand, React Native
> **Bağlantılar:** [[WebSocket_Architecture]], [[Branches]], [[Frontend_POS]], [[Mobile_Waiter_App]], [[RBAC]], [[Performances]]

---

## Akış Özeti

```
POS / Garson Ekranı                Backend                          Diğer İstemciler
      │                               │                                    │
      │  POST /waiter-calls/dismiss/  │                                    │
      ├──────────────────────────────►│                                    │
      │                               │  WaiterCallDismissView             │
      │                               │  → dismiss_waiter_calls()          │
      │                               │  → record_waiter_call_dismiss()    │
      │                               │    (Performances — yanıt süresi)  │
      │                               │  → NotificationService             │
      │                               │    .broadcast_waiter_call_dismissed│
      │                               │  → channel_layer.group_send ──────►│
      │                   200 OK      │   (waiter_calls_{branch_id})        │  WS: waiter_call_dismissed
      │◄──────────────────────────────│   (WAITER_CALLS_GLOBAL)            │  → applyWaiterCallDismissed()
```

---

## Şube kapsamı (2026-06)

`dismiss_waiter_calls()` ve çağrı listesi `branch_filter_qs` ile kullanıcının erişebildiği şubelerle sınırlıdır. Yanlış şube `branch_id` ile dismiss isteği boş veya yetkisiz sonuç üretmez; [[Branch_Scope]] ve `call_waiter.py` masa/şube doğrulaması birlikte çalışır.

## Backend

### Endpoint

```
POST /api/v1/waiter-calls/dismiss/
```

**Yetki:** `pos.view_pos` VEYA `waiter.access`

**Request gövdesi:**

| Alan | Tür | Açıklama |
|------|-----|----------|
| `branch_id` | `string` (zorunlu) | Hedef şube UUID |
| `call_id` | `string` | Tek çağrı ID |
| `call_ids` | `string[]` | Çoklu çağrı ID dizisi |
| `dismiss_all` | `boolean` | `true` ise tüm çağrılar temizlenir |

En az `call_id`, `call_ids` veya `dismiss_all: true` belirtilmelidir.

### Bekleyen çağrılar (REST senkron)

```
GET /api/v1/waiter-calls/pending/?branch_id=<uuid>
```

**Yetki:** `pos.view_pos` VEYA `waiter.access`

POS, web garson veya mobil uygulama açıldığında WS bağlantısı kurulmadan önce bu uç nokta çağrılır; `WaiterCallLog` içindeki `PENDING` kayıtlar store'a yüklenir. Böylece istemci kapalıyken gelen akıllı buton çağrıları kaçırılmaz.

**Başarılı yanıt (200):**
```json
{
  "calls": [
    {
      "call_id": "uuid",
      "branch_id": "uuid",
      "table_id": "uuid",
      "table_name": "T1",
      "zone_name": "Salon",
      "source": "smart_button",
      "message": "T1 masasından garson çağrısı",
      "created_at": "2026-05-28T12:00:00+03:00"
    }
  ]
}
```

### Gün sonu temizliği

Vardiya kapanışında (`ShiftService.close_shift`) şubedeki tüm `PENDING` çağrılar otomatik `DISMISSED` yapılır ve `dismiss_all` WS yayını gönderilir. Analitik kayıtlar silinmez; yalnızca aktif kuyruk temizlenir.

**Başarılı yanıt (200):**
```json
{ "status": "ok", "call_ids": ["uuid-1", "uuid-2"], "branch_id": "..." }
// dismiss_all ise:
{ "status": "ok", "dismiss_all": true, "branch_id": "..." }
```

### Dosyalar

| Dosya | Sorumluluk |
|-------|------------|
| `backend/apps/branches/views_waiter_call_dismiss.py` | DRF `APIView`; giriş parse etme, yetki, 400/200 |
| `backend/apps/branches/waiter_call_sync.py` | `dismiss_waiter_calls()` saf servis fonksiyonu; branch erişim doğrulama, `WaiterCallDismissBadRequest`, dismiss sonrası [[Performances]] log güncelleme |
| `backend/apps/branches/waiter_call_pending.py` | `list_pending_waiter_calls()` — PENDING kayıtları WS payload ile uyumlu listeler; `expire_pending_waiter_calls()` — vardiya kapanışında temizlik |
| `backend/apps/branches/views_waiter_call_pending.py` | `GET /waiter-calls/pending/` |
| `backend/apps/branches/services.py` | `NotificationService.broadcast_waiter_call_dismissed()` — channel layer yayını |
| `backend/apps/branches/urls.py` | `waiter-calls/dismiss/`, `waiter-calls/pending/` URL kaydı |
| `backend/apps/branches/consumers.py` | `WaiterCallConsumer.waiter_call_dismissed_event()` — WS handler |
| `backend/apps/shifts/services.py` | `close_shift()` sonrası `expire_pending_waiter_calls()` |

### Yayın Kanalları

`NotificationService.broadcast_waiter_call_dismissed()` her zaman şu kanallara yayınlar:

1. `waiter_calls_{branch_id}` — şubeye özgü garson/POS çağrı listesi
2. `WAITER_CALLS_GLOBAL` — süper kullanıcı aboneleri
3. `pos_sync_{branch_id}` (+ `pos_sync_global`) — Smart Table masa cihazları (`waiter_call_dismissed` → görüldü dialogu)

Payload alanları: `branch_id`, `dismiss_all`, `call_ids`, `table_ids` (çağrı loglarından), isteğe bağlı `assigned_waiter_ids`.

---

## WebSocket Mesaj Formatı

`/ws/waiter/calls/` ve `/ws/pos/sync/` kanallarından gelen mesaj:

```json
{
  "type": "waiter_call_dismissed",
  "data": {
    "branch_id": "abc-123",
    "dismiss_all": false,
    "call_ids": ["uuid-1", "uuid-2"],
    "table_ids": ["table-uuid"]
  }
}
```

---

## Frontend (Next.js / POS)

### Dosyalar

| Dosya | Sorumluluk |
|-------|------------|
| `frontend/src/features/pos/services/waiterCallApi.ts` | `fetchPendingWaiterCalls()`, `dismissWaiterCalls()` — REST çağrıları |
| `frontend/src/features/pos/lib/hydrateWaiterCalls.ts` | Bekleyen çağrıları store'a yükler (ses yok) |
| `frontend/src/features/pos/lib/waiterCallDismissPayload.ts` | WS mesajını parse edip store'a uygular |
| `frontend/src/features/pos/hooks/useWaiterCallNotifications.ts` | Açılışta REST hydrate + WS; `waiter_call_dismissed` işleme |
| `frontend/src/features/pos/components/NotificationDrawer.tsx` | `markWaiterCallSeen()`, `markAllWaiterCallsSeen()` — kullanıcı aksiyonları |
| `frontend/src/store/usePosStore.ts` | `applyWaiterCallDismissed({ dismissAll, callIds })` — store mutasyonu |

### Kullanıcı Aksiyonları (`NotificationDrawer`)

- **Tek görüldü:** `markWaiterCallSeen(id)` → `removeWaiterCallNotif(id)` + `dismissWaiterCalls({ callId: id })`
- **Tümünü görüldü:** `markAllWaiterCallsSeen()` → tüm ID'ler `removeWaiterCallNotif` + `dismissWaiterCalls({ dismissAll: true })`

Store önce güncellenir (optimistik), ardından REST isteği atılır. Hata sessizce loglanır.

---

## Mobil Uygulama (React Native)

### Dosyalar

| Dosya | Sorumluluk |
|-------|------------|
| `mobile_app/waiter/src/hooks/useWaiterCallNotifications.ts` | Açılışta REST hydrate + WS; `waiter_call_dismissed` mesajını yakalar |
| `mobile_app/waiter/src/api/waiterApi.ts` | `fetchPendingWaiterCalls()`, `dismissWaiterCalls()` |
| `mobile_app/waiter/src/store/useWaiterPosPushStore.ts` | `applyWaiterCallDismissed()` — store mutasyonu |
| `mobile_app/waiter/src/components/TableCallsModal.tsx` | Görüldü butonları; dismiss API çağrısı |
| `mobile_app/waiter/src/components/WaiterNotificationOverlay.tsx` | Overlay bildirim; dismiss aksiyonu |
| `mobile_app/waiter/src/api/waiterApi.ts` | `dismissWaiterCalls()` — REST çağrısı |

### WS Mesaj İşleme (Mobil)

```typescript
if (message.type === "waiter_call_dismissed") {
  const { dismiss_all, call_ids } = message.data;
  useWaiterPosPushStore.getState().applyWaiterCallDismissed({
    dismissAll: Boolean(dismiss_all),
    callIds: call_ids.map(String),
  });
}
```

---

## Test

`backend/apps/branches/tests/test_waiter_call_dismiss.py` — birim testleri:
- Geçersiz `branch_id` → 400
- Yetersiz `call_id/call_ids/dismiss_all` kombinasyonu → 400
- `dismiss_all: true` → `broadcast_waiter_call_dismissed` çağrısı doğrulama
- Tekil ve toplu ID'ler → doğru payload doğrulama
- Şube erişim reddi → 400

`backend/apps/branches/tests/test_waiter_call_pending.py` — bekleyen çağrı listesi, vardiya kapanış temizliği, API yetki.

---

## Performans Kaydı (2026-05-28)

Dismiss ve çağrı oluşturma akışları [[Performances]] modülüne yan etkisiz log yazar:

| Olay | Kayıt |
|------|-------|
| Başarılı garson çağrısı | `record_waiter_call()` → `WaiterCallLog` (`PENDING`) |
| Görüldü (tek/çoklu/tümü) | `record_waiter_call_dismiss()` → `DISMISSED`, `response_seconds` |

Analitik ekran: [[Frontend_Performances]] (`/performances`).
