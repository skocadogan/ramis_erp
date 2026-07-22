# WebSocket Architecture (Gerçek Zamanlı İletişim)

> **Özet:** Django Channels + Redis üzerinden çalışan WebSocket altyapısı. Sipariş durumları, masa değişiklikleri, menü güncellemeleri, depo stok bildirimleri, garson çağrısı ve görüldü senkronu gerçek zamanlı iletilir.
> **Kütüphaneler:** Django Channels, channels_redis, Daphne (1–4 süreç, `DAPHNE_INSTANCES`)
> **Bağlantılar:** [[Orders]], [[Branches]], [[Menu]], [[Warehouse]], [[Production_Planning]], [[POS_Display]], [[Waiter_Call_Dismiss]], [[Backend_Environment]], [[Deployment]], [[ASGI_Split_Deploy]], [[WS_Internals]], [[Frontend_WebSocket]], [[Health_Endpoint]]

---

## Konum
`backend/config/asgi.py` — Tüm WS rotalarının birleştirildiği nokta.

## Kayıtlı WebSocket Modülleri

| Modül | Consumer | WS Yolu | Açıklama |
|-------|----------|---------|----------|
| `orders` | `KitchenNotificationConsumer` | `/ws/kitchen/notifications/` | KDS sipariş / prep / stok sinyalleri |
| `orders` | `PosDisplayConsumer` | `/ws/pos/display/{terminal}/` | Kasa ↔ müşteri ekranı |
| `branches` | `PosSyncConsumer` | `/ws/pos/sync/` | Masa, vardiya, sipariş tetikleyicileri |
| `branches` | `StaffNotificationConsumer` | `/ws/staff/notifications/` | Personel bildirimleri |
| `branches` | `WaiterCallConsumer` | `/ws/waiter/calls/` | Akıllı buton garson çağrısı |
| `menu` | — | `/ws/menu/catalog/` | Ürün/kategori değişiklikleri |
| `warehouse` | — | `/ws/warehouse/notifications/` | Stok / eksik listesi / geciken PO uyarısı (`procurement_overdue_alert`) |
| `production_planning` | — | `/ws/production-status/{branch}/` | Üretim durumu |

`KitchenNotificationConsumer` içinde iki abonelik modu vardır:
- **JWT modu:** klasik kullanıcı oturumu (`token` query); izin: `orders.view_kds` **veya** `prep.view_preptask`
- **Prep kiosk modu:** `prep_display_token` veya `pdt` query ile branch kapsamlı anonim abonelik ([[Prep_Display]])

## Şube Kapsamı
`resolve_websocket_branch_subscription()` ile erişim kontrolü:
- Tek şube → otomatik
- Çok şube → `branch_id` query zorunlu
- Süper kullanıcı → global grup (`kitchen_notifications`, `pos_sync_global`, …)

## Yayın optimizasyonları (yoğun saat)

| Mekanizma | Dosya | Etki |
|-----------|-------|------|
| Tek olay tipi (`orders_updated`) | `orders/ws_broadcast.py` | Refresh başına 8 → 4 Redis `group_send` |
| Celery Bypass | `orders/ws_broadcast.py` | `WS_BYPASS_CELERY` ile Celery aradan çıkarılır, doğrudan Redis'e yayınlanır (<10ms gecikme) |
| KDS stats throttle | `core/ws_throttle.py` | OrderItem signal flood azaltılır |
| Prep yalnız `prep_updated` | `prep/ws_broadcast.py` | Çift mutfak yayını kaldırıldı |
| Prep yayın `on_commit` | `core/ws_deferred.schedule_prep_update` | Transaction commit sonrası serialize + broadcast |
| WS JWT cache | `users/ws_auth.py` | Reconnect başına DB sorgusu azalır |
| Paylaşımlı hub (frontend) | `lib/ws/sharedWebSocketHub.ts` | POS'ta çift `/ws/pos/sync/` bağlantısı birleşir |
| Ping/pong + stale close | `lib/ws/managedWebSocket.ts` | Kopuk bağlantı erken tespit |
| Paket sanal masa HTTP yedeği | `kitchenPosEvents.shouldHttpFallbackPosTables` | TAKEAWAY'de `table_update` yok; `order_created`/`complete_table`/table_id'siz status → `/tables/takeaway_virtual/` |
| Çoklu Daphne | `system_utils/daphne_units.sh` | Nginx `least_conn` upstream `ramis_daphne` |
| Split HTTP/WS | [[ASGI_Split_Deploy]] | REST Uvicorn (`ramis_uvicorn`), yalnız `/ws/` Daphne |

## Frontend Tarafı
- `src/lib/ws/managedWebSocket.ts` — Reconnect, heartbeat ping, stale timeout
- `src/lib/ws/sharedWebSocketHub.ts` — Ref-count ile tek TCP, çok abone
- `src/lib/ws/authWsUrl.ts` — WS URL + JWT query
- Hub anahtarları: `posSyncHubKey`, `kitchenNotificationsHubKey`, `staffNotificationsHubKey`

## Channel Layer Yapılandırması
Redis db `/2` (`REDIS_CHANNELS_URL`). Varsayılan kapasite/TTL yoğun KDS için yükseltildi:

```python
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_CHANNELS_URL],
            "capacity": 8000,   # CHANNEL_LAYER_CAPACITY
            "expiry": 120,      # CHANNEL_LAYER_EXPIRY (saniye)
        },
    },
}
```

## Gözlem
`GET /api/v1/health/` yanıtında `websocket` alanı: yayın sayaçları ve consumer başına aktif bağlantı — bkz. [[Health_Endpoint]] ve [[WS_Internals]].

## Nginx yönlendirme (split)

Üretimde `daphne_units.sh` nginx şablonunu yamalar:

- `location /ws/` → `proxy_pass http://ramis_daphne`
- `location /api/` → `proxy_pass http://ramis_uvicorn` (WS yükü API worker'larından ayrılır)

Eski kurulumlarda `upstream ramis_api` bloğu **`ramis_daphne`** olarak yeniden adlandırılır; `update.sh --backend-only` yamayı idempotent uygular.

## Üretim ayarları (`/etc/ramis/backend.env`)
```bash
DAPHNE_INSTANCES=2
CHANNEL_LAYER_CAPACITY=8000
CHANNEL_LAYER_EXPIRY=120
REDIS_CHANNELS_SOCKET_TIMEOUT=30
WS_AUTH_CACHE_SECONDS=60
WS_KDS_STATS_THROTTLE_SECONDS=2
WS_BYPASS_CELERY=false
```

### Redis timeout ve WS kopması

`channels_redis` kanal dinlemesi için Redis `BRPOP` kullanır (sınıf varsayılanı **5 sn**). `redis-py` okuma timeout’u da **5 sn** ise Redis kısa süre yanıt vermezse Daphne logunda `Timeout reading from 127.0.0.1:6379` görülür ve `/ws/kitchen/notifications/` bağlantısı düşer. Bu **normal çalışma değildir** — Redis yükü, `KEYS`/bakım veya tek thread blokajını kontrol edin. Uygulama tarafında `REDIS_CHANNELS_SOCKET_TIMEOUT` (varsayılan 30) BRPOP’tan büyük tutulur; kalıcı çözüm Redis’in yanıt süresini düşürmektir.

Güncelleme: `sudo bash update.sh --backend` Daphne birimlerini ve nginx upstream'i yeniden yazar.

## İstemci olay tipleri (özet)

| `type` (JSON) | Kaynak | Tipik tüketici |
|---------------|--------|----------------|
| `orders_updated` | `broadcast_kds_refresh` | KDS, POS sync — tam liste refetch |
| `order_status_changed` | Durum geçişi yayını | KDS |
| `kds_refresh` | Eski uyumluluk / alt tipler | KDS (prep-only alt tipi filtrelenir) |
| `table_update` | `branches/signals` | POS, masa yönetimi, garson mobil — yük: `status`, `pos_occupied_flow`, **`cleaning_*`** alanları |
| `shift_event` | Vardiya servisi | POS |
| `menu_catalog_refresh` | Menü CRUD | POS katalog |
| `prep_updated` | `prep/ws_broadcast` | Prep yönetimi, KDS prep hook |

## Yayın taşıma yolu (Split mimari — Uvicorn HTTP / Daphne WS)

HTTP istekleri **Uvicorn** (`:9000+`), WebSocket bağlantıları **Daphne** (`:8000+`) süreçlerinde çalışır. İkisi **Redis channel layer** (db `/2`) üzerinden haberleşir. Sipariş/durum değişikliği yayınları ise **Celery `broadcast` kuyruğu** üzerinden gider:

```
HTTP isteği (Uvicorn) → broadcast_kds_refresh() → broadcast_kds_refresh_task.delay()
        → Celery 'broadcast' kuyruğu → ramis-worker-broadcast → group_send (Redis)
        → Daphne WS consumer → KDS / POS / mobil istemci
```

> **Kritik:** `broadcast` kuyruğunu yalnızca `ramis-worker-broadcast.service` tüketir. Bu birim yoksa/çalışmıyorsa `orders_updated` ve `order_status_changed` yayınları hiç işlenmez; KDS, POS ve mobil arasında gerçek zamanlı iletişim **tamamen durur** (semptom: ekranlar birbirini güncellemiyor). Bkz. [[Celery_Tasks]], [[Deployment]].

## Backend yayın dosyaları

| Modül | Dosya |
|-------|-------|
| Sipariş / KDS | `apps/orders/ws_broadcast.py` |
| Hazırlık | `apps/prep/ws_broadcast.py` |
| Masa | `apps/branches/signals.py` |
| Menü | `apps/menu/ws_broadcast.py` (varsa) |
| Depo | `apps/warehouse/ws_broadcast.py` |

Ortak: `core/ws_throttle.py`, `core/ws_metrics.py`, `core/ws_consumer.py`, `core/ws_deferred.py` — bkz. [[WS_Internals]].

## Nginx (WebSocket)

`/ws/` konumu için tipik ayarlar (`install.sh` şablonu):

- `proxy_http_version 1.1`, `Upgrade` / `Connection` header'ları
- `proxy_buffering off`
- `proxy_read_timeout 86400` (uzun süreli bağlantı)

Upstream: `least_conn` ile `127.0.0.1:8000`, `8001`, … — bkz. [[Deployment]].
