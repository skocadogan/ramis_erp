export interface MenuTag {
  id: string
  name: string
  branch?: string
  branch_id?: string
}

export interface MenuCatalogSettings {
  branch_id: string | null
  active_tag_id: string | null
  active_tag_name: string | null
  filter_untagged: boolean
  has_tags: boolean
}

export interface Category {
  id: string
  name: string
  description: string | null
  is_active: boolean
  order: number
  color: string
  parent: string | null         // Üst kategori UUID'si (nullable — root kategoriler)
  parent_name?: string | null   // read-only denormalized
  station: string | null        // KitchenStation UUID
  station_name?: string | null  // read-only denormalized
  tags?: MenuTag[]
}

export interface ProductUnit {
  id?: string
  name: string
  multiplier: number
  price_override: number | null
  order: number
  calculated_price?: number // read-only from backend
}

export interface MenuModifier {
  id: string
  name: string
  price_adjustment: number
  group?: string
  is_active?: boolean
}

export interface ModifierGroup {
  id: string
  name: string
  is_multiple: boolean
  is_required: boolean
  is_active?: boolean
  modifiers: MenuModifier[]
  product_ids?: string[]
}

interface CombinedProductItem {
  id?: string
  product: string // Product UUID
  product_name?: string // read-only
  quantity: number
  /** Alt ürünün satış birimi (ProductUnit id); yoksa çarpan 1 */
  product_unit?: string | null
  product_unit_name?: string | null
  /** API salt okunur — seçili birimin hesaplanan satış fiyatı */
  calculated_unit_price?: number | null
}

export interface Product {
  id: string
  category: string
  category_name: string
  name: string
  description: string | null
  base_price: number
  /** KDV hariç brüt (API) */
  gross_price?: number
  /** Vergi oranı % (API) */
  tax_rate?: number
  discount_rate: number
  discounted_price?: number | null
  has_discount?: boolean
  is_active: boolean
  /** false ise POS grid'inde hiç gösterilmez */
  show_on_pos: boolean
  is_show_on_menu?: boolean
  is_featured: boolean
  is_popular: boolean
  is_chef_recommendation: boolean
  is_combined: boolean
  image: string | null
  order: number
  /** Porsiyon başına enerji değeri (kCal) */
  calories?: number | null
  units: ProductUnit[]
  combined_items?: CombinedProductItem[]
  modifier_groups?: ModifierGroup[]
  branch_name?: string | null
  branch_id?: string | null
  branches: string[]
  branch_names: string[]
  updated_at?: string
  /** Reçete bu ürünü işaret eder; yoksa null (API: recipe_cost_per_serving) */
  recipe_cost_per_serving?: number | null
  tags?: MenuTag[]
}

export interface ProductRecommendation {
  id: string
  recommended_product_id: string
  recommended_product_name: string
  recommended_product_base_price: number
  recommended_product_has_discount?: boolean
  recommended_product_discounted_price?: number | null
  recommended_product_units: ProductUnit[]
  product_unit: string | null
  product_unit_name?: string | null
  order: number
}


export interface ProductForm {
  category: string
  name: string
  /** API’ye giden satış fiyatı (KDV dahil / net). */
  base_price: string
  /** API — brüt (KDV hariç) */
  gross_price: string
  /** API — vergi % */
  tax_rate: string
  description: string
  is_active: boolean
  show_on_pos: boolean
  is_show_on_menu: boolean
  is_featured: boolean
  is_combined: boolean
  image: File | string | null
  order: number
  /** Porsiyon başına enerji değeri (kCal); boş = kayıt yok */
  calories: number | null
  units: ProductUnit[]
  combined_items: CombinedProductItem[]
  branches: string[]
  modifier_group_ids: string[]
  tag_ids: string[]
}

export interface ModifierGroupForm {
  name: string
  is_multiple: boolean
  is_required: boolean
}

export interface ModifierForm {
  name: string
  price_adjustment: string
}

export interface CategoryForm {
  name: string
  description: string
  parent: string | null   // Üst kategori UUID'si — null = root kategori
  order: number
  color: string
  is_active: boolean
  station: string | null  // KitchenStation UUID — null = istasyon yok
  tag_ids: string[]
}
