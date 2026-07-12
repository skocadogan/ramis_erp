# Rezervasyon Bildirimleri (Reservation Alerts)

> **Özet:** Rezervasyon saati geldiğinde ve misafir oturduğunda POS, garson web ve mobil istemcilere garson çağrı altyapısı ile uyumlu gerçek zamanlı bildirim gönderir. Bekleyen uyarılar REST ile hydrate edilir; görüldü işareti tüm istemcilerde senkronize olur.
> **Kütüphaneler:** Django ORM, Django Channels, Celery, Redis, Zustand, React Native
> **Bağlantılar:** [[Reservations]], [[Waiter_Call_Dismiss]], [[Frontend_POS]], [[Mobile_Waiter_App]], [[Celery_Tasks]], [[WebSocket_Architecture]]

---

## Akış Özeti

```
Celery Beat (1 dk)              Backend                         İstemciler (POS / Garson / Mobil)
      │                            │                                    │
      │ notify_due_reservations    │                                    │
      ├───────────────────────────►│ find_due + notify_reservation_due  │
      │                            │ → WaiterCallLog (reservation_due)  │
      │                            │ → broadcast_waiter_call ───────────►│ WS: waiter_call
      │                            │ → staff_notifications ───────────►│ WS: reservation_due

POS / Rezervasyon "Oturdu"        ReservationService.seat / open_table
      │                            │ → dismiss reservation_due alerts   │
      │                            │ → notify_reservation_arrived ─────►│ WS + REST pending
```

---

## Backend

### Model değişiklikleri

| Model | Alan | Açıklama |
|-------|------|----------|
| `Reservation` | `due_notified_at` | Saati geldi bildirimi gönderildi mi (idempotent) |
| `WaiterCallLog` | `reservation` FK | Rezervasyon kaynaklı uyarılar için |

### Kaynak türleri (`WaiterCallLog.source`)

| `source` | Anlam |
|----------|--------|
| `smart_button` | Akıllı buton garson çağrısı |
| `reservation_due` | Rezervasyon saati geldi |
| `reservation_arrived` | Misafir geldi / oturdu |

### Dosyalar

| Dosya | Sorumluluk |
|-------|------------|
| `backend/apps/reservations/reservation_alerts.py` | Bildirim yayını, due taraması, dismiss |
| `backend/apps/reservations/tasks.py` | `notify_due_reservations` Celery görevi |
| `backend/apps/reservations/services.py` | `seat` / `cancel` / `no_show` entegrasyonu |
| `backend/apps/branches/services.py` | `open_table` → misafir geldi bildirimi |
| `backend/apps/branches/waiter_call_pending.py` | Pending listesinde rezervasyon mesajları |

### Celery

- **Görev:** `apps.reservations.tasks.notify_due_reservations`
- **Zamanlama:** Her **1 dakika** ([[Celery_Tasks]])
- **Koşul:** `status ∈ {PENDING, CONFIRMED}`, `scheduled_at <= now`, `due_notified_at IS NULL`

### Misafir geldi tetikleyicileri

1. `POST /api/v1/reservations/{id}/seat/` → [[Reservations]] `ReservationService.seat`
2. POS'ta rezerve masayı açma → `TableService.open_table` (masa `RESERVED` → `OCCUPIED`)

Her iki yol da bekleyen `reservation_due` uyarılarını kapatır ve `reservation_arrived` yayınlar.

---

## Frontend (POS / Garson Web)

Garson çağrı çekmecesi ([[Frontend_POS]] `NotificationDrawer`) rezervasyon uyarılarını da gösterir:

- Mavi etiket: **Rezervasyon saati**
- Yeşil etiket: **Misafir geldi**

| Dosya | Değişiklik |
|-------|------------|
| `frontend/src/features/pos/lib/waiterCallPayload.ts` | `source` / `reservation_id` işleme |
| `frontend/src/features/pos/lib/hydrateWaiterCalls.ts` | REST pending hydrate |
| `frontend/src/features/pos/lib/staffNotificationPayload.ts` | `reservation_due` / `guest_arrived` → çağrı store |

---

## Mobil ([[Mobile_Waiter_App]])

`useWaiterCallNotifications` — aynı `/ws/waiter/calls/` kanalı ve `GET /waiter-calls/pending/` ile rezervasyon uyarıları yüklenir. `TableCallsModal` kaynak etiketlerini gösterir.

---

## Test

`backend/apps/reservations/tests/test_reservation_alerts.py`

- Due bildirimi idempotent
- Celery görevi due kayıtları tarar
- `seat` → due dismiss + arrived log
- `open_table` (RESERVED) → arrived bildirimi

---

*Bu sayfa INGEST operasyonu ile oluşturulmuştur.*
