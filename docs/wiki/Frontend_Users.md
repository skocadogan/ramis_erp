# Frontend Users — Kullanıcı Yönetim Ekranları

- **Özet:** Kullanıcı CRUD işlemleri, profil düzenleme ve şifre değiştirme ekranlarını kapsar. Admin panelinin `users` sekmesinde tam liste ve detay yönetimi, üst menüdeki profil modalı ile kişisel bilgi güncelleme sunar. Toplam ~60KB bileşen kodu içerir.
- **Kütüphaneler:** React, TanStack Query, Radix UI, react-hook-form
- **Bağlantılar:** [[Frontend_Admin]], [[Users]], [[RBAC]], [[Branches]]

---

## Bileşenler

### `UserList` (~15KB)

Kullanıcı listesi tablosu. Admin paneli `/panel?tab=users` sekmesinde gösterilir.

| Özellik | Açıklama |
|---------|----------|
| **Arama** | İsim, e-posta ile filtreleme |
| **Sıralama** | Kolon bazlı sıralama |
| **Aksiyonlar** | Düzenle, sil (soft-delete), detay görüntüle |
| **RBAC** | `users.manage_user` izni gerektirir |

### `UserFormModal` (~21KB)

Kullanıcı oluşturma ve düzenleme formu.

| Alan | Açıklama |
|------|----------|
| `username` | Benzersiz kullanıcı adı |
| `email` | E-posta adresi |
| `first_name`, `last_name` | Ad, soyad |
| `preferred_language` | Tercih edilen dil (TR/EN) |
| `is_active` | Aktif/pasif durumu |
| `roles` | Atanmış roller (çoklu seçim) |
| `branches` | Erişim yetkisi olan şubeler |
| `pin` | POS giriş PIN kodu |

### `UserDetailModal` (~10KB)

Salt okunur kullanıcı detay görüntüsü. Rol, şube ve izin özeti.

### `ProfileModal` (~9.4KB)

Kullanıcının kendi profilini düzenlemesi. `AppHeader` içindeki avatar menüsünden açılır.

| Özellik | Açıklama |
|---------|----------|
| **Ad / Soyad** | Kişisel bilgi güncelleme |
| **Dil** | `preferred_language` değişikliği |
| **PIN** | POS PIN güncelleme |

### `ChangePasswordModal` (~5.6KB)

Mevcut şifre doğrulama + yeni şifre belirleme formu.

---

## API Endpoint'leri

| Yöntem | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/api/v1/users/` | Kullanıcı listesi |
| `POST` | `/api/v1/users/` | Yeni kullanıcı oluştur |
| `GET` | `/api/v1/users/{id}/` | Kullanıcı detayı |
| `PATCH` | `/api/v1/users/{id}/` | Kullanıcı güncelle |
| `DELETE` | `/api/v1/users/{id}/` | Soft-delete |
| `GET` | `/api/v1/users/me/` | Oturumdaki kullanıcı bilgisi |
| `PATCH` | `/api/v1/users/me/` | Profil güncelleme |
| `POST` | `/api/v1/users/me/change-password/` | Şifre değiştirme |

---

## Kaynak Dosyalar

- [`UserList.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/features/users/components/UserList.tsx)
- [`UserFormModal.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/features/users/components/UserFormModal.tsx)
- [`UserDetailModal.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/features/users/components/UserDetailModal.tsx)
- [`ProfileModal.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/features/users/components/ProfileModal.tsx)
- [`ChangePasswordModal.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/features/users/components/ChangePasswordModal.tsx)
