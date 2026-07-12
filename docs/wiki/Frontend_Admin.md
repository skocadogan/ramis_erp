# Frontend Admin (Yönetim Paneli)

> **Özet:** Kullanıcı, rol, izin yönetimi, şube/bölge, mutfak istasyonları, POS terminalleri, garson/aşçı/müdür atamaları ve rapor/yazıcı ayarları sekmeleri.
> **Kütüphaneler:** React, TanStack Query
> **Bağlantılar:** [[Users]], [[RBAC]], [[Branches]], [[Frontend_Architecture]], [[ReceiptDesignerTab]], [[Internationalization]]

## Konum

- **Sayfa (birincil):** `frontend/src/app/panel/`
- **Eski yol:** `frontend/src/app/admin/` — Django ` /admin/` ile çakışmayı önlemek için `/panel`’e yönlendirir
- **Feature:** `frontend/src/features/admin/`

## Rota

- **`/panel`** — sekme sorgusu (`?tab=overview`, `users`, `roles`, `branches`, …)
- **`/admin`** — kalıcı yönlendirme → `/panel` (query korunur)

## Kullanıcı düzenleme — parola sıfırlama

**Kullanıcılar** sekmesinde bir kayıt düzenlenirken modal içinde **Parola sıfırlama** alanı gösterilir:

- **Kimler görür:** Oturumda `users.manage_user` izni olan veya süper kullanıcı (`useModulePermissions` — `UserFormModal`).
- **Davranış:** “Şifre alanlarını göster” ile yeni şifre + tekrar; **Parolayı sıfırla** isteği `POST .../admin/users/{id}/reset_password/` ile gider (diğer kullanıcı bilgilerinden bağımsız).
- Ayrıntılı API ve RBAC: [[Users]] (Yönetici parola sıfırlama).

## Yerelleştirme (Internationalization)

Tüm Admin paneli sekmeleri `next-intl` altyapısına taşınmıştır.

- **Namespace:** `admin` (genel sekmeler), `pos` (POS ayarları alt panelleri), `users` (kullanıcı listesi).
- **Kapsam:** Audit, POS Settings, Assignments, Reporting, Inventory, Roles, Menu, Kitchen Stations ve Users sekmelerindeki tüm statik metinler, modal içerikleri ve tablo başlıkları yerelleştirilmiştir.
- **Önemli:** Modallarda kullanılan ortak kontroller `src/features/admin/components/ui/ModalControls.tsx` üzerinden yönetilir ve `admin.common` anahtarlarını kullanır.
