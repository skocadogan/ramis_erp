# Frontend Menu

> **Özet:** Kategori, ürün, varyant, modifier, birim ve birleşik ürün yönetimi ekranları. Net/brüt/KDV birlikte yönetimi, POS sepetiyle anlık senkronizasyon.
> **Kütüphaneler:** React, TanStack Query, dnd-kit, Zustand (usePosStore)
> **Bağlantılar:** [[Menu]], [[Frontend_Architecture]], [[Frontend_POS]], [[State_Management]], [[Menu_Product_Recommendations]], [[Menu_Tags]]

---

## Konum
- **Sayfa:** `frontend/src/app/menu-management/`
- **Feature:** `frontend/src/features/menu/`
  - `components/ProductFormModal.tsx`
  - `components/RecommendedProductsModal.tsx`
  - `components/MenuTagsPanel.tsx`
  - `components/MenuTagFormModal.tsx`
  - `components/MenuTagSelect.tsx`
  - `components/ActiveTagFilterSelect.tsx`
  - `hooks/useMenuTagsManagement.ts`
  - `lib/menuTagFilter.ts`
  - `hooks/useMenuData.ts`
  - `lib/productPricing.ts`
  - `lib/recommendedProductPricing.ts`
  - `services/menuApi.ts`
  - `types/index.ts`

---

## Ürün düzenleme — fiyat alanları

Ürün formunda (**`components/ProductFormModal.tsx`**) net satış (**`base_price`**), brüt (**`gross_price`**) ve vergi % (**`tax_rate`**) birlikte yönetilir.

### `lib/productPricing.ts`

| Yardımcı | Etki |
|----------|------|
| `computeSalePriceFromGrossAndTax(gross, taxRate)` | Brüt + vergi → net `base_price` (2 ondalık) |
| `computeGrossFromNetAndTax(net, taxRate)` | Net + vergi → brüt (2 ondalık) |

Kullanıcı brüt+vergi veya net+vergi değiştirdiğinde diğer taraf senkronize edilir; fiyat girişleri sayısal `NumberInput` yerine metin `input` ile yapılır (virgül/nokta girişi). Tüm sonuçlar `parseFloat(...).toFixed(2)` ile iki haneye yuvarlanır.

### Form Gönderimi

**`hooks/useMenuData.ts`** ürün oluşturma/güncellemede `FormData`'ya `gross_price` ve `tax_rate` alanlarını da ekler; backend bu değerleri saklar ve POS'a katalogla beraber döner. Düzenleme açılışında API'den okunan değerler iki haneye normalize edilir.

**`types/index.ts`** içindeki `Product` ve `ProductForm` tipleri bu alanları içerir:

```typescript
interface Product {
  base_price: string
  discounted_price?: string
  gross_price?: string
  tax_rate?: string
  // ...
}

interface ProductForm {
  base_price: string
  gross_price: string
  tax_rate: string
  // ...
}
```

Arayüzde fiyat bloğu, şube erişimi (**`branches`**) alanının altında yer alır.

---

## Kalori değeri (kCal)

**`ProductFormModal`** — kategori/resim bloğunda **Sıralama** yanında **Kalori Değeri (kCal)** inputu (opsiyonel tam sayı; boş = kayıt yok).

| Katman | Dosya / alan |
|--------|----------------|
| Form state | `hooks/useMenuData.ts` → `ProductForm.calories` |
| API gönderimi | `FormData.append('calories', …)` — boş string backend'de `null` |
| Tipler | `types/index.ts` → `Product.calories`, `ProductForm.calories` |
| i18n | `menu_management.json` → `productForm.calories`, `productForm.caloriesPlaceholder` (TR/EN/BG/SQ) |

POS ve müşteri ekranında gösterim: [[Frontend_POS#Kalori gösterimi (kCal)]], [[POS_Display#Müşteri ekranı — kalori senkronu]].

---

## Seçenek grupları (Modifier)

**Sayfa sekmesi:** `menu-management` → **Seçenek Grupları** (`page.tabs.modifiers`).

| Bileşen | Dosya |
|---------|--------|
| Grup listesi + seçenek CRUD | `components/ModifierGroupsPanel.tsx` |
| Grup form modal | `components/ModifierGroupFormModal.tsx` |
| Hook | `hooks/useModifierGroups.ts` |

**Ürün atama:** `ProductFormModal` içinde tanımlı gruplar chip olarak seçilir; kayıt sonrası `POST .../products/{id}/modifier-groups/` ile M2M senkronize edilir (`useMenuData`).

**API istemcisi:** `services/menuApi.ts` — `getModifierGroups`, `createModifierGroup`, `setProductModifierGroups`, vb.

**Yetki:** `menu.view_modifier_group` / `menu.manage_modifier_group`, `menu.view_modifier` / `menu.manage_modifier` ([[RBAC]]).

---

## Menü etiketleri

Ayrıntılı mimari: [[Menu_Tags]].

**Sayfa sekmesi:** `menu-management` → **Menü Etiketleri** (`page.tabs.menuTags`).

| Bileşen | Dosya | Rol |
|---------|--------|-----|
| Etiket listesi + CRUD paneli | `MenuTagsPanel.tsx` | Seçenek Grupları düzenine benzer |
| Etiket form modal | `MenuTagFormModal.tsx` | Oluştur / düzenle |
| Etiket seçici (form) | `MenuTagSelect.tsx` | Ürün/kategori formlarında çoklu seçim; CRUD yok |
| Aktif menü filtresi | `ActiveTagFilterSelect.tsx` | POS görünürlük seçimi + bilgi diyaloğu |
| Kategori etiket gösterimi | `CategoryPanel.tsx` | Etiketler adın altında, alt alta |
| Hook — etiket CRUD | `useMenuTagsManagement.ts` | Sekme state |
| Hook — menü verisi | `useMenuData.ts` | `refreshAfterTagChange`, şube seçimi, filtre |
| İstemci filtre | `lib/menuTagFilter.ts` | Panel/liste görünürlüğü |

**Ürün/kategori formları:** `tag_ids` gönderimi; çok şubede `mergeTagIdsForBranch` ile diğer şube etiketleri korunur.

**Aktif Menü:** `ProductTable` üst çubuğunda etiket seçimi; değişiklik onay diyaloğu sonrası `activateCatalogTag` API. **Tümünü göster** switch'i yönetim panelinde filtreliyken tam listeyi geçici açar.

**i18n:** `menuTagsTab`, `tagFilter`, `menuTags` — TR/EN/SQ/BG (`menu_management.json`).

**Yetki:** `menu.manage_product` (sekme + CRUD), `menu.view_product` (listeleme).

## POS Sepetiyle Senkronizasyon

`usePosStore.setProducts(newProducts)`, katalog her güncellendiğinde mevcut sepet kalemlerini yeni fiyat verisiyle eşitler:
- Sepetteki her `cartItem` için `Product` tekrar bulunur.
- Eğer ürün hâlâ aktif ise `unitPrice` güncel `discounted_price ?? base_price` ile yenilenir; modifier / varyant farkları korunur.
- `selectCartTotal` selektörü `(unitPrice + Σ modifier.price_adjustment) × quantity` hesaplar; modifier seçimleri korunur.

WebSocket `menu_update` veya manuel "Senkronize Et" tetiklendiğinde fiyat değişiklikleri açık POS oturumlarına anında yansır.

## Ürün Takip Yöntemi (Bilgi)

POS Ayarları'ndaki **Stock Tracking Mode** (`PRODUCT` / `INGREDIENT`) menü modülünden bağımsızdır; menü tarafı yalnız **fiyat** ve **kategori** alanlarını yönetir, stok hesabı [[Frontend_POS]] (`CartSidebar.checkPosStationStock`) ve backend `Inventory`/`Recipes` modüllerinde yapılır.

---

## Yanında önerilen ürünler

Ürün düzenleme modalında (**`ProductFormModal`**, yalnızca edit) açıklama alanının altında **Yanında önerilenler** → **`RecommendedProductsModal`**.

| Bileşen | Dosya |
|---------|--------|
| Yapılandırma modal | `components/RecommendedProductsModal.tsx` |
| Birim fiyat yardımcı | `lib/recommendedProductPricing.ts` |
| API | `services/menuApi.ts` → `getProductRecommendations`, `syncProductRecommendations` |

Kalıp: [[BulkPriceModal]] / [[DiscountModal]] — `layout="scroll"`, sol kategori, sağ sanal liste (`useVirtualizer`), checkbox çoklu seçim.

Ayrıntı: [[Menu_Product_Recommendations]].
