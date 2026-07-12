# Frontend Performances

> **Özet:** Performans Yönetimi ekranı (`/performances`); garson çağrı geçmişi tablosu, personel yanıt süreleri ve Recharts bar grafiği. [[Sales]] modülünden taşınan dönem filtresi ve rapor export kalıbını kullanır.
> **Kütüphaneler:** React 19, Next.js App Router, TanStack Query, Recharts, next-intl
> **Bağlantılar:** [[Performances]], [[Frontend_Sales]], [[Frontend_Architecture]], [[Branch_Scope]], [[AppSidebar]]

---

## Konum
- **Sayfa:** `frontend/src/app/performances/page.tsx`
- **Feature:** `frontend/src/features/performances/`

## Navigasyon

[[AppSidebar]] → **Mutfak Yönetimi** grubu → **Performans Yönetimi** (`/performances`, `moduleKey: performances`).

`AuthGuard module="performances"` ile korunur.

## Layout

Sales ekranı ile aynı kabuk:
- Üst sekme çubuğu (şu an tek sekme: Garson çağrı analizi)
- Sağ üst `BranchSelect` (`includeAll`)
- Ana panel iki sütun: **sol** veri tabloları, **sağ** grafikler

## Bileşenler

| Bileşen | Dosya | Açıklama |
|---------|-------|----------|
| `WaiterCallPerformancePanel` | `components/WaiterCallPerformancePanel.tsx` | Sol: personel özeti + çağrı geçmişi; sağ: ortalama yanıt süresi bar chart |
| `PeriodFilter` | `components/PeriodFilter.tsx` | Dönem preset + özel tarih aralığı |
| `BranchSelect` | `features/branches/` | Şube filtresi |

## Hook & API

- `useWaiterCallPerformance` — liste (`useInfiniteQuery`) + analytics query
- `performancesApi` — `getWaiterCalls`, `getWaiterCallAnalytics`, `exportWaiterCallsExcel`, `exportWaiterCallsPdf`

## Paylaşılan Filtre Taşıması (Sales → Performances)

Dönem filtresi artık `features/performances/` altında canonical:

| Eski (Sales) | Yeni (Performances) |
|--------------|---------------------|
| `sales/utils/salesPeriod.ts` | `performances/utils/periodFilter.ts` |
| `SalesPeriodFilter` | `PeriodFilter` |

Sales tarafı **geriye dönük uyumluluk** için re-export/wrapper kullanır:
- `SalesPeriodFilter` → `PeriodFilter` (`i18nNamespace="sales"`)
- `getRangeForSalesPeriodPreset` → `getRangeForPeriodPreset`

## Export

Sales İptaller sekmesi ile aynı düğme stili: Excel ve PDF indirme; query parametreleri aktif filtreleri taşır.

## i18n

- `frontend/src/i18n/messages/{tr,en}/performances.json`
- Nav etiketi: `common.nav.performanceManagement`
