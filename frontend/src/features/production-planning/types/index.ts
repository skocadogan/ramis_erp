type PlanStatus = 'DRAFT' | 'APPROVED' | 'COMPLETED' | 'CANCELLED';
type PlanSource = 'MANUAL' | 'SYSTEM_FORECAST';
export type PosBlockMode = 'WARN' | 'BLOCK' | 'OFF';
export type AvailabilityMode = 'UNLIMITED' | 'LIMITED' | 'SOLD_OUT';

export interface ProductionPlanLine {
  id?: string;
  product: string;
  product_name?: string;
  category_name?: string;
  station_name?: string;
  target_quantity: number
  forecast_quantity?: number | null
  actual_quantity?: number | null
  notes?: string;
}

export interface ProductionPlan {
  id: string;
  branch: string;
  branch_name?: string;
  plan_date: string; // DD-MM-YYYY
  status: PlanStatus;
  source: PlanSource;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by_name?: string;
  approved_by_name?: string;
  lines: ProductionPlanLine[];
}

export interface ProductionPlanForm {
  branch: string;
  plan_date: string;
  notes: string;
  lines: ProductionPlanLine[];
}

export interface ProductionDaySettings {
  id?: string;
  branch: string | null;
  pos_block_mode: PosBlockMode;
  default_safety_factor: number;
}

export interface ProductDayAvailability {
  id: string;
  branch: string;
  branch_name?: string;
  product: string;
  product_name?: string;
  effective_date: string;
  mode: AvailabilityMode;
  remaining_portions: number | null;
}

export interface ProductDayAvailabilityForm {
  branch: string;
  product: string;
  effective_date: string;
  mode: AvailabilityMode;
  remaining_portions: number | null;
}

export interface MrpResultItem {
  stock_item_id: string;
  stock_item_name: string;
  unit: string;
  required_quantity: number;
  on_hand: number;
  gap: number;
  below_minimum: boolean;
  minimum_quantity: number;
  /** Backend: minimum_quantity -1 (sınırsız) ile aynı anlam */
  is_minimum_unlimited?: boolean;
  kitchen_station: string;
}

export interface MrpResult {
  warehouse_id: string | null;
  warehouse_name: string;
  items: MrpResultItem[];
}

export interface ApproximateCostIngredient {
  stock_item_id: string;
  stock_item_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
}

export interface ApproximateCostItem {
  line_id: string;
  product_id: string;
  product_name: string;
  station_id: string | null;
  station_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  has_recipe: boolean;
  ingredients: ApproximateCostIngredient[];
}

export interface ApproximateCostResult {
  plan_id: string;
  plan_date: string;
  branch_id: string;
  branch_name: string;
  warehouse_id: string | null;
  warehouse_name: string;
  station_id?: string | null;
  count: number;
  page: number;
  page_size: number;
  has_next: boolean;
  next_page: number | null;
  grand_total: number;
  items: ApproximateCostItem[];
}
