# Recipes (Reçete Yönetimi)

> **Özet:** Menü ürünlerine bağlı reçete/tarif sistemi. Stok kalemleri ve yarı mamül alt reçetelerden oluşan malzeme listesi tutar. Birim dönüşümü, özyinelemeli maliyet ve stok düşümü yapar.
> **Kütüphaneler:** Django ORM
> **Bağlantılar:** [[Menu]], [[Inventory]], [[Branches]], [[Orders]], [[Allergens]]

---

## Konum
`backend/apps/recipes/`

## Modeller

### RecipeCategory
Hiyerarşik reçete kategorileri (parent → self).

### Recipe
| Alan | Tip | Açıklama |
|------|-----|----------|
| `product` | `OneToOne → Product` | Bağlı menü ürünü (opsiyonel; yarı mamüller menü ürünü olmadan da tanımlanabilir) |
| `category` | `FK → RecipeCategory` | Reçete kategorisi |
| `name` | `CharField` | Reçete adı |
| `servings` | `PositiveIntegerField` | Porsiyon sayısı |
| `serving_quantity/unit` | `DecimalField/CharField` | Porsiyon miktarı (ör: 10 g sos / porsiyon) |
| `prep_time_minutes` | `PositiveIntegerField` | Toplam hazırlık süresi |
| `cook_time_minutes` | `PositiveIntegerField` | Toplam pişirme süresi |
| `prep_time_per_serving` | `PositiveIntegerField` | Porsiyon başı hazırlık (Smart Firing referansı) |
| `cook_time_per_serving` | `PositiveIntegerField` | Porsiyon başı pişirme (Smart Firing referansı) |
| `branches` | `M2M → Branch` | Kullanılacak şubeler |
| `is_allergenic` | `BooleanField` | Birleşik allerjen var mı (önbellek) |
| `allergens` | `M2M → Allergen` | Birleşik allerjen listesi ([[Allergens]]) |

**Properties:**
*   `total_cost`: Tüm malzeme ve alt reçete satırlarının maliyeti (özyinelemeli).
*   `cost_per_serving`: `total_cost / servings`.
*   `total_yield_normalized`: `serving_quantity × servings` (verim hesabı; birim `serving_unit`).

### RecipeIngredient
Malzeme satırı **ya** stok kalemi **ya** alt reçete (yarı mamül) içerir (XOR kısıtı).

| Alan | Tip | Açıklama |
|------|-----|----------|
| `recipe` | `FK → Recipe` | Ana reçete |
| `stock_item` | `FK → StockItem` | Ham madde (opsiyonel) |
| `sub_recipe` | `FK → Recipe` | Yarı mamül alt reçete (opsiyonel) |
| `quantity` | `DecimalField` | Miktar |
| `unit` | `CharField` | Birim |
| `normalized_quantity` | `DecimalField` | Maliyet/stok ölçeği için normalize miktar |

**Maliyet:**
*   Stok satırı: `normalized_quantity × last_purchase_price`
*   Alt reçete: `(kullanılan_miktar / alt_reçete_toplam_verim) × alt_reçete.total_cost`

**Doğrulama:** Kendine referans ve döngüsel alt reçete zinciri engellenir (`recipe_expansion.detect_recipe_cycle`).

### Yarı Mamül Akışı (Örnek)

```
Ranch Sos (100 porsiyon, 10 g/porsiyon → 1000 g verim)
  ├─ 500 g yoğurt
  └─ 100 g sirke

Hamburger (10 porsiyon)
  ├─ 80 g ekmek
  ├─ 150 g köfte
  └─ 100 g Ranch Sos (alt reçete)
```

1 hamburger satışında stok düşümü: doğrudan ekmek/köfte + ranch hammaddelerinin oransal payı.

## Servisler

| Dosya | İşlev |
|-------|-------|
| `recipe_expansion.py` | Verim, maliyet genişletme, stok düzleştirme (`build_stock_requirements_from_recipe` → [[Production_Planning]] hammadde kırılımı), döngü kontrolü |
| `allergen_expansion.py` | Allerjen birleşimi (stok + alt reçete özyinelemesi) |
| `allergen_service.py` | `recalculate_recipe_allergens`, stok cascade |
| `services.py` | CRUD; malzeme satırında `stock_item_id` veya `sub_recipe_id` |
| `selectors.py` | Maliyet annotation (stok satırları); alt reçete varsa serializer property'e düşer |

## Stok Entegrasyonu

[[Inventory]] → `cart_recipe_requirements.add_recipe_for_product` artık `recipe_expansion.expand_recipe_to_stock_requirements` ile alt reçeteleri hammaddelere düzleştirir. POS stok kontrolü ve sipariş düşümü aynı algoritmayı kullanır.

## Smart Firing & EMA (Zamanlama Verisi)
Reçeteler, mutfaktaki gerçek hazırlık verilerinden (KDS) öğrenilen süreleri tutabilir:
*   **EMA (Exponential Moving Average):** İlgili istasyondaki son X hazırlığın ağırlıklı ortalaması.
*   Bu veriler arayüzde "Mutfaktan Öğrenildi" etiketiyle gösterilir.

## API

Malzeme oluşturma/güncelleme gövdesi:

```json
{
  "ingredients": [
    { "stock_item_id": "...", "quantity": "80", "unit": "g" },
    { "sub_recipe_id": "...", "quantity": "100", "unit": "g" }
  ]
}
```

Yanıtta `ingredient_type`, `sub_recipe`, `sub_recipe_name` alanları döner.
