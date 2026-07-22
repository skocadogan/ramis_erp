# Frontend Prep

> **Özet:** Hazırlık görevleri, şablonlar ve akıllı kurallar yönetimi ekranları. KDS içinden erişilebilen Prep Drawer ve büyük ekran Station Display de bu modüle bağlıdır.
> **Kütüphaneler:** React, TanStack Query, WebSocket
> **Bağlantılar:** [[Prep]], [[Frontend_Architecture]], [[Frontend_KDS]], [[Frontend_WebSocket]]

---

## Konum
- **Sayfa:** `frontend/src/app/prep-management/`
- **Feature:** `frontend/src/features/prep/`

---

## Önemli Bileşenler

| Dosya | Rol |
|-------|-----|
| `features/prep/components/PrepListDrawer.tsx` | KDS içi hazırlık görev çekmecesi — CRUD + kullanıcı atama |
| `features/prep/hooks/usePrepSocket.ts` | `kitchenNotificationsHubKey` WS aboneliği + react-query cache güncelleme |
| `features/prep/utils/mergePrepWsCache.ts` | WS mesajından gelen task'ı mevcut query cache'e yazar |
| `features/prep/services/prepApi.ts` | `getTasks`, `createTask`, `patchTask`, `getBranchUsers` |

---

## Kullanıcı Atama Özelliği (PrepListDrawer)

`PrepListDrawer` şubeye bağlı kullanıcıları `prepApi.getBranchUsers(branchId)` ile çeker ve iki yerde sunar:

### Yeni Görev Formunda
```
<select value={newAssignedTo} onChange={...}>
  <option value="">Kişi seçin</option>
  {branchUsers.map(u => <option key={u.id} value={u.id}>...</option>)}
</select>
```
`handleCreate` sırasında `assigned_to: newAssignedTo || undefined` payload'a eklenir.

### Mevcut Görev Kartında (Inline)
- `task.assigned_to_name` varsa indigo rozet gösterir; tıklayınca dropdown açılır.
- Dropdown: "Atanmamış" + şube kullanıcıları listesi.
- Seçim → `assignMutation.mutate({ taskId, userId })` → `prepApi.patchTask(taskId, { assigned_to: userId })` → backend PATCH, WS yayını, anlık güncelleme.
- İzin kontrolü: `canManage("prep.change_preptask")` — yoksa salt okunur rozet gösterilir.

### API Metodu
```typescript
// prepApi.ts
patchTask: async (taskId, data) =>
  api.patch<PrepTask>(`/prep/tasks/${taskId}/`, data, skipInterceptorToast)
```

---

## WS Aboneliği (usePrepSocket)

`usePrepSocket(branchId?)` hook'u `managedWebSocket` / `sharedWebSocketHub` üzerinden `kitchenNotificationsHubKey` kanalına bağlanır.  
Backend JWT modunda bağlantı için `orders.view_kds` / `prep.view_preptask` **veya** POS/garson (`orders.view_order` / `orders.manage_order` / `waiter.access`) gerekir (Hazırlık Yönetimi yalnız prep izniyle, kasiyer KDS izni olmadan da canlı güncellenir).  
Gelen `prep_updated` veya `kds_refresh[prep_update]` mesajları `mergePrepWsCache` aracılığıyla react-query önbelleğini günceller:

| Query ailesi | WS davranışı |
|--------------|--------------|
| `prep-tasks` (KDS drawer) | Nokta atışı `setQueryData` merge |
| `prep-tasks-infinite`, `prep-task-count` (prep-management) | Her incremental `prep_updated` sonrası `invalidateQueries` → HTTP refetch |

Hem `prep-management` sayfası hem de `kds/page.tsx` bu hook'u kullanır — çapraz ekran senkronu aynı mutfak hub üzerinden çalışır.

---

## i18n Anahtarları (prep.json)

| Anahtar | TR | EN |
|---------|----|----|
| `drawer.assignPlaceholder` | Kişi seçin | Select person |
| `drawer.unassigned` | Atanmamış | Unassigned |
| `drawer.errorAssign` | Atama başarısız | Assignment failed |
