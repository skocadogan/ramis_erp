# API Yanıt Sözleşmesi (Backend)

> **Özet:** DRF view'larında basit hata/başarı mesajları için standart gövde formatı.
> **Bağlantılar:** [[API_Client]], [[Django_Settings]]

---

## Konum

| Dosya | Rol |
|-------|-----|
| `backend/core/api_responses.py` | `detail_response`, `ok_response` yardımcıları |
| `backend/core/exception_handler.py` | Domain istisnalarını HTTP yanıtına çevirir |

## Basit hata (4xx/5xx)

```json
{
  "detail": "İnsan okunur mesaj",
  "code": "OPTIONAL_MACHINE_CODE",
  "error": "Geriye dönük uyumluluk (opsiyonel)"
}
```

- **`detail`:** Birincil mesaj anahtarı (DRF convention).
- **`code`:** İsteğe bağlı makine okunur kod (`IDEMPOTENCY_CONFLICT`, `INSUFFICIENT_STOCK` vb.).
- **`error`:** Eski modüllerle uyumluluk; yeni kodda yalnızca geçiş döneminde.

## Basit başarı

Toast veya bilinçli kullanıcı bildirimi gerektiğinde:

```json
{ "detail": "İşlem tamamlandı." }
```

Veri + mesaj:

```json
{ "detail": "...", "data": { ... } }
```

## Validation

Serializer `raise_exception=True` → DRF alan dict formatı (`{ "field": ["..."] }`) değişmeden kalır.

## Zengin domain yanıtları

Aşağıdaki yapılar endpoint sözleşmesidir; toast katmanına zorlanmaz:

- Stok kontrolü: `{ "ok": false, "issues": [...] }`
- POS idempotency: `{ "status": "created"|"already_processed", "idempotency_key", ... }`
- Satır kilidi (`select_for_update(nowait=True)`): HTTP **409** `{ "detail": "...", "code": "ROW_LOCKED" }` + `Retry-After: 1` (`core/exception_handler.py`)

## Yeni kod kuralı

```python
from core.api_responses import detail_response

return detail_response(_("warehouse_id zorunludur."), http_status=400)
```

Mevcut `error` anahtarlı modül yanıtları (orders, warehouse) kademeli olarak `detail`'e taşınabilir; frontend `extractApiError` her iki anahtarı da okur.
