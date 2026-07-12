export interface StockItem {
  id: string
  name: string
  sku: string
  barcode: string
  unit: string
  current_quantity: number
  minimum_quantity: number
  effective_minimum?: number
  last_purchase_price: number
  is_low_stock: boolean
  category: string
  category_name: string
  category_code: string
  physical_quantity?: number
  reserved_quantity?: number
  warehouse_quantity?: number
  allergens?: { id: string; code: string; name: string; prevalence_pct: number; risk_score: number }[]
  allergen_ids?: string[]
  recipe_usage_count?: number
}

interface StockMovementLotConsumption {
  id: string
  stock_lot: string | null
  quantity: number
  unit_price: number
  lot_number: string
  expiry_date: string | null
}

export interface StockMovement {
  id: string
  /** API `stock_item` FK; bazı ekranlarda `stock_item_id` kullanılmış olabilir */
  stock_item?: string
  stock_item_id?: string
  stock_item_name: string
  /** API alanı `warehouse` */
  warehouse?: string | null
  warehouse_id?: string | null
  warehouse_name: string | null
  movement_type: "IN" | "OUT" | "ADJUSTMENT" | "WASTE" | "TRANSFER" | "RETURN" | "CANCEL" | "DISPOSAL"
  quantity: number
  /** Stok üzerindeki net etki; ADJUSTMENT için işaretli fark. */
  signed_quantity?: number
  unit: string
  unit_price: number
  reference: string
  notes: string
  created_at: string
  performed_by_name?: string | null
  supplier_name?: string | null
  /** FEFO lot tüketim kırılımı (yeni hareketlerde dolu). */
  lot_consumptions?: StockMovementLotConsumption[]
}

export interface Supplier {
  id: string
  name: string
  contact_person: string
  phone: string
  email: string
  address: string
  notes: string
  stock_items?: string[]
  stock_item_names?: string[]
}

export interface StockCategory {
  id: string
  name: string
  code: string
  parent: string | null
  parent_name: string | null
  items_count: number
  is_active: boolean
}

export interface StockUnit {
  id: string
  name: string
  short_name: string
  multiplier: number
  created_at: string
  updated_at: string
}

export type TabType = "items" | "movements" | "suppliers" | "categories" | "unit_definitions" | "fefo_report"

/** Toplu stok girişi taslağı (API: stock-receipt-drafts) */
export interface StockReceiptDraftLine {
  id: string
  sort_order: number
  stock_item: string | null
  stock_item_name?: string | null
  stock_item_sku?: string | null
  temp_name: string
  temp_sku: string
  temp_unit: string
  temp_category: string | null
  temp_category_name?: string | null
  quantity: number
  unit: string
  unit_price: number
  lot_number: string
  expiry_date: string | null
  created_at?: string
  updated_at?: string
}

export interface StockReceiptDraft {
  id: string
  user: string
  user_username?: string
  warehouse: string
  supplier: string | null
  reference: string
  notes: string
  status: "DRAFT" | "POSTED"
  posted_at: string | null
  lines: StockReceiptDraftLine[]
  created_at: string
  updated_at: string
}

export interface StockReceiptDraftFinalizeResponse {
  movement_ids: string[]
  count: number
  draft: StockReceiptDraft
}

/** Tek stok kalemi için depo bazlı seviye (warehouse-levels API) */
export interface StockItemWarehouseLevel {
  warehouse_id: string
  warehouse_code: string
  warehouse_name: string
  quantity: number
  minimum_quantity: number
  is_low_stock: boolean
}

/** FEFO Envanter Raporu Tipleri */
export interface StockLotDetail {
  id: string
  lot_number: string
  expiry_date: string | null
  quantity: number
  initial_quantity: number
  unit_price: number
  warehouse: string
  warehouse_name: string
  received_at: string
}

export interface FEFOReportListItem {
  id: string
  name: string
  sku: string
  unit: string
  category_name: string
  total_quantity: number
  total_value: number
}

/** Lot detayı içeren tam FEFO kaydı (detay API / modal). */
export interface FEFOReportItem extends FEFOReportListItem {
  lots: StockLotDetail[]
}

export interface SupplierRejectedItem {
  id: string
  goods_receiving_id: string
  receiving_number: string
  received_date: string
  status: string
  status_display: string
  stock_item_id: string
  stock_item_name: string
  stock_item_sku: string
  expected_quantity: number
  received_quantity: number
  rejected_quantity: number
  unit: string
  unit_price: number
  batch_number: string
  notes: string
}

export interface SupplierGoodsReceivingSummary {
  id: string
  receiving_number: string
  received_date: string
  status: string
  status_display: string
  warehouse_name: string
  total_amount: number
  items_count: number
  rejected_items_count: number
  accepted_items_count: number
  invoice_number: string
  waybill_number: string
  notes: string
}

export type SupplierDetailTab = "rejected" | "receivings"
