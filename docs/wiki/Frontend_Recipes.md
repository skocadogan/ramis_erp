# Frontend Recipes

> **Özet:** Reçete oluşturma, stok malzemesi ve yarı mamül alt reçete ekleme, birim dönüşümü ve maliyet hesaplama ekranları.
> **Kütüphaneler:** React, TanStack Query
> **Bağlantılar:** [[Recipes]], [[Frontend_Architecture]]

## Konum
- **Sayfa:** `frontend/src/app/recipes/`
- **Feature:** `frontend/src/features/recipes/`
  - `components/RecipeFormModal.tsx` — Reçete formu; malzeme satırında **Stok / Yarı mamül** tür seçimi.
  - `components/RecipeCard.tsx` — Alt reçete satırları `(yarı mamül)` rozeti ile listelenir.
  - `hooks/useRecipeActions.ts` — `RecipeIngredientDraft.kind`: `stock_item` | `sub_recipe`
  - `services/recipesApi.ts` — API'ye `sub_recipe_id` veya `stock_item_id` gönderir.

## Yarı Mamül UI

Reçete düzenlerken malzeme tablosunda:
1. **Tür** sütunundan `Stok` veya `Yarı mamül` seçilir.
2. Yarı mamül seçildiğinde mevcut reçetelerden (düzenlenen reçete hariç) alt reçete seçilir.
3. Miktar/birim, ana reçetenin toplam partisi için kullanılacak alt reçete miktarını ifade eder (ör. 10 porsiyonluk hamburger reçetesine 100 g ranch sos).

Alt reçetenin verim tanımı için `serving_quantity` + `serving_unit` + `servings` alanlarının doldurulması önerilir (backend stok/maliyet ölçeklemesi buna dayanır).

## Smart Firing v2 Entegrasyonu
Reçete düzenleme formunda (`RecipeFormModal`), mutfak istasyonlarından toplanan gerçek hazırlık süreleri (EMA) **"Mutfaktan Öğrenildi"** rozeti altında gösterilir. Bkz. [[Smart_Firing_v2]].
