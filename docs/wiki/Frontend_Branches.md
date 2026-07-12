# Frontend Branches — Şube Yönetim Bileşenleri

- **Özet:** Şube seçimi dropdown'ı ve kullanıcı-şube atama modalından oluşan frontend şube yönetim bileşenleridir. Admin panelinde kullanılır ve çoklu şube desteği olan kullanıcılar ile süper kullanıcılar için şube bağlamı sağlar.
- **Kütüphaneler:** React, Radix UI
- **Bağlantılar:** [[Branches]], [[Frontend_Admin]], [[Branch_Scope]], [[Frontend_Tables]], [[Frontend_Reservations]]

---

## Bileşenler

### `BranchSelect` (~2.7KB)

Şube seçim dropdown'ı. Kullanıcının erişebildiği şubeleri listeler.

| Kullanım Alanı | Açıklama |
|----------------|----------|
| **Admin Panel** | Şube bazlı veri filtreleme |
| **Masa Sayfası** | `useBranchContext` hook'u ile |
| **Rezervasyon Sayfası** | Şube bazlı masa listeleme |

### `BranchUserModal` (~9.2KB)

Kullanıcıları şubelere atama/çıkarma modalı.

| Özellik | Açıklama |
|---------|----------|
| **Toplu Atama** | Birden fazla kullanıcıyı aynı şubeye atama |
| **Çoklu Şube** | Bir kullanıcıya birden fazla şube yetkisi |
| **RBAC** | `branches.manage_branch` izni gerektirir |

---

## `useBranchContext` Hook

Şube seçim mantığını soyutlayan hook. Farklı sayfalarda tekrar eden "etkin şubeyi belirle" ihtiyacını karşılar.

```typescript
const { activeBranch, branches, setBranch } = useBranchContext();
```

### Çözümleme Sırası

1. Kullanıcı tek şubeye atanmışsa → o şube
2. Çoklu şube → şube seçici göster
3. Süper kullanıcı → admin API'sinden tüm şubeler, seçici göster

---

## Kaynak Dosyalar

- [`BranchSelect.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/features/branches/components/BranchSelect.tsx)
- [`BranchUserModal.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/features/branches/components/BranchUserModal.tsx)
- [`useBranchContext.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useBranchContext.ts)
