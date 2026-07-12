# Allergens (Allerjen Yönetimi — FAZ 1)

> **Özet:** Allerjen referans kataloğu, stok kalemlerine allerjen atama ve reçete/ürün düzeyinde otomatik birleşim. POS, garson web ve mobil garson uygulamasında reçeteli ürünlerde uyarı ikonu ve dialog gösterilir.
> **Kütüphaneler:** Django ORM, DRF
> **Bağlantılar:** [[Inventory]], [[Recipes]], [[Menu]], [[Frontend_Allergens]], [[Frontend_POS]], [[Frontend_Waiter]], [[Mobile_Waiter_App]], [[RBAC]]

---

## Konum
- **Backend:** `backend/apps/inventory/` (`Allergen` modeli), `backend/apps/recipes/` (`allergen_expansion.py`, `allergen_service.py`), `backend/apps/menu/product_allergens.py`
- **Frontend:** `frontend/src/app/allergens/`, `frontend/src/features/allergens/`
- **Seed:** `backend/apps/inventory/management/commands/seed_allergens.py`, `seed_full` içinde `--units` / `--menu` ile tetiklenir

## Allergen modeli

| Alan | Tip | Açıklama |
|------|-----|----------|
| `code` | `CharField(unique)` | Sabit referans kodu (ör. `ALG-EGG-01`) |
| `name` | `CharField` | Görünen ad |
| `prevalence_pct` | `DecimalField` | Popülasyondaki yaygınlık (%) — referans ekranında |
| `risk_score` | `PositiveSmallIntegerField` | 1–10 risk skoru |
| `sort_order` | `PositiveIntegerField` | Liste sırası |

`StockItem.allergens` (M2M) ile stok kalemlerine atanır. `Recipe.is_allergenic` ve `Recipe.allergens` (M2M) reçete düzeyinde önbelleklenmiş birleşimdir.

## Hesaplama akışı

1. Stok kalemi allerjenleri doğrudan reçeteye yansır.
2. Alt reçete (`sub_recipe`) satırları `allergen_expansion.expand_recipe_allergen_ids` ile özyinelemeli genişletilir.
3. Stok allerjeni değişince `recalculate_recipes_for_stock_item` bağlı reçeteleri (üst reçeteler dahil) yeniden hesaplar.
4. Menü ürünü için `get_product_allergens` / `product_is_allergenic`: yalnızca reçeteli veya birleşik ürünlerde allerjen döner; reçetesiz ürünlerde uyarı gösterilmez.

## API

| Endpoint | Açıklama |
|----------|----------|
| `GET/POST/PATCH/DELETE /api/v1/inventory/allergens/` | Referans CRUD |
| `StockItem` serializer | `allergens` (read), `allergen_ids` (write) |
| `Recipe` serializer | `is_allergenic`, `allergens`, `allergen_sources` |
| `Product` serializer (POS) | `is_allergenic`, `allergens` → `{ id, name, risk_score }` |

## RBAC

| İzin | Kullanım |
|------|----------|
| `inventory.view_allergen` | Referans listesi salt okunur |
| `inventory.manage_allergen` | CRUD + stok ataması yönetimi |

## POS / Garson / Mobil UI

- **Koşul:** `is_allergenic === true` ve `allergens.length > 0`
- **Görünüm:** Ürün kartında amber `ShieldAlert` ikonu; tıklanınca dialog (ürün adı + allerjen adı + risk skoru)
- **prevalence_pct:** POS dialog'da gösterilmez; referans modülü ve reçete formunda kullanılır

Paylaşılan bileşenler:
- Web POS / Garson: `frontend/src/features/pos/components/ui/ProductCard.tsx`
- Mobil: `mobile_app/waiter/src/components/ProductCard.tsx`

## Kurulum / seed

- `python manage.py seed_allergens` — 32 varsayılan kayıt (idempotent upsert)
- `install.sh` — migrate sonrası otomatik `seed_allergens`
- `update.sh --seed-allergens` — mevcut kurulumda referans listesini yeniler
- `seed_full --units` veya `--menu` — allerjen listesi + örnek stok atamaları + reçete yeniden hesaplama
