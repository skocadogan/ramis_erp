# Menu Product Recommendations (Yanında Önerilen Ürünler)

> **Özet:** Menü ürününe bağlı çapraz satış önerileri (ör. bonfile → şarap). Menü yönetiminde yapılandırılır; POS ve garson web ekranında kart içi **Öneriler** belirteci ile listelenir; müşteri ekranına (CFD) allerjen diyaloğu ile aynı WebSocket hattından anlık yansır.
> **Kütüphaneler:** Django ORM, DRF, React, Zustand (`usePosStore`), TanStack Virtual (`useVirtualizer`), next-intl
> **Bağlantılar:** [[Menu]], [[Frontend_Menu]], [[Frontend_POS]], [[Frontend_Waiter]], [[POS_Display]], [[Allergens]], [[BaseModel]], [[Branch_Scope]], [[WebSocket_Architecture]], [[Internationalization]]

---

## Konum

| Katman | Yol |
|--------|-----|
| Backend model | `backend/apps/menu/models.py` → `ProductRecommendation` |
| Servis | `backend/apps/menu/services.py` → `MenuService.sync_product_recommendations` |
| Serializer | `backend/apps/menu/serializers.py` → `ProductRecommendation*Serializer`, `ProductSerializer.has_recommendations` |
| API | `backend/apps/menu/views.py` → `ProductViewSet.recommendations` |
| Migrasyon | `backend/apps/menu/migrations/0024_productrecommendation.py` |
| Test | `backend/apps/menu/tests/test_recommendations.py` |
| Menü UI | `frontend/src/features/menu/components/RecommendedProductsModal.tsx` |
| Menü fiyat yardımcı | `frontend/src/features/menu/lib/recommendedProductPricing.ts` |
| POS UI | `frontend/src/features/pos/components/ui/ProductCard.tsx`, `RecommendedProductsDialog.tsx` |
| POS CFD yardımcı | `frontend/src/features/pos/utils/displayRecommendedModal.ts` |
| Müşteri ekranı | `frontend/src/features/pos/components/CustomerDisplayRecommendedModal.tsx` |
| WS yayın | `frontend/src/features/pos/hooks/usePosDisplaySync.ts` |
| Tipler | `frontend/src/features/menu/types/index.ts`, `frontend/src/types/pos.ts` |

**Kapsam dışı (planlı):** [[Smart_Table]] — ayrı faz.

---

## Backend modeli

`ProductRecommendation` (`[[BaseModel]]` — soft delete):

| Alan | Tip | Açıklama |
|------|-----|----------|
| `source_product` | `FK → Product` | Öneri kaynağı (siparişte seçilen ana ürün) |
| `recommended_product` | `FK → Product` | Önerilen ürün |
| `product_unit` | `FK → ProductUnit`, null | Boş = **standart birim** (ana `base_price`) |
| `order` | `PositiveIntegerField` | Liste sırası (kayıt sırası; sürükle-bırak sonraki sürüm) |

**Kısıtlar:**
- `(source_product, recommended_product)` unique
- Kaynak ürün kendisini öneremez
- Kaldırılan öneriler `is_active=False` (soft delete)

---

## API

| Endpoint | İzin | Açıklama |
|----------|------|----------|
| `GET /api/v1/menu/products/{id}/recommendations/` | `menu.view_product` | Yönetim modalı için tam liste |
| `PUT /api/v1/menu/products/{id}/recommendations/` | `menu.manage_product` | Toplu senkron: `{ items: [{ recommended_product_id, product_unit_id \| null, order }] }` |

**POS katalog** (`ProductSerializer`, `GET /menu/products/?branch_id=...`):
- `has_recommendations: bool`
- `recommendations: [{ id, product_id, name, base_price, has_discount, discounted_price, units, product_unit_id, product_unit_name, order }]`

**Şube filtresi:** Önerilen ürün, `branch_id` query param ile aktif şubede `branches` M2M üzerinden satılabilir olmalı; `show_on_pos=True` ve `is_active=True` ([[Branch_Scope]]).

**Katalog yenileme:** PUT sonrası `broadcast_menu_catalog_refresh("product_recommendations_updated")` → `/ws/menu/catalog/`.

---

## Menü yönetimi (FAZ-1)

`ProductFormModal` (yalnızca **düzenleme** modu) → Açıklama altında **Yanında önerilenler** butonu.

`RecommendedProductsModal`:
- `Dialog` `layout="scroll"` — [[BulkPriceModal]] / [[DiscountModal]] kalıbı
- Sol: kategori listesi; sağ: sanal kaydırmalı ürün tablosu (`useVirtualizer`)
- Sütunlar: `# | ☐ | Ürün Adı | Satış Birimi | Fiyatı`
- Çoklu seçim; birim varsa select (varsayılan **Standart**); seçilenler özet tablosu
- Şube: kaynak ürünün `branches` listesi ile aday ürün filtresi

**i18n:** `menu_management.recommendedProducts` — `tr`, `en`, `bg`, `sq` ([[Internationalization]]).

---

## POS / Garson web (FAZ-2)

Paylaşılan `ProductCard` (`layout="pos"` | `"waiter"`):

- `has_recommendations && recommendations.length` → kart **içinde** mor **Öneriler** şeridi (`Sparkles`)
- Tıklanınca `RecommendedProductsDialog`: tablo + birim select + `(+)` / `(-)` ile sepete ekleme
- Önerilen ürün **ayrı sipariş kalemi**; zorunlu modifier akışı zorlanmaz (isteğe bağlı çapraz satış)
- POS layout'ta `setDisplayRecommendedModal` → CFD senkronu

**Dosyalar:** `features/pos/components/RecommendedProductsDialog.tsx`, `features/pos/utils/displayRecommendedModal.ts`, `store/usePosStore.ts` → `displayRecommendedModal`.

---

## Müşteri ekranı (FAZ-3)

[[Allergens]] CFD deseni ile aynı hat:

1. Kasiyer öneri dialog'unu açınca `buildDisplayRecommendedModalPayload` → `usePosStore.displayRecommendedModal`
2. `usePosDisplaySync` → WS payload `recommendedModal`
3. `app/pos/display/[id]/page.tsx` → `CustomerDisplayRecommendedModal`
4. Sepet `(+)` / `(-)` değişimleri anlık güncellenir

Backend consumer (`apps/orders/consumers.py` → `DISPLAY_UPDATE`) payload'ı olduğu gibi iletir; ek alan gerekmez.

---

## RBAC

Mevcut menü ürün izinleri yeterli:
- `menu.view_product` — listeleme
- `menu.manage_product` — senkron (PUT)

---

## Testler

`pytest apps/menu/tests/test_recommendations.py`:
- Senkron + GET
- Self-reference engeli
- `ProductSerializer.has_recommendations`
- Soft-delete kaldırılan öneri
