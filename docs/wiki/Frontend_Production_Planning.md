# Frontend Production Planning
> **Özet:** Günlük üretim planları, MRP, FEFO yaklaşık maliyet modalı (ürün satırı altında genişletilebilir hammadde kırılımı), 86 listesi yönetimi ve POS entegrasyon ayarları ekranları.
> **Kütüphaneler:** React, TanStack Query, TanStack Virtual, next-intl
> **Bağlantılar:** [[Production_Planning]], [[Frontend_Architecture]], [[Reporting]], [[Frontend_Formatters]], [[Frontend_Inventory]]

## Konum
- **Sayfa:** `frontend/src/app/production-planning/`
- **Feature:** `frontend/src/features/production-planning/`

## Bileşenler

| Bileşen | Dosya | Açıklama |
|---------|-------|----------|
| Plan listesi | `components/PlansList.tsx` | Sanallaştırılmış tablo; MRP ve **Yaklaşık Maliyet** aksiyonları |
| MRP modal | `components/MrpDetailModal.tsx` | Malzeme ihtiyaç tablosu, istasyon filtresi, PDF |
| Yaklaşık maliyet modal | `components/ApproximateCostModal.tsx` | Depo/istasyon/tarih özeti; ürün tablosu + tıklanınca açılan hammadde satırları |
| Plan formu | `components/PlanFormModal.tsx` | CRUD |
| 86 listesi | `components/AvailabilityList.tsx` | Ürün kısıtları |

## Yaklaşık Maliyet Modalı (`ApproximateCostModal`)

### Üst bilgi kartları
Depo, istasyon filtresi, üretim tarihi — API meta alanlarından (`warehouse_name`, `plan_date`).

### Tablo UX
- **Sanallaştırma:** `@tanstack/react-virtual` — `flatRows` modeli (ürün / alt başlık / hammadde).
- **Infinite scroll:** `usePlanApproximateCostInfinite` + `react-intersection-observer` sentinel.
- **Genişletme:** Reçeteli ürün satırına tıklanınca chevron ile `ingredients[]` alt satırları gösterilir ([[Frontend_Inventory]] `FEFOReportTable` ile aynı flat-row deseni).
- **Tutar gösterimi:** [[Frontend_Formatters]] `formatAmount(value, canViewAmounts)` — izin yoksa `***`.

### Tip tanımları (`types/index.ts`)
- `ApproximateCostItem` — `ingredients: ApproximateCostIngredient[]`
- `ApproximateCostIngredient` — `stock_item_name`, `quantity`, `unit`, `unit_cost`, `line_total`

## API & Hook'lar

- `services/api.ts` → `getPlanApproximateCost(id, { station_id?, page?, page_size? })`
- `hooks/useProductionPlanning.ts` → `usePlanApproximateCostInfinite`, `usePlanMrp`

## Rapor dışa aktarma

Modal içinden [[Reporting]] merkezi uç noktası:

```text
POST /reporting/module-reports/production-plan-approximate-cost/generate/
{ params: { plan_id, station_id?, station_name? }, format: "pdf" | "excel" }
```

- **PDF:** `templates/reports/approximate_cost_pdf.html` — ürün satırı + girintili hammadde satırları.
- **Excel:** `get_excel_data` — ürün satırından sonra `→ Hammadde` satırları; `unit` sütunu.

Ön yüz: `adminApi.generateModuleReport(...)`.

## Çeviriler

`frontend/src/i18n/messages/{tr,en,bg,sq}/production.json`:
- `plansList.approxCost*`
- `approximateCostModal.*` (sütunlar, `ingredientColumns`, export toast'ları)
