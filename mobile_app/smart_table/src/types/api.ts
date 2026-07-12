// ============================================================
// Smart Table — Backend API Payload Types
// Ham REST/WebSocket yanıtlarını temsil eder; servis katmanı
// bunları client tipine (types/index.ts) dönüştürür.
// ============================================================

interface ApiOrderItemModifier {
  modifier?: string;
  modifier_name?: string;
  price?: string | number;
}

interface ApiOrderCombinedPart {
  product_name?: string;
  quantity_total?: string | number;
  unit_name?: string | null;
}

export interface ApiOrderItem {
  id: string;
  product: string;
  product_name?: string;
  product_image?: string | null;
  quantity: number;
  unit_price?: string | number;
  total_price?: string | number;
  status?: string;
  modifiers?: ApiOrderItemModifier[];
  notes?: string;
  unit_name?: string;
  unit?: string;
  unit_name_en?: string;
  parent_item?: string | null;
  is_combined_product?: boolean;
  combined_parts?: ApiOrderCombinedPart[];
  waiter_acknowledged_at?: string;
}

export interface ApiOrder {
  id: string;
  table: string;
  table_name?: string;
  order_type?: string;
  status?: string;
  total_amount?: string | number;
  notes?: string;
  created_at: string;
  updated_at?: string;
  estimated_completion_time?: string;
  items?: ApiOrderItem[];
}

export interface ApiBranch {
  id: string;
  name: string;
  code?: string;
}

export interface ApiTable {
  id: string;
  name: string;
  zone?: string;
  zone_name?: string;
  table_number?: number;
  capacity?: number;
  size?: string;
  shape?: string;
  status?: string;
  position_x?: number;
  position_y?: number;
}
