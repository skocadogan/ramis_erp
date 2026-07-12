# Frontend Dashboard (Restoran Özeti)

> **Özet:** Yönetim özeti sayfası; şube kapsamında operasyonel metrikler ve kısayollar (izinlere göre).
> **Kütüphaneler:** React, TanStack Query
> **Bağlantılar:** [[Dashboard]], [[Branch_Scope]], [[Frontend_Architecture]]

---

## Konum

- **Sayfa:** `frontend/src/app/dashboard/`
- **Backend:** `backend/apps/dashboard/` — bkz. [[Dashboard]]

## Rota

- **`/dashboard`** — Kenar çubukta “Restoran Özeti”.

## Erişim

Veri setleri kullanıcının şube erişimine göre filtrelenir (`resolve_dashboard_branch_ids`); ayrıntı [[Branch_Scope]].
