# RBAC (Rol Tabanlı Erişim Kontrolü)

> **Özet:** Özel rol ve izin sistemi. Hiyerarşik roller, kategorize edilmiş izinler ve önbelleklenmiş izin kontrolü sağlar. Middleware, decorator ve DRF permission class'ları ile entegredir.
> **Kütüphaneler:** Django, DRF, Redis Cache
> **Bağlantılar:** [[Users]], [[Branch_Scope]], [[Auth_Flow]], [[Django_Settings]], [[Frontend_RBAC]], [[Management_Commands]]

---

## Konum

`backend/rbac/`

## Modeller

### Role (`rbac/models/role.py`)
| Alan | Tip | Açıklama |
|------|-----|----------|
| `name` | `CharField(unique)` | Rol adı (ör: Admin, Kasiyer) |
| `description` | `TextField` | Açıklama |
| `parent_role` | `ForeignKey(self)` | Üst rol (hiyerarşi) |
| `permissions` | `M2M → RolePermission` | Atanmış izinler |
| `is_active` | `BooleanField` | Aktiflik durumu |

**Hiyerarşik Miras:** `get_inherited_permission_codes()` ile alt rol, üst rolün tüm izinlerini miras alır (döngü korumalı).

### RolePermission (`rbac/models/permission.py`)
| Alan | Tip | Açıklama |
|------|-----|----------|
| `name` | `CharField` | İzin adı |
| `description` | `TextField` | İsteğe bağlı uzun açıklama (`seed_rbac --update` ile doldurulabilir) |
| `code` | `CharField(unique)` | İzin kodu (ör: `inventory.manage_stock_item`) |
| `category` | `FK → PermissionCategory` | İzin kategorisi |

### PermissionCategory (`rbac/models/category.py`)
İzinlerin gruplandırıldığı kategoriler.

### RBACAuditLog (`rbac/models/audit.py`)
İzin değişikliklerinin denetim kaydı.

## İzin Kontrol Mekanizmaları

### 1. Middleware (`rbac/middlewares.py`)
`RBACMiddleware` — Her istekte kullanıcının izin kodlarını `request.user_permissions` olarak yükler.

### 2. Decorator'lar (`rbac/permissions.py`)

```python
@permission_required('orders.create_order')           # OR mantığı
@permission_required_all(['inv.view', 'inv.edit'])     # AND mantığı
@permission_forbidden('admin.super_access')            # NOT mantığı
@role_required('Admin')                                # Direkt rol kontrolü
```

### 3. DRF Permission Class (`rbac/drf.py`)
ViewSet'ler için DRF-uyumlu izin sınıfları.

| Sınıf | Mantık | Kullanım |
|-------|--------|----------|
| `RBACPermission` | OR mantığı | Birden fazla izinden herhangi biri yeterli |
| `RBACPermissionAll` | AND mantığı | Tüm izinlerin olması gerekir |
| `RBACPermissionPosOrWaiterOrderWrite` | AND+OR bileşik | POS/garson sipariş yazma için özel |
| `RBACPermissionForbidden` | NOT mantığı | Belirli izni olan kullanıcıları engelle |
| `RBACRoleRequired` | Rol adı kontrolü | Direkt rol adıyla kontrol |

**Action-based izinler** (ModelViewSet): `required_permissions` dict'i action'a göre farklı izin gereksinimleri tanımlar.

```python
class OrderViewSet(ModelViewSet):
    required_permissions = {
        "list": ["orders.view_order"],
        "create": ["orders.create_order"],
        "destroy": ["orders.manage_order"],
    }
```

### 4. Mixin (`rbac/mixins.py`)
`RBACUserMixin` — User modeline `has_permission()` metodu ekler.

## Önbellek (`rbac/cache.py`)

- `RBAC_CACHE_TTL` (varsayılan: 120 saniye) ile izin kontrolleri Redis üzerinden önbelleklenir
- **Versiyonlu anahtar stratejisi:** `rbac:user_perms:v{N}:{user_pk}` — versiyon numarası artırılarak tüm kullanıcıların önbelleği tek atomik işlemle geçersiz kılınır (per-user delete gereksiz)
- Version bump ile invalidasyon: M2M değişikliklerinde versiyon artırılır

## Signals (`rbac/signals.py`)

- `Role.permissions` M2M değişikliğinde → önbellek invalidasyonu
- `User.roles` M2M değişikliğinde → önbellek invalidasyonu
- `post_save` / `post_delete` → `RBACAuditLog` kaydı
- **Thread-local audit user:** `set_audit_user()` / `clear_audit_user()` / `audit_user_context()` — hangi kullanıcının değişikliği tetiklediğini izler

## Context Processors (`rbac/context_processors.py`)

Django template bağlamına `user_permissions`, `user_roles` ve `is_superuser` değerlerini enjekte eder.

## Tarama Araçları (`rbac/utils.py`)

| Fonksiyon | Açıklama |
|-----------|----------|
| `scan_project_permissions_from_views()` | Tüm app view'larını introspect ederek izin kodlarını toplar |
| `create_default_permissions()` | CRUD izin seti oluşturur |
| `create_default_roles()` | Admin (tüm izinler) + User (salt-okunur) rolleri oluşturur |

## Yönetim Komutları

`rbac/management/` altında:
- İzinleri otomatik tarama ve kaydetme (`register_permissions`)
- Varsayılan hiyerarşiyi ve izinleri yükleme (`seed_rbac`):
    - `--lang tr|en` parametresi ile kurulum dili seçilebilir (Varsayılan: `tr`).
    - Bu komut, kategorileri, izinleri ve temel rolleri seçilen dilde (isim ve açıklamalar dahil) oluşturur veya mevcut olanları günceller.
    - `--update`: Yalnızca veritabanında zaten bulunan izin kayıtlarının `description` alanını `--lang` ile günceller; kategori/rol/isim ve rol–izin atamalarına dokunmaz. Seed içinde isteğe bağlı `description_tr` / `description_en` anahtarları tanımlanabilir; tanımlı değilse `_build_permission_description()` şablonu ve `PERMISSION_DESCRIPTION_OVERRIDES` sözlüğü kullanılır; yine yoksa `name_{lang}` metni yazılır.

## API ve Sayfalama

Rol ve izin yönetimi ekranlarında tüm verilerin tek seferde yüklenmesi için `RoleAdminViewSet`, `PermissionAdminViewSet` ve `PermissionCategoryAdminViewSet` uçlarında sayfalama (**pagination**) devre dışı bırakılmıştır.

## Django Ayarları

```python
RBAC_SCAN_EXCLUDE_APPS = ['rbac', 'admin']
RBAC_CACHE_TTL = 120  # saniye
```
