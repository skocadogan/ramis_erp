# WS Internals — WebSocket İç Mekanizmaları

- **Özet:** Django Channels üzerinde çalışan WebSocket altyapısının iç yardımcı modüllerini kapsar: ertelenmiş yayın birleştirme, şube bazlı throttle, in-memory metrikler ve güvenli gönderim/ping-pong protokolü. Bu modüller yüksek yük altında WS mesaj patlamasını önler ve izlenebilirlik sağlar.
- **Kütüphaneler:** Django Channels, autobahn, Django Cache (Redis), threading
- **Bağlantılar:** [[WebSocket_Architecture]], [[Orders]], [[Branches]], [[Frontend_KDS]], [[Frontend_POS]]

---

## 1. Ertelenmiş Yayın Birleştirme (`ws_deferred.py`)

Bir veritabanı transaction'ı içinde birden fazla masa güncellemesi veya KDS yenilemesi tetiklenebilir. Bu modül, aynı transaction içindeki tekrarlı WS yayınlarını **tek bir mesaja** indirger ve `transaction.on_commit` ile commit sonrasına erteler.

### Tasarım Deseni

- **Thread-local state:** `threading.local()` ile her thread'e ayrı tampon
- **`transaction.on_commit` hook:** Rollback durumunda callback otomatik olarak silinir

### API

| Fonksiyon | Açıklama |
|-----------|----------|
| `schedule_table_broadcast(table_id, action)` | Masa değişikliğini tampona ekler. `action`: `"upsert"` veya `"delete"` |
| `schedule_kds_refresh(branch_id, reason, **extra)` | KDS/POS sync yenileme sinyalini tampona ekler |
| `reset_deferred_state_for_tests()` | Test izolasyonu için tampon sıfırlama |

### Akış

```
Order.save() → schedule_table_broadcast(table_id)  ──┐
Sale.save()  → schedule_table_broadcast(table_id)  ──┤  (aynı transaction)
                                                      ▼
                                            transaction.on_commit()
                                                      │
                                            _flush_all() → broadcast_table_change() (tek WS)
```

### Kaynak Dosyalar

- [`ws_deferred.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/ws_deferred.py)

---

## 2. WS Throttle & Birleştirme (`ws_throttle.py`)

Şube/kanal bazlı, zaman pencereli throttle mekanizması. Belirli bir `prefix:branch_id` çifti için en fazla `throttle_seconds` aralığında bir WS yayını yapılır; pencere içindeki ek çağrılar "pending" olarak işaretlenir ve pencere bittiğinde tek bir flush tetiklenir.

### Konfigürasyon

| Env Değişkeni | Varsayılan | Açıklama |
|---------------|------------|----------|
| `WS_KDS_STATS_THROTTLE_SECONDS` | `2` | Throttle pencere süresi (saniye) |

### API

```python
throttle_coalesced(
    prefix="kds_stats",
    branch_id=str(branch.id),
    throttle_seconds=None,  # env'den okunur
    run=lambda: broadcast_kds_stats(branch.id),
)
```

### Mekanizma

1. Cache'de `ws:throttle:{prefix}:{branch_id}` anahtarı yoksa → `run()` çalıştır, anahtar yaz
2. Anahtar varsa → `ws:pending:{prefix}:{branch_id}` işaretle, `threading.Timer` ile pencere sonunda flush planla
3. Timer tetiklendiğinde → pending varsa ve throttle anahtarı kalkmışsa → tekrar `run()` çalıştır

### Celery Bypass ve Throttle Uyumu
Celery Bypass modu (`WS_BYPASS_CELERY=true`) aktif edildiğinde, `order_status_changed` gibi yüksek frekanslı yayınlar yine `throttle_coalesced` mekanizmasını takip eder. Farkı, event tetiklendiğinde Celery worker'ına delay göndermek yerine doğrudan view/service thread havuzunda `_broadcast_kitchen_order_status_changed_now` çalıştırılmasıdır. Böylece throttle koruması kaybedilmeden gecikme sıfırlanmış olur.

### Kaynak Dosyalar

- [`ws_throttle.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/ws_throttle.py)

---

## 3. WS Metrikler (`ws_metrics.py`)

Prometheus bağımlılığı olmadan, in-memory tutalan hafif sayaçlar. Process yeniden başlatıldığında sıfırlanır. Health endpoint üzerinden erişilir.

### Sayaç Türleri

| Sayaç | Açıklama |
|-------|----------|
| `broadcast_by_event` | Olay türüne göre toplam yayın sayısı |
| `event_totals` | Olay türü bazında kümülatif sayaçlar |
| `active_connections_by_consumer` | Consumer türüne göre aktif bağlantı sayısı |
| `total_connections_opened_by_consumer` | Consumer türüne göre toplam açılan bağlantı sayısı |

### API

| Fonksiyon | Açıklama |
|-----------|----------|
| `increment_ws_broadcast(event_type, branch_id?)` | Yayın sayacını artırır |
| `track_ws_connection_opened(consumer_name)` | Bağlantı açıldığında çağrılır |
| `track_ws_connection_closed(consumer_name)` | Bağlantı kapatıldığında çağrılır |
| `get_ws_metrics_snapshot()` | Tüm sayaçların anlık görüntüsünü döner |

### Erişim

`GET /api/v1/health/` → yanıt gövdesinde `websocket` alanı olarak döner ([[Health_Endpoint]]).

### Kaynak Dosyalar

- [`ws_metrics.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/ws_metrics.py)

---

## 4. Consumer Yardımcıları (`ws_consumer.py`)

Tüm Channels consumer'larının ortak kullandığı yardımcı fonksiyonlar.

### API

| Fonksiyon | Açıklama |
|-----------|----------|
| `ws_safe_send(consumer, text_data?, bytes_data?)` | Kapalı bağlantıya gönderimde autobahn `Disconnected` hatasını yutar (yük altı yarış durumu) |
| `ws_handle_client_ping(text_data)` | İstemci `{"type":"ping"}` gönderdi mi kontrol eder |
| `ws_send_pong(consumer)` | Pong yanıtı gönderir |
| `ws_on_connect(consumer_name)` | Bağlantı metriğini artırır |
| `ws_on_disconnect(consumer_name)` | Bağlantı metriğini azaltır |

### Ping / Pong Protokolü

İstemci tarafı (`managedWebSocket.ts`) periyodik `{"type":"ping"}` gönderir. Consumer `ws_handle_client_ping()` ile kontrol eder ve `ws_send_pong()` ile yanıtlar. Bu sayede:
- Proxy/LB idle timeout'ları aşılır
- Stale bağlantılar tespit edilir

### Kaynak Dosyalar

- [`ws_consumer.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/ws_consumer.py)
