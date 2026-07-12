# Frontend Allergens (Allerjen Referans Ekranı)

> **Özet:** `/allergens` sayfasında allerjen referans kataloğunun listelenmesi, CRUD ve stok formundan kısayol. RBAC ile görüntüleme/yönetim ayrımı.
> **Kütüphaneler:** React, Next.js App Router, TanStack Query, next-intl
> **Bağlantılar:** [[Allergens]], [[Frontend_Inventory]], [[Frontend_Recipes]], [[RBAC]], [[Frontend_Architecture]]

---

## Konum
- **Sayfa:** `frontend/src/app/allergens/page.tsx`
- **Feature:** `frontend/src/features/allergens/`
  - `AllergensTable.tsx` — liste
  - `AllergenFormModal.tsx` — oluştur/düzenle
  - `AllergenReferenceModal.tsx` — salt okunur referans (reçete formundan)
  - `AllergenMultiSelect.tsx` — stok formu çoklu seçim
- **Navigasyon:** `AppSidebar` (`moduleKey: allergens`), `InventoryModuleNav` kısayolu
- **i18n:** `frontend/src/i18n/messages/{tr,en}/allergens.json`

## RBAC
- `inventory.view_allergen` — tablo görüntüleme
- `inventory.manage_allergen` — ekleme/düzenleme/silme

## Stok entegrasyonu
`ItemFormModal` içinde `AllergenMultiSelect` ile `allergen_ids` API'ye gönderilir; backend stok güncellemesinde bağlı reçeteleri yeniden hesaplar.

## Reçete entegrasyonu
`RecipeFormModal` düzenleme modunda salt okunur allerjen özeti ve `AllergenReferenceModal` ile kaynak detayı (`allergen_sources`) gösterilir.
