# Menu_Engineering

> **Özet:** Menü mühendisliği analitiği, satış verisini reçete/FEFO maliyeti ve sipariş anı ingredient maliyet ledger'ı ile birleştirerek ürün bazlı kârlılık matrisi üretir. Aynı veri akışı üzerinden hem Faz 1 tahmini maliyet görünümü hem de Faz 2 gerçek maliyet görünümü sunulur.
> **Kütüphaneler:** Django ORM, DRF, React, TanStack Query
> **Bağlantılar:** [[Dashboard]], [[Sales]], [[Inventory]], [[Recipes]], [[Frontend_Sales]], [[Reporting]]

---

## Konum
- Backend selector / API: `backend/apps/dashboard/selectors.py`, `backend/apps/dashboard/views.py`
- Export: `backend/apps/sales/reports/product_reports.py`, `backend/apps/sales/templates/reports/menu_engineering.html`
- Frontend: `frontend/src/features/sales/components/MenuEngineeringAnalytics.tsx`

## Fazlar

### Faz 1 — Tahmini maliyet
- Veri kaynağı: tamamlanmış `Sale` + `OrderItem`
- Maliyet kaynağı önceliği:
  1. Reçete için FEFO simülasyonu (`compute_fefo_cost_per_serving`)
  2. Reçete `cost_per_serving` fallback'i
- Çıktılar:
  - `estimated_unit_cost`
  - `estimated_food_cost`
  - `estimated_gross_profit`
  - `estimated_margin_pct`
  - `menu_class` (`STAR`, `PLOWHORSE`, `PUZZLE`, `DOG`)

### Faz 1.5 — Stock variance drilldown
- Veri kaynağı: `StockMovement`
- Hareket tipleri: `WASTE`, `CANCEL`, `RETURN`, `DISPOSAL`, `ADJUSTMENT`
- Kullanım: ürün marjını doğrudan düzeltmez; operasyonel fire/kaçak baskısını ayrı doğruluk seviyesiyle gösterir.

### Faz 2 — Gerçek maliyet görünümü
- Veri kaynağı: `OrderItemIngredientCost`
- Ledger yazım noktası: `StockReservationService.commit_reservations`
- Çıktılar:
  - `actual_unit_cost`
  - `actual_food_cost`
  - `actual_gross_profit`
  - `actual_margin_pct`
  - `actual_menu_class`
  - `actual_coverage` (`FULL`, `PARTIAL`, `NONE`)

## API yüzeyi

### `GET /api/v1/dashboard/menu-engineering/`
Tek response içinde estimated + actual alanlarını birlikte döndürür:
- `summary`: tahmini görünüm özeti
- `actual_summary`: ledger kapsaması olan gerçek görünüm özeti
- `products[]`: her ürün için estimated ve actual metrikler
- `stock_variance_summary`: stok bazlı sapma özeti

Filtreler:
- `branch_id`
- `start_date`, `end_date`
- `product_id`
- `category_id`
- `menu_class`

### `GET /api/v1/dashboard/menu-engineering-actual/`
- `menu-engineering` endpoint'inin actual kullanım için açık alias'ıdır.
- Frontend şu an birleşik response kullansa da dış tüketiciler için ayrı keşif yüzeyi sağlar.

## Sınıflandırma mantığı
- Popülerlik eşiği: sınıflandırılabilir ürünlerin ortalama satılan miktarı
- Karlılık eşiği:
  - Estimated görünümde `avg_sell_price - estimated_unit_cost`
  - Actual görünümde `avg_sell_price - actual_unit_cost`
- Menü sınıfı, popülerlik ve karlılık eşiklerine göre atanır.

## Coverage kuralları

### Estimated
- `recipe_status=NO_RECIPE` ise estimated maliyet alanları boş kalır.
- `stock_tracking_mode_coverage` ürünün ingredient / product / mixed satış modlarını özetler.
- `variance_coverage=STOCK_ONLY`, stok sapma kartlarının sadece operasyonel işaret olduğunu belirtir.

### Actual
- `FULL`: ürünün seçili aralıktaki tüm satış miktarı ledger tarafından kapsanmıştır.
- `PARTIAL`: yalnızca satışların bir bölümü ingredient ledger ile izlenmiştir.
- `NONE`: gerçek maliyet hesaplamak için ledger kaydı yoktur.

`PARTIAL` ve `NONE` durumlarında gerçek marj alanları kasıtlı olarak `null` döner; eksik maliyet ile yanıltıcı kârlılık üretilmez.

## Frontend akışı
- Sekme: `Sales > Menu engineering`
- Görünüm modu: `Tahmini` / `Gerçek`
- Export: aynı rapor slug'ı (`menu-engineering-analytics`) seçili moda göre PDF / Excel üretir.
- Actual görünümde kapsama kartı, `FULL/PARTIAL/NONE` dağılımını ayrı KPI olarak gösterir.

## Testler
- `backend/apps/dashboard/tests/test_menu_engineering.py`
- `backend/apps/inventory/tests/test_order_item_ingredient_cost.py`
- `backend/apps/inventory/tests/test_reservation_service.py`

---

*Bu sayfa INGEST operasyonu ile güncellenmiştir.*
