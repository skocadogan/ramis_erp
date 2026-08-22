# Frontend WebSocket — İstemci WS Altyapısı

- **Özet:** Frontend tarafında WebSocket bağlantı yönetimini sağlayan üç katmanlı altyapı: `managedWebSocket` (tekil bağlantı + reconnect), `sharedWebSocketHub` (paylaşımlı bağlantı havuzu), `authWsUrl` (modül bazlı URL oluşturucular). Exponential backoff, heartbeat ve stale bağlantı tespiti içerir.
- **Kütüphaneler:** WebSocket API (native), Zustand
- **Bağlantılar:** [[WebSocket_Architecture]], [[WS_Internals]], [[Frontend_POS]], [[Frontend_KDS]], [[Runtime_Config]]

---

## 1. ManagedWebSocket (`managedWebSocket.ts`, ~6.9KB)

Tekil WebSocket bağlantısını yönetir. Otomatik yeniden bağlanma ve sağlık kontrolü sağlar.

### Özellikler

| Özellik | Açıklama |
|---------|----------|
| **Exponential Backoff** | Bağlantı kopmasında artan bekleme süreleri ile yeniden deneme |
| **Heartbeat (Ping/Pong)** | Periyodik `{"type":"ping"}` gönderir, `{"type":"pong"}` bekler |
| **Stale Detection** | Belirli süre pong gelmezse bağlantıyı yeniler |
| **Cleanup** | `close()` ile tüm timer'lar ve listener'lar temizlenir |

### Kullanım

```typescript
const ws = createManagedWebSocket({
  url: "wss://api.example.com/ws/orders/?token=xxx",
  onMessage: (data) => handleOrderUpdate(data),
  onConnectionChange: (connected) => setIsConnected(connected),
});

// Temizleme
ws.close();
```

---

## 2. SharedWebSocketHub (`sharedWebSocketHub.ts`, ~3.2KB)

Aynı URL'ye birden fazla bileşenin abone olmasını sağlar. Tekil bağlantı paylaşımı.

### Mekanizma

- Her bağlantı bir `key` ile tanımlı (örn: `"pos_sync"`, `"kitchen_notifications"`)
- İlk abone → bağlantı açılır
- Son abone çıktığında → bağlantı kapatılır
- Mesajlar tüm abonelere dağıtılır

### Bağlantı Anahtarları

| Anahtar | Kullanım |
|---------|----------|
| `pos-sync:{branch}:{platform}` | POS sipariş/masa senkronizasyonu |
| `kitchen:{branch}` | KDS bildirimleri |
| `staff:{branch}` | Personel bildirimleri |
| `waiter-calls:{branch}` | Garson çağrısı |
| `warehouse:{branch}` | Depo bildirimleri — depo sayfası + sidebar rozeti tek TCP |

---

## 3. Auth WS URL Oluşturucular (`authWsUrl.ts`, ~5.9KB)

Modül bazlı WebSocket URL'leri oluşturur. Runtime config'den API origin çözümler ve JWT token ekler.

### URL Oluşturucular

| Fonksiyon | WS Yolu | Kullanım |
|-----------|---------|----------|
| `getKitchenNotificationsWsUrl(branchId?)` | `/ws/kitchen/notifications/?token=...&branch_id=...` | KDS ekranı (JWT) |
| `getPrepDisplayKitchenNotificationsWsUrl(branchId, displayToken)` | `/ws/kitchen/notifications/?branch_id=...&prep_display_token=...` | KDS prep kiosk (JWT’siz token) |
| `getMenuCatalogWsUrl()` | `/ws/menu/catalog/` | Menü değişiklik bildirimi |
| `getPosDisplayWsUrl(terminalId, options)` | `/ws/pos/display/{terminalId}/` | POS yayıncı / müşteri ekranı abonesi |
| `getPosSyncWsUrl(branchId?, terminalId?, platform?)` | `/ws/pos/sync/` | POS senkronizasyonu |
| `getStaffNotificationsWsUrl(branchId?)` | `/ws/staff/notifications/` | Şube/personel bildirimleri |
| `getWaiterCallsWsUrl(branchId?)` | `/ws/waiter/calls/` | Garson çağrısı |
| `getWarehouseNotificationsWsUrl(branchId?)` | `/ws/warehouse/notifications/` | Depo bildirimleri |

### HTTP Fallback Sabitleri

WS bağlantısı kurulamadığında HTTP polling'e düşer:

| Sabit | Değer | Açıklama |
|-------|-------|----------|
| `WS_HTTP_FALLBACK_INTERVAL_MS` | 60.000ms | Genel fallback aralığı |
| `POS_TABLES_HTTP_FALLBACK_MS` | 12.000ms | POS masa durumu polling aralığı |

---

## Kaynak Dosyalar

- [`managedWebSocket.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/ws/managedWebSocket.ts)
- [`sharedWebSocketHub.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/ws/sharedWebSocketHub.ts)
- [`authWsUrl.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/ws/authWsUrl.ts)
- [`wsBackendHost.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/wsBackendHost.ts)
