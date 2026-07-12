# BaseModel

> **Özet:** Tüm Django modellerinin miras aldığı soyut temel model. UUID tabanlı birincil anahtar, zaman damgaları ve soft-delete mekanizması sağlar.
> **Kütüphaneler:** Django ORM
> **Bağlantılar:** [[Users]], [[Branches]], [[Menu]], [[Orders]], [[Inventory]], [[Warehouse]], [[Recycle_Bin]]

---

## Konum

`backend/core/models.py`

## Alanlar

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | `UUIDField` | Otomatik UUID v4 birincil anahtar |
| `created_at` | `DateTimeField` | Oluşturulma zamanı (auto) |
| `updated_at` | `DateTimeField` | Son güncelleme zamanı (auto) |
| `is_active` | `BooleanField` | Soft-delete bayrağı (varsayılan: True) |

## Soft-Delete Mekanizması

`delete()` metodu varsayılan olarak **soft-delete** uygular:
- `is_active = False` yaparak kaydı pasifleştirir
- `hard=True` parametresiyle gerçek silme yapılır

```python
instance.delete()           # Soft delete (is_active=False)
instance.delete(hard=True)  # Gerçek veritabanı silmesi
```

> **Dikkat:** Tüm QuerySet filtrelemelerinde `is_active=True` kontrolü manuel yapılmalıdır. Otomatik bir Manager filtresi yoktur.

## Kullanım

Proje genelinde `core.models.BaseModel` import edilerek tüm modeller bu sınıftan türetilir. Bu sayede:
- Tüm tablolarda UUID PK
- Tutarlı zaman damgaları
- Tek noktadan soft-delete davranışı

Tek istisna: [[RBAC]] modülündeki `Role` ve `RolePermission` modelleri kendi `is_active`, `created_at`, `updated_at` alanlarını tanımlar.
