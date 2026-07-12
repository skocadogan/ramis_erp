interface RecipeIngredient {
  id: string
  ingredient_type: 'stock_item' | 'sub_recipe'
  stock_item: string | null
  stock_item_name: string
  stock_item_sku: string
  stock_item_unit: string
  stock_item_allergens?: RecipeAllergen[]
  sub_recipe: string | null
  sub_recipe_name: string
  quantity: number
  unit: string
  notes: string
  line_cost: number
}

interface RecipeAllergen {
  id: string
  code: string
  name: string
  prevalence_pct: number
  risk_score: number
}

interface RecipeAllergenSource {
  type: 'stock_item' | 'sub_recipe'
  name: string
  allergens: RecipeAllergen[]
}

export interface RecipeCategory {
  id: string
  name: string
  code: string
  parent: string | null
  recipes_count?: number
}

export interface Recipe {
  id: string
  product: string
  product_name: string
  category: string | null
  category_name: string | null
  name: string
  description: string | null
  servings: number
  serving_quantity: number | null
  serving_unit: string | null
  prep_time_minutes: number
  cook_time_minutes: number
  prep_time_per_serving: number
  cook_time_per_serving: number
  instructions: string | null
  ingredients: RecipeIngredient[]
  branches: string[]
  total_cost: number
  cost_per_serving: number
  learned_timing?: {
    branch_name: string;
    station_name: string;
    ema_minutes: number;
    sample_count: number;
  }[];
  is_active: boolean
  is_allergenic?: boolean
  allergens?: RecipeAllergen[]
  allergen_sources?: RecipeAllergenSource[]
}

export interface RecipeMenuItem {
  id: string
  name: string
  category_name: string
  branches?: string[]
}

export interface RecipeStockItem {
  id: string
  name: string
  sku: string
  unit: string
}

export interface RecipeBranch {
  id: string
  name: string
}

export interface RecipeStockUnit {
  id: string
  name: string
  short_name: string
}

export type RecipeFormState = {
  product_id: string
  category_id: string
  name: string
  description: string
  servings: number
  serving_quantity: number
  serving_unit: string
  prep_time_minutes: number
  cook_time_minutes: number
  prep_time_per_serving: number
  cook_time_per_serving: number
  instructions: string
  branches: string[]
  learned_timing?: {
    branch_name: string;
    station_name: string;
    ema_minutes: number;
    sample_count: number;
  }[];
}

type RecipeIngredientKind = 'stock_item' | 'sub_recipe'

export type RecipeIngredientDraft = {
  /** Liste satırı için kararlı React key */
  clientId: string
  kind: RecipeIngredientKind
  stock_item_id: string
  sub_recipe_id: string
  quantity: string
  unit: string
  notes: string
}
