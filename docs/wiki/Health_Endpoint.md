# Health Endpoint — Sağlık Kontrolü

- **Özet:** Kimlik doğrulama gerektirmeyen bir HTTP endpoint olup servis durumunu ve WebSocket metriklerini raporlar. Proxy doğrulama, izleme araçları ve frontend'deki backend sağlık göstergesi tarafından kullanılır.
- **Kütüphaneler:** Django REST Framework
- **Bağlantılar:** [[WS_Internals]], [[Frontend_Backend_Health]], [[Deployment]], [[Ramis_Monitor]]

---

## Endpoint

```
GET /api/v1/health/
```

**Kimlik doğrulama:** Yok (genel erişim)

### Yanıt

```json
{
  "status": "ok",
  "service": "ramis-erp-backend",
  "websocket": {
    "broadcast_by_event": {
      "table_change": 142,
      "kds_refresh": 87,
      "order_update": 203
    },
    "event_totals": { "...": "..." },
    "active_connections_by_consumer": {
      "OrderConsumer": 3,
      "BranchConsumer": 5,
      "MenuConsumer": 2
    },
    "total_connections_opened_by_consumer": {
      "OrderConsumer": 15,
      "BranchConsumer": 22
    }
  }
}
```

### Kullanım Alanları

| Tüketici | Amaç |
|----------|------|
| **Nginx / HAProxy** | Upstream sağlık kontrolü |
| **Frontend `BackendHealthProvider`** | 120 sn aralıklarla yoklama, bağlantı durumu göstergesi |
| **Ramis Monitor (GTK4)** | Servis izleme paneli |
| **Locust testleri** | Başlangıç doğrulaması |

---

## Kaynak Dosyalar

- [`config/urls.py`](file:///home/sedat/pyProjects/ramis_erp/backend/config/urls.py) — `api_v1_health` view fonksiyonu
- [`ws_metrics.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/ws_metrics.py) — `get_ws_metrics_snapshot()`
