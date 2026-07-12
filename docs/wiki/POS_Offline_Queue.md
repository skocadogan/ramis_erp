# POS Offline Queue (Çevrimdışı İşlem Kuyruğu)

> **Özet:** EPIC-07 — Ağ kesintisinde POS, garson web ve garson mobil sipariş/ödeme mutasyonlarını yerel kuyruğa alır; bağlantı gelince idempotent API ile senkron eder. Senkron sırasında tam ekran ilerleme dialog'u gösterilir; başarısız işlemler uzlaşma ekranından yönetilir.
> **Bağlantılar:** [[Frontend_POS]], [[Frontend_Waiter]], [[Mobile_Waiter_App]], [[PWA]], [[Orders]], [[Printing]], [[Audit_Trail]]

---

## Konum

| Yol | Rol |
|-----|-----|
| `frontend/src/features/pos/offline/` | Web POS / garson kuyruk modülü (IndexedDB, flush, UI) |
| `mobile_app/waiter/src/features/offline/` | Garson mobil kuyruk modülü (AsyncStorage, flush, UI) |
| `backend/apps/orders/idempotency.py` | Idempotency helper |
| `backend/apps/orders/models.py` | `PosIdempotencyRecord` |
| `POST /orders/main/sync/reconcile/` | Batch uzlaşma |

---

## Feature flag

```env
NEXT_PUBLIC_POS_OFFLINE_QUEUE=true
```

| Ortam | Varsayılan | Not |
|-------|------------|-----|
| **Üretim** (`install.sh` / `update.sh`) | `true` | `/etc/ramis/frontend.env` + `runtime-config.json` otomatik yazar |
| Geliştirme (`frontend/.env.example`) | `false` | Yerel geliştirmede kapalı |
| Staging pilot (`frontend/.env.staging.example`) | `true` | Pilot checklist |

### Kurulum / güncelleme betikleri

| Betik | Davranış |
|-------|----------|
| `install.sh` | Üretim kurulumunda `NEXT_PUBLIC_POS_OFFLINE_QUEUE=true` yazar (`/etc/ramis/frontend.env`, `.env.local`, `runtime-config.json` → `posOfflineQueue: true`) |
| `update.sh` | `_merge_frontend_env_prod_defaults()` — eksik veya `false` olan kurulumlarda anahtarı `true` yapar; `.env.local` + runtime JSON senkronize eder; değişiklik varsa frontend rebuild tetiklenebilir |
| `update.sh --sync-runtime-config` | Önce üretim varsayılanını uygular, ardından `runtime-config.json` yeniler |
| `update.sh --change-ip` | IP güncellemesiyle birlikte `NEXT_PUBLIC_POS_OFFLINE_QUEUE=true` korunur |

Bkz: [[Frontend_Environment]], [[Runtime_Config]], [[Deployment]].

Web'de kapalıyken frontend doğrudan API çağrısı yapar; backend idempotency header varsa yine çalışır.

**Mobil garson uygulamasında** offline kuyruk varsayılan olarak **her zaman etkin** (`OFFLINE_QUEUE_ENABLED`).

---

## Desteklenen operasyonlar (MVP)

| Tip | Endpoint | Web POS | Web Garson | Mobil Garson |
|-----|----------|---------|------------|--------------|
| `CREATE_ORDER` | `POST /orders/main/` | ✓ | ✓ | ✓ |
| `COMPLETE_ORDER` | `POST /orders/main/{id}/complete/` | ✓ | ✓ | — |
| `COMPLETE_TABLE` | `POST /orders/main/complete_table/` | ✓ | ✓ | — |

---

## Idempotency sözleşmesi

- Header: `Idempotency-Key`
- Format: `pos:create:{uuid}`, `pos:complete:{uuid}`, `pos:complete-table:{uuid}`
- Anahtar + farklı body → **409** `IDEMPOTENCY_CONFLICT`
- Tekrar istek → önbellekteki yanıt (**200/201**)

Idempotency anahtarı **yoksa** yanıt gövdesi geriye dönük uyumlu düz serializer formatında kalır.

---

## Frontend akış (Web POS / Garson)

1. `navigator.onLine` + `BackendHealthProvider` → `offlineMode`
2. Mutasyon `executeOrEnqueue` ile gönderilir
3. Offline / ağ hatası → IndexedDB `pending`
4. `OfflineQueueProvider` bağlantı gelince `flushOfflineQueue` + `reconcileWithServer`
5. **`SyncProgressDialog`** — bağlantı dönüşünde tam ekran, kapatılamaz; progress bar ile aktarım ilerlemesi
6. Senkron sırasında bağlantı tekrar koparsa → dialog kapanır, kuyruk `pending` kalır, offline devam
7. `POSHeader` → `OfflineQueueIndicator` → `ReconciliationDialog` (sanal liste, manuel uzlaşma)

---

## Mobil garson akış

1. `useBackendHealthStore` → `offlineMode` / `canSync`
2. Sipariş `executeOrEnqueue` (`table-order/[id].tsx`)
3. Offline → AsyncStorage kuyruğu (`ramis-waiter-offline-queue-v1`)
4. `OfflineQueueProvider` (`(main)/_layout.tsx`) — NetInfo + health ile flush
5. **`SyncProgressModal`** — web ile aynı UX: "Veriler sunucuya aktarılıyor"
6. Ertelenmiş mutfak fişi (`deferredPrints`) sync sonrası tetiklenir

---

## Vardiya kapatma

Bekleyen kuyruk varken vardiya kapatma girişiminde **Dialog** ile uyarı (`PosShiftClose`).

---

## Deferred print

Kuyruklanan siparişlerde otomatik fiş, sync sonrası `PrintJob` idempotency ile tetiklenir.

---

## KPI (backlog)

- Offline oturumlarda kayıp sipariş sayısı
- Ortalama senkron gecikmesi
