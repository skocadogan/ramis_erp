# Menu (Menü Yönetimi)

> **Özet:** Ürün, kategori, varyant, modifier ve birim sistemi. Birleşik ürünler, indirimler, şube bazlı ürün kısıtlaması ve POS görünürlük kontrolü sağlar.
> **Kütüphaneler:** Django ORM, Pillow (görsel), Django Channels
> **Bağlantılar:** [[Branches]], [[Orders]], [[Recipes]], [[Production_Planning]], [[POS_Display]], [[Allergens]], [[Menu_Product_Recommendations]], [[Menu_Tags]]

---

## Konum
`backend/apps/menu/`

## Modeller

### Category
| Alan | Tip | Açıklama |
|------|-----|----------|
| `name` | `CharField` | Kategori adı |
| `order` | `PositiveIntegerField` | Sıralama |
| `color` | `CharField` | Renk kodu |
| `station` | `FK → KitchenStation` | Mutfak istasyonu bağlantısı |

### Product
| Alan | Tip | Açıklama |
|------|-----|----------|
| `category` | `FK → Category` | Kategori |
| `name` | `CharField` | Ürün adı |
| `base_price` | `DecimalField(12,4)` | Net satış fiyatı (vergi dahil birim fiyat; POS’ta kullanılan) |
| `gross_price` | `DecimalField(12,2)` | Brüt fiyat (vergi hariç); `base_price` ve `tax_rate` ile tutarlı tutulur |
| `tax_rate` | `DecimalField(6,2)` | Vergi oranı % (örn. 20) |
| `discount_rate` | `DecimalField` | İndirim oranı (0-100%) |
| `image` | `ImageField` | Ürün görseli |
| `order` | `PositiveIntegerField` | Sıralama |
| `calories` | `PositiveIntegerField`, null | Porsiyon başına enerji değeri (kCal); boş = gösterilmez |
| `show_on_pos` | `BooleanField` | POS'ta görünürlük |
| `is_featured` | `BooleanField` | Öne çıkan ürün |
| `is_combined` | `BooleanField` | Birleşik ürün mü? |
| `branches` | `M2M → Branch` | Hangi şubelerde satılacak (boş = tümü) |

**Properties:** `has_discount`, `discounted_price`

**Fiyat senkronizasyonu:** `Product.save()` çağrıldığında `base_price` veya `tax_rate` güncellenmişse `align_gross_from_net()` ile `gross_price`, net satış ve vergi oranına göre yeniden hesaplanır (`update_fields` verilmişse yalnız bu alanlar tetikler ve `gross_price` `update_fields` listesine eklenir). API serializer’ı brüt ve vergi değerlerini içe aktarırken iki ondalık basamağa yuvarlar.

**Migrasyon:** Kalıcı alanlar için `menu` uygulamasında `0014_product_gross_price_tax_rate` (mevcut satırlarda brüt ≈ eski `base_price`, vergi 0). Kalori alanı: `0026_product_calories`.

**Kalori (kCal):** Opsiyonel tam sayı. `ProductSerializer` yanıtında `calories`; FormData ile boş string `null` olarak içe aktarılır. POS katalog, sepet ve müşteri ekranı bu alanı ürün adının altında gösterir ([[Frontend_Menu]], [[Frontend_POS]], [[POS_Display]]). Test: `apps/menu/tests/test_product_calories.py`.

### ProductVariant
Ürün varyantları (Küçük, Büyük) — fiyat farkı ile.

### ModifierGroup + Modifier
Ek seçenekler: peynir eklentileri, süt seçenekleri vb. `ModifierGroup` ürünlerle M2M (`products` ↔ `modifier_groups`); grup alanları: `is_required`, `is_multiple`. Soft delete: `is_active=False`.

**API:**
- `GET/POST/PATCH/DELETE /api/v1/menu/modifier-groups/`
- `GET/POST/PATCH/DELETE /api/v1/menu/modifiers/`
- `POST /api/v1/menu/products/{id}/modifier-groups/` — body: `{ "group_ids": [uuid, ...] }`

**Sipariş:** `OrderItemCreateSerializer.modifier_ids`; `MenuService.resolve_order_item_modifiers` zorunlu grup / tek-çoklu seçim / ürün kapsamı doğrular. Fiyat: `unit_price + Σ modifier.price_adjustment`.

**POS katalog:** `ProductSerializer.modifier_groups` yalnızca aktif gruplar ve aktif seçenekler döner (boş gruplar süzülür).

### ProductUnit
Satış birimleri (tam porsiyon, yarım) — çarpan veya sabit fiyat.

### CombinedProductItem
Birleşik (paket) ürün alt kalemleri.

### ProductRecommendation
Kaynak menü ürününe bağlı **yanında önerilen** ürünler ([[Menu_Product_Recommendations]]).

| Alan | Tip | Açıklama |
|------|-----|----------|
| `source_product` | `FK → Product` | Ana ürün (ör. bonfile) |
| `recommended_product` | `FK → Product` | Önerilen ürün (ör. şarap) |
| `product_unit` | `FK → ProductUnit`, null | Öneri satış birimi; null = standart |
| `order` | `PositiveIntegerField` | Sıra |

Migrasyon: `0024_productrecommendation`. Soft delete: `is_active=False`.

**API:**
- `GET/PUT /api/v1/menu/products/{id}/recommendations/`
- POS `ProductSerializer`: `has_recommendations`, `recommendations[]`

### MenuTag + MenuCatalogSettings
Şubeye özel menü etiketleri ve POS aktif menü filtresi ([[Menu_Tags]]).

| Model | Açıklama |
|-------|----------|
| `MenuTag` | `branch` FK, `name` (`#` önekli), `(branch, name)` unique |
| `MenuCatalogSettings` | Şube başına `active_tag`, `filter_untagged` |

`Category.tags` ve `Product.tags` M2M. Migrasyonlar: `0027_menu_tags`, `0028_menutag_branch_scope`.

**API:** `GET/POST/PATCH/DELETE /api/v1/menu/tags/`, `GET/POST /api/v1/menu/catalog-settings/`

**POS filtre:** `apply_tag_filter=1` + `branch_id` query — `menu_tag_service.filter_products_by_active_tag` / `filter_categories_by_active_tag`. Ürün görünürlüğü yalnızca **doğrudan ürün etiketi** ile; kategori etiketi alt ürünleri otomatik dahil etmez.

**Silme:** `soft_delete_menu_tag` — M2M temizliği, aktif filtre sıfırlama, `menu_catalog_refresh` WS.

## Allerjen alanları (POS API)

`ProductSerializer` yanıtında ([[Allergens]]):
- `is_allergenic` — reçeteli/birleşik ürünlerde hesaplanır; reçetesiz ürünlerde `false`
- `allergens` — `{ id, name, risk_score }[]` (birleşik ürünlerde alt ürün allerjen birleşimi)

Kaynak: `apps/menu/product_allergens.py`

## Toplu fiyat (`POST /api/v1/menu/products/bulk_price/`)

Payload: `product_ids`, isteğe bağlı `branch_id`, `change_type` (`PERCENT` | `FIXED`), `value`. Her ürün için `base_price` güncellenir, `align_gross_from_net()` ile `gross_price` hesaplanır; ardından `base_price` ve `gross_price` toplu yazılır. **`ProductUnit.price_override` dolu** satış birimleri için `price_override`, yeni `base_price × multiplier` ile güncellenir ve birimler `bulk_update` edilir.

## Signals
- Ürün silindiğinde görseli dosya sisteminden temizlenir
- Ürün güncellendiğinde eski görsel silinir
- Ürün silindiğinde bağlı reçete bağlantısı koparılır

## WebSocket

**Rota:** `/ws/menu/catalog/` — `MenuCatalogConsumer` (`consumers.py`)

- Grup: `menu_catalog` (global; şube filtresi yok)
- Olay: `menu_catalog_refresh` — kategori/ürün CRUD sonrası POS katalogunu tetikler
- El sıkışma: JWT (`users/ws_auth.py`, önbellekli); ping/pong: `core/ws_consumer.py`

Bkz: [[WebSocket_Architecture]], [[Frontend_POS]].
