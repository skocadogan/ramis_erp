# Users (Kullanıcı Yönetimi)

> **Özet:** Django AbstractUser'dan türetilen özel kullanıcı modeli. UUID PK, şube bağlantısı ve RBAC rol ataması içerir.
> **Kütüphaneler:** Django Auth, SimpleJWT, RBAC
> **Bağlantılar:** [[Auth_Flow]], [[RBAC]], [[Branches]], [[Branch_Scope]], [[User_Emergency_Admin]]

---

## Konum
`backend/apps/users/`

## Model: User
`AbstractUser` + `RBACUserMixin` + `BaseModel` üçlü miras.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | `UUIDField` | BaseModel'den |
| `email` | `EmailField(unique)` | Benzersiz e-posta |
| `branch` | `FK → Branch` | Varsayılan şube |
| `roles` | `M2M → rbac.Role` | RBAC rolleri |

## Auth Dosyaları
- `auth.py` — `CookieJWTAuthentication`
- `views.py` — `CustomTokenObtainPairView`, `CustomTokenRefreshView`, `CheckPinUserView`, `PinTokenObtainView`
- `throttling.py` — `LoginRateThrottle` (5/dk/IP), `PasswordResetRateThrottle`
- `login_throttle.py` — `clear_login_throttle()` / `clear_login_throttle_keys()` (Redis `throttle_login_*` temizliği; CLI ve [[User_Emergency_Admin]] ile paylaşılır)

## Seeding (Veri Yükleme)
`seed_full` komutu ile varsayılan kullanıcılar ve izinler yüklenebilir. 
- `--users`: Sadece kullanıcıları kurar/günceller.
- `--no-flush`: Mevcut verileri silmeden ekleme yapar.
- Mevcut kullanıcılar varsa şifreleri ve rolleri varsayılana güncellenir.

## Ayar
```python
AUTH_USER_MODEL = 'users.User'
```

---

## Yönetici parola sıfırlama (KDS dışı — panel)

Şube kapsamına uyan kullanıcı kayıtları için, **Kullanıcı Yönetimi** yetkisi olan veya **süper kullanıcı** tarafından yeni parola atanabilir.

| Bileşen | Açıklama |
|---------|----------|
| API | `POST /api/v1/admin/users/{id}/reset_password/` |
| Gövde | `{ "password": "<yeni_parola>" }` (en az 8 karakter; Django `validate_password`) |
| Yetki | ViewSet `RBACPermission`: **`users.manage_user`**. Süper kullanıcı (`is_superuser`) tüm uçlarda istisna (bkz. [[RBAC]] — DRF `RBACPermission`). |
| Şube kapsamı | `UserAdminViewSet.get_queryset` — yalnız erişilebilir şubedeki kullanıcılar için geçerli (bkz. [[Branch_Scope]]). |
| UI | Panel **Kullanıcı Düzenle** modalında “Parola sıfırlama” bölümü; `frontend/src/features/users/components/UserFormModal.tsx`. |
| İstemci | `adminApi.resetPassword(id, password)` — `frontend/src/features/admin/services/adminApi.ts` |

---

## Acil kullanıcı yönetimi (panel dışı — masaüstü aracı)

Sunucuda oturum veya panel erişimi olmadığında kullanılmak üzere `system_utils/user_emergency/` altında GTK tabanlı bir araç bulunur: kullanıcıları **pasifleştirme** ([[BaseModel]] yumuşak silme), **parola atama**, **yeni süper kullanıcı** oluşturma ve **login kilidi kaldırma**. RBAC ve şube kapsamı uygulanmaz; ayrıntılar bkz. [[User_Emergency_Admin]].
