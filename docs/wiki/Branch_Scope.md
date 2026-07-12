# Branch Scope (Şube Veri İzolasyonu)

> **Özet:** Şube bazlı veri sızıntısını önleyen güvenlik katmanı. Süper kullanıcı dışındaki tüm kullanıcılar yalnızca atandıkları şubelerin verilerine erişebilir. Tüm modüllerde kullanılan kritik bir güvenlik bileşenidir.
> **Kütüphaneler:** Django ORM, Custom QuerySet Filtering
> **Bağlantılar:** [[Branches]], [[Users]], [[RBAC]], [[Warehouse]], [[Dashboard]]

---

## Konum

`backend/core/branch_scope.py`

## Temel Fonksiyonlar

### `accessible_branch_id_strings(user)`
Kullanıcının erişebildiği şube ID'lerini döndürür.

| Dönüş | Anlam |
|-------|-------|
| `None` | Süper kullanıcı — tüm şubelere erişim |
| `frozenset()` (boş) | Erişilebilir şube yok |
| `frozenset({...})` | Belirli şubeler |

**Erişim Kaynakları:**
1. `user.branch_id` — Doğrudan şube ataması
2. `user.branches` M2M — Üyelik atamaları
3. `WaiterBranchAssignment` — Garson atamaları
4. `CookStationAssignment` — Aşçı atamaları
5. `ManagerBranchAssignment` — Müdür atamaları

### `branch_filter_qs(qs, request, field='branch_id')`
QuerySet'i kullanıcının erişebildiği şubelerle filtreler.
- Süper kullanıcı: `?branch_id` query param ile isteğe bağlı daraltma
- Normal kullanıcı: Otomatik filtreleme

### `user_may_access_branch(user, branch_id)`
Kullanıcının belirli bir şubeye erişip erişemeyeceğini kontrol eder.

## Depo Kapsamı

### `user_accessible_warehouse_id_strings(user)`
Depo erişimi şube-depo M2M kesişimi üzerinden hesaplanır.

**İki katmanlı kapsam:**
1. **Staff Scoping (Aşçı):** Yalnızca atanmış istasyonların depoları
2. **Managerial Scoping:** Erişilebilir şubelere bağlı tüm depolar

### `filter_warehouse_transfer_queryset(qs, user)`
Transfer kayıtlarında kaynak VEYA hedef depo erişimi (`OR` mantığı).

## Menü Kapsamı

### `menu_product_queryset_filtered(base_qs, request)`
Ürün filtreleme: `branches` M2M boş ise tüm şubelerde görünür.

### `menu_category_queryset_filtered(base_qs, request)`
Kategori filtreleme: istasyon ve ürün şube ilişkisi üzerinden.

## Dashboard Kapsamı

### `resolve_dashboard_branch_ids(request)`
Dashboard verileri için şube kapsamı çözümleme. `(branch_ids, error)` tuple döner.

## WebSocket Kapsamı

### `resolve_websocket_branch_subscription(user, query_branch_id_raw)`
WebSocket bağlantı kapsamı. Tek erişilebilir şube varsa otomatik seçilir; birden fazlaysa açık `branch_id` gerekir.
