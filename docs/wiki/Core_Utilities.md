# Core Utilities — Çekirdek Yardımcı Modüller

- **Özet:** Backend çekirdek katmanında kullanılan ortak yardımcı fonksiyonları kapsar: JSON güvenli serileştirme, Redis URL yönetimi, çeviri bağlam yöneticisi ve ondalık sabitler. Bu modüller tüm uygulama katmanları tarafından paylaşılır.
- **Kütüphaneler:** Python stdlib (decimal, uuid, datetime, urllib), Django (translation, settings)
- **Bağlantılar:** [[Django_Settings]], [[Backend_Environment]], [[Internationalization]], [[Inventory]], [[Kitchen_Closing]], [[Sales]]

---

## 1. JSON Serileştirme (`json_utils.py`)

`JSONField` ve API gövdeleri için Python nesnelerini JSON uyumlu türlere dönüştürür.

```python
from core.json_utils import to_json_safe

data = to_json_safe({
    "price": Decimal("12.50"),    # → 12.5  (float)
    "count": Decimal("5"),        # → 5     (int)
    "id": UUID("..."),            # → "..."  (str)
    "created": datetime.now(),    # → "2026-05-29T14:30:00" (isoformat)
    "items": [Decimal("1.0")],    # → [1.0]
})
```

### Dönüşüm Kuralları

| Kaynak Tür | Hedef | Koşul |
|------------|-------|-------|
| `Decimal` | `int` | Tam sayı değerindeyse |
| `Decimal` | `float` | Ondalık kısım varsa |
| `UUID` | `str` | Her zaman |
| `datetime` / `date` | `str` (ISO 8601) | Her zaman |
| `dict` / `list` | Rekürsif dönüşüm | — |

---

## 2. Redis URL Yardımcıları (`redis_urls.py`)

Tek bir `REDIS_URL` ortam değişkeninden farklı amaçlar için Redis DB URL'leri türetir.

```python
from core.redis_urls import derive_redis_db, redis_url_with_connect_timeout

# DB numarası değiştirme
cache_url = derive_redis_db("redis://localhost:6379/0", db=1)
# → "redis://localhost:6379/1"

# Bağlantı timeout'u ekleme
url = redis_url_with_connect_timeout("redis://localhost:6379/0", timeout_seconds=3)
# → "redis://localhost:6379/0?socket_connect_timeout=3"
```

### Kullanım Alanları (settings.py)

| Amaç | DB | Açıklama |
|------|----|----------|
| Celery Broker | `/0` | Görev kuyruğu |
| Django Cache | `/1` | Genel önbellek |
| Channels Layer | `/2` | WebSocket katmanı |
| Celery Result | `/3` | Görev sonuçları |

---

## 3. Çeviri Bağlam Yöneticisi (`translation_context.py`)

Arka plan görevlerinde (Celery, PDF üretimi, e-posta) kullanıcının tercih ettiği dilde içerik üretmek için.

```python
from core.translation_context import user_language

with user_language(user.preferred_language):
    html = render_to_string("reports/shift_summary.html", context)
    # → Kullanıcının dil tercihine göre şablon render edilir
```

- Boş veya `None` dil kodu → `settings.LANGUAGE_CODE` (Türkçe) kullanılır
- İstek bağlamı dışında (Celery worker vb.) çalışır

---

## 4. Ondalık Sabitler (`decimal_constants.py`)

Stok ve para hesaplamalarında `Decimal('0')` tekrarını önler.

```python
from core.decimal_constants import ZERO_DECIMAL, ZERO_MONEY, ZERO_QTY

total = ZERO_MONEY       # Decimal('0')
stock_qty = ZERO_QTY     # Decimal('0')
```

---

## 5. Miktar Gösterim Biçimlendirme (`quantity_format.py`)

ORM stok alanları 6 ondalık basamakla saklanır; kullanıcıya/notlara yazılırken gereksiz sıfırlar kaldırılır.

```python
from core.quantity_format import format_quantity_display, format_signed_quantity_display

format_quantity_display(Decimal('19.000000'))   # → '19'
format_quantity_display(Decimal('1.500000'))   # → '1.5'
format_signed_quantity_display(Decimal('-2'))   # → '-2'
```

### Kullanım alanları

| Modül | Kullanım |
|-------|----------|
| `KitchenClosingService` | Gün sonu fire notları (`Teorik / Sayılan / Fire`) — bkz. [[Kitchen_Closing]] |
| `StockCountingService` | Onay sonrası hareket notlarındaki fark miktarı |
| `stock_movement_service` | `Sayım düzeltmesi: +N` referans metni |
| `_helpers.InsufficientStockError` | Hata mesajındaki mevcut/istenen miktarlar |

Hesaplama katmanında `Decimal` tam hassasiyet korunur; yalnızca **gösterim ve metin** katmanında bu yardımcılar kullanılır.

**Test:** `core/tests/test_quantity_format.py`

---

## Kaynak Dosyalar

- [`json_utils.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/json_utils.py)
- [`redis_urls.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/redis_urls.py)
- [`translation_context.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/translation_context.py)
- [`decimal_constants.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/decimal_constants.py)
- [`quantity_format.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/quantity_format.py)
