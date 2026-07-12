# Frontend RBAC — İstemci Tarafı İzin Sistemi

- **Özet:** Frontend'de RBAC izin kontrolünü sağlayan altyapı. 18 modül grubundaki izin tanımları, sayfa/bileşen düzeyinde guard'lar ve izin tabanlı UI gizleme mekanizmalarını kapsar. Backend [[RBAC]] sisteminin istemci aynasıdır.
- **Kütüphaneler:** React 19, Zustand (AuthStore)
- **Bağlantılar:** [[RBAC]], [[Frontend_Hooks]], [[State_Management]], [[Auth_Flow]]

---

## 1. İzin Tanımları (`lib/constants.ts`, ~15.6KB)

### Modül İzin Grupları (`RBAC_PERMISSION_GROUPS`)

18 modül grubu, her biri `moduleAccess` ve `operationalManage` izinleri ile tanımlı:

| Modül | Erişim İzni | Yönetim İzni |
|-------|-------------|-------------|
| `menu` | `menu.view_menu` | `menu.manage_menu` |
| `orders` | `orders.view_order` | `orders.manage_order` |
| `inventory` | `inventory.view_stock` | `inventory.manage_stock` |
| `warehouse` | `warehouse.view_warehouse` | `warehouse.manage_warehouse` |
| `sales` | `sales.view_sale` | `sales.manage_sale` |
| `shifts` | `shifts.view_shift` | `shifts.manage_shift` |
| `invoices` | `invoices.view_invoice` | `invoices.manage_invoice` |
| `reservations` | `reservations.view_reservation` | `reservations.manage_reservation` |
| `recipes` | `recipes.view_recipe` | `recipes.manage_recipe` |
| `prep` | `prep.view_prep` | `prep.manage_prep` |
| `production` | `production.view_production` | `production.manage_production` |
| `performances` | `performances.view_performance` | `performances.manage_performance` |
| `credit` | `credit.view_credit` | `credit.manage_credit` |
| `reporting` | `reporting.view_report` | `reporting.manage_report` |
| `allergens` | `allergens.view_allergen` | `allergens.manage_allergen` |
| `users` | `users.view_user` | `users.manage_user` |
| `branches` | `branches.view_branch` | `branches.manage_branch` |
| `tables` | `tables.view_table` | `tables.manage_table` |

### Özel İzinler

| İzin Kodu | Açıklama |
|-----------|----------|
| `orders.manage_smart_firing` | Smart Firing v2 yönetimi |
| `warehouse.delete_stock_counting_final` | Kesinleşmiş sayım silme |
| `financial.view_amount` | Finansal tutarları görme |
| `pos.manage_connections` | POS bağlantı yönetimi |

### Yardımcı Fonksiyonlar

| Fonksiyon | Açıklama |
|-----------|----------|
| `hasModuleAccess(permissions, module)` | Modül erişim kontrolü |
| `getAccessibleModules(permissions)` | Erişilebilir modül listesi |
| `hasOperationalManageAccess(permissions, module)` | Yönetim izni kontrolü |
| `hasKdsShortcutAccess(permissions)` | KDS kısayol erişimi |
| `hasPermission(permissions, code)` | Tekil izin kontrolü |

---

## 2. Bileşen Düzeyinde Guard'lar

### `AuthGuard` (`components/auth/AuthGuard.tsx`)

Modül seviyesinde izin koruma bileşeni.

```tsx
<AuthGuard module="inventory" mode="view">
  <InventoryPage />
</AuthGuard>
```

| Prop | Açıklama |
|------|----------|
| `module` | Kontrol edilecek modül adı |
| `mode` | `"view"` veya `"manage"` |
| `auth_only` | Sadece oturum kontrolü (izin kontrolü yok) |

### Hook Guard'lar

- `useRequireModulePermission` — Sayfa seviyesinde (detay: [[Frontend_Hooks]])
- `useModulePermissions` — Bileşen seviyesinde

---

## 3. Sidebar İzin Filtreleme

`AppSidebar` navigasyon menüsü, `MODULE_PERMISSIONS` haritasını kullanarak kullanıcının erişimi olmayan modülleri gizler.

---

## Kaynak Dosyalar

- [`constants.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/constants.ts)
- [`AuthGuard.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/components/auth/AuthGuard.tsx)
- [`useModulePermissions.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useModulePermissions.ts)
- [`useRequireModulePermission.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useRequireModulePermission.ts)
