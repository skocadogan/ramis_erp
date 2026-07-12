# POS Bağlı Cihazlar (Connected Users / Connections)

> **Özet:** Bir POS terminaline bağlı aktif kullanıcı oturumlarını listeleyen ve yöneticilere oturum kesme (disconnect) yetkisi veren özellik. Backend'de `PosTerminalViewSet` üzerinden, frontend'de `ConnectedUsersModal` ile sunulur.
> **Kütüphaneler:** Django DRF, React, Zustand, TanStack Query
> **Bağlantılar:** [[POS_Display]], [[Frontend_POS]], [[RBAC]], [[State_Management]]

---

## Gerekli İzin: `pos.manage_connections`

Bu özelliği görmek ve kullanmak için kullanıcının `pos.manage_connections` iznine sahip olması gerekir.

| Kontrol Noktası | Davranış |
|----------------|----------|
| **POSHeader butonu** | `canManage(PERMISSION_POS_MANAGE_CONNECTIONS)` → false ise buton gizlenir |
| **Backend `connections` endpoint** | `pos.view_pos`, `pos.manage_display`, `waiter.access`, `pos.manage_connections`'tan herhangi biri yeterliydi (**OR** mantığı) |
| **Backend `disconnect_connection` endpoint** | Yalnızca `pos.manage_connections` gerekir |

> **Not:** `seed_rbac.py` içinde **Yönetici**, **Kasiyer** ve **Garson** rollerine otomatik atanır.

---

## Backend: `PosTerminalViewSet` (Connections Aksiyonları)

**Konum:** `backend/apps/pos_display/views.py`

### `connections` aksiyonu (`GET /api/v1/pos-display/terminals/{id}/connections/`)

Terminale bağlı aktif WebSocket bağlantı oturumlarını döner.

**İzinler (OR mantığı):**
```python
permission_codes = [
    "pos.view_pos",
    "pos.manage_display",
    "waiter.access",
    "pos.manage_connections",
]
```

### `disconnect_connection` aksiyonu (`POST /api/v1/pos-display/terminals/{id}/disconnect_connection/`)

Belirtilen oturumu zorla kapatır.

**İzinler:**
```python
permission_codes = ["pos.manage_connections"]
```

---

## Frontend: `ConnectedUsersModal.tsx`

**Konum:** `frontend/src/features/pos/components/ConnectedUsersModal.tsx`

- `TanStack Query` ile bağlı oturumları listeler.
- Her oturum için kullanıcı adı, bağlantı zamanı ve **"Bağlantıyı Kes"** butonu sunar.
- `canManagePosConnections(user.permissions, user.is_superuser)` ile oturum kesme butonu ek olarak koşullara bağlanır.

---

## Frontend: `POSHeader.tsx` — Buton Gösterim Mantığı

**Konum:** `frontend/src/features/pos/components/POSHeader.tsx`

```typescript
const { canManage } = useModulePermissions();
const canOpenConnectedUsers = canManage(PERMISSION_POS_MANAGE_CONNECTIONS);
// ...
{canOpenConnectedUsers && (
  <Button onClick={() => setConnectedUsersOpen(true)}>
    Bağlı Cihazlar
  </Button>
)}
```

`useModulePermissions` hook'u, `useRequireModulePermission` guard'ından güncellenen `user.permissions` Zustand store'undan okur. Bu sayede RBAC değişikliği sonrası sayfa yenilemesi yeterlidir.

---

## İzin Senkronizasyonu (Frontend Guard)

`useRequireModulePermission.ts` artık her guard mount edildiğinde `/auth/me/` uç noktasından güncel izinleri çekerek Zustand store'unu günceller. Bu, RBAC rolü değiştirilen bir kullanıcının sonraki sayfa geçişinde otomatik olarak güncel izinlerle çalışmasını sağlar.

---

*Bu sayfa INGEST 2026-05-20 operasyonu ile oluşturulmuştur.*
