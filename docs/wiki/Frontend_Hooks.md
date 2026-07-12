# Frontend Hooks — Özel React Hook'ları

- **Özet:** Uygulamanın genelinde kullanılan 8 özel React hook'u. Şube bağlamı, RBAC izin kontrolleri, idempotency, media query, temizlik geri sayımı ve debounce işlevlerini kapsar.
- **Kütüphaneler:** React 19, Zustand, TanStack Query
- **Bağlantılar:** [[Frontend_Architecture]], [[State_Management]], [[RBAC]], [[Frontend_RBAC]], [[Frontend_Branches]], [[Frontend_Tables]]

---

## Hook Referansı

### `useBranchContext`

Etkin şubeyi belirler. Detaylı bilgi: [[Frontend_Branches]].

---

### `useCanViewAmounts`

Finansal tutarların görünürlüğünü kontrol eder.

```typescript
const canView = useCanViewAmounts();
// canView === false → tutarlar "***" olarak gösterilir
```

| İzin Kodu | Açıklama |
|-----------|----------|
| `financial.view_amount` | Tutar görüntüleme izni |

İlgili: [[Frontend_Formatters]] — `formatAmount()`, `AMOUNT_DISPLAY_MASK`

---

### `useCleaningCountdown`

Masa temizlik geri sayım zamanlayıcısı. Temizlik süresi dolduğunda otomatik olarak temizliği bitirir (Celery fallback'i).

```typescript
const { remaining, formatted } = useCleaningCountdown(table);
useAutoFinishCleaningOnExpire(table);
```

| Export | Açıklama |
|--------|----------|
| `formatCleaningCountdown(ms)` | Kalan süreyi `"mm:ss"` formatına çevirir |
| `useAutoFinishCleaningOnExpire(table)` | Süre dolunca API çağrısı ile temizliği bitirir |

---

### `useDebounce`

Genel amaçlı debounce hook'u.

```typescript
const debouncedValue = useDebounce(searchQuery, 300);
```

---

### `useIdempotency` (F-14)

POST/PATCH isteklerinde çift gönderimi önler. Her istek için benzersiz UUID üretir.

```typescript
const { key, getAndRefresh } = useIdempotency();
// İstek gönderildiğinde: getAndRefresh() → yeni key üretir ve döner
// Header: X-Idempotency-Key: <uuid>
```

İlgili: [[POS_Offline_Queue]] — Çevrimdışı kuyrukta idempotency key yönetimi.

---

### `useMatchMedia`

SSR-güvenli `window.matchMedia` wrapper'ı. `useSyncExternalStore` kullanır.

```typescript
const isMobile = useMatchMedia("(max-width: 768px)");
const isFullHD = useMatchMedia("(min-width: 1920px)");
```

---

### `useModulePermissions`

RBAC izin kontrol yardımcıları. Auth store'daki izin listesinden kontrol eder.

```typescript
const { canManage } = useModulePermissions();
if (canManage("orders.manage_order")) { /* ... */ }
```

| Fonksiyon | Açıklama |
|-----------|----------|
| `canManage(permission)` | Belirli bir izni kontrol eder |
| `canOperationalManage(key)` | Operasyonel yönetim iznini kontrol eder |

---

### `useRequireModulePermission`

Sayfa seviyesinde izin koruması. İzin yoksa yönlendirme yapar.

```typescript
const { isAllowed, isLoading } = useRequireModulePermission("inventory", "view");
```

| Özellik | Açıklama |
|---------|----------|
| **Mount'ta `/auth/me/` çağrısı** | İzinleri en güncel haliyle alır |
| **View/Manage modları** | Farklı seviye kontrol |
| **Yönlendirme** | İzin yoksa ana sayfaya redirect |

---

## Kaynak Dosyalar

| Hook | Dosya |
|------|-------|
| `useBranchContext` | [`useBranchContext.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useBranchContext.ts) |
| `useCanViewAmounts` | [`useCanViewAmounts.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useCanViewAmounts.ts) |
| `useCleaningCountdown` | [`useCleaningCountdown.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useCleaningCountdown.ts) |
| `useDebounce` | [`useDebounce.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useDebounce.ts) |
| `useIdempotency` | [`useIdempotency.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useIdempotency.ts) |
| `useMatchMedia` | [`useMatchMedia.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useMatchMedia.ts) |
| `useModulePermissions` | [`useModulePermissions.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useModulePermissions.ts) |
| `useRequireModulePermission` | [`useRequireModulePermission.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/hooks/useRequireModulePermission.ts) |
