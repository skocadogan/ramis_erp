# Geri Dönüşüm Kutusu (Recycle Bin)

> **Özet:** [[BaseModel]] ile soft-delete edilen kayıtların listelenmesi, geri yükleme, toplu geri yükleme ve süper kullanıcı için kalıcı silme/çöp kutusu boşaltma arayüzü. Backend API tüm modelleri otomatik keşfeder; frontend'de model bazlı filtreleme ve arama sunar.
> **Kütüphaneler:** Django REST Framework, React, TanStack Query
> **Bağlantılar:** [[BaseModel]], [[RBAC]], [[Frontend_Architecture]], [[Backup_Restore]]

---

## Backend API

### Konum

- `backend/core/views.py` — `RecycleBinSummaryView`, `RecycleBinListView`, `RecycleBinActionView`
- `backend/core/urls.py` — Endpoint routing

### İzinler

`RecycleBinPermission` — **Yalnızca `is_superuser`** olan kullanıcılar erişebilir.

### Soft-Delete Algılama

`get_model_soft_delete_info(model)` fonksiyonu modelin soft-delete destekleyip desteklemediğini otomatik algılar:

| Alan | Silindi Değeri | Açıklama |
|------|---------------|----------|
| `is_deleted` | `True` | Tercih edilen yöntem |
| `is_active` | `False` | Eski modeller için fallback |

### Endpoint'ler

#### `GET /api/v1/recycle-bin/summary/`

Silinmiş kayıt sayılarını model bazında döner.

```json
[
  { "app_label": "menu", "model_name": "product", "verbose_name": "product", "count": 3 },
  { "app_label": "orders", "model_name": "order", "verbose_name": "order", "count": 1 }
]
```

#### `GET /api/v1/recycle-bin/list/{app_label}/{model_name}/`

Belirli bir modelin silinmiş kayıtlarını listeler.

| Parametre | Açıklama |
|-----------|----------|
| `search` | İsim bazlı arama (küçük harf) |

**Sıralama:** `deleted_at` → `updated_at` (varsa)

**İsim çözümleme:** `name` → `username` → `str(obj)` (öncelik sırasıyla)

#### `POST /api/v1/recycle-bin/action/`

Tekli veya toplu işlem.

| Parametre | Zorunlu | Açıklama |
|-----------|---------|----------|
| `app_label` | ✅ | Django app etiketi |
| `model_name` | ✅ | Model adı |
| `action` | ✅ | İşlem türü |
| `id` | Tekli için | Kayıt UUID'si |

### Desteklenen İşlemler

| İşlem | Açıklama | ID Gerekli |
|-------|----------|-----------|
| `restore` | Tek kaydı geri yükle | ✅ |
| `hard_delete` | Tek kaydı kalıcı sil | ✅ |
| `restore_all` | Modeldeki tüm silinmişleri geri yükle | ❌ |
| `empty_bin` | Modeldeki tüm silinmişleri kalıcı sil | ❌ |

### Kalıcı Silme Davranışı

1. Model `is_deleted` alanına sahipse → `obj.delete()` (Django standart)
2. Model `is_active` alanına sahipse → `obj.delete(hard=True)` denenir, `TypeError` alınırsa → `obj.delete()`
3. `ProtectedError` durumunda → bağımlılık hatası döner

### Geri Yükleme Davranışı

- `is_deleted` → `False`, `is_active` → `True` (ters çevirme)
- `deleted_at` varsa → `None` olarak sıfırlanır
- `updated_at` → otomatik güncellenir

---

## Frontend

### Konum

- **Sayfa:** `frontend/src/app/recycle-bin/`
- **Feature:** `frontend/src/features/recycle-bin/` (`recycleBinApi`)

### Rota

**`/recycle-bin`** — Yalnızca süper kullanıcı için.

### Özellikler

- Model seçimi dropdown'ı (silinen kayıt bulunan modeller)
- Arama filtresi
- Tekli geri yükleme / kalıcı silme
- Toplu geri yükleme / çöp kutusu boşaltma
- Onay modalları ile korumalı kalıcı silme işlemleri

---

## Notlar

- Kalıcı silme geri alınamaz; üretim verisi silmeden önce [[Backup_Restore]] ile yedekleme yapılmalıdır.
- `ProtectedError` durumunda silme engellenir ve kullanıcıya bağımlılık bilgisi gösterilir.
- `empty_bin` işlemi bağımlılık hatası olan kayıtları atlayarak diğerlerini siler (kısmi başarı).

---

## Kaynak Dosyalar

- [`views.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/views.py) — Backend API
- [`urls.py`](file:///home/sedat/pyProjects/ramis_erp/backend/core/urls.py) — Routing
