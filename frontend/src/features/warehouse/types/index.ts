// ──────────────────────────────────────────────────
// Warehouse Types
// ──────────────────────────────────────────────────
export interface Warehouse {
  id: string
  name: string
  code: string
  warehouse_type: "MAIN" | "SUB" | "COLD" | "DRY" | "RAW" | "KITCHEN"
  branches: string[]
  branch_names: string[]
  address: string | null
  capacity_info: string | null
  manager: string | null
  manager_name: string | null
  is_default: boolean
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────
// Purchase Order Types
// ──────────────────────────────────────────────────
type PurchaseOrderStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "ORDERED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED"

export interface PurchaseOrderItem {
  id: string
  stock_item: string
  stock_item_name: string | null
  stock_item_sku: string | null
  quantity: number
  unit: string
  unit_price: number
  received_quantity: number
  line_total: number
  is_fully_received: boolean
  notes: string | null
}

export interface PurchaseOrder {
  id: string
  order_number: string
  supplier: string
  supplier_name: string | null
  warehouse: string
  warehouse_name: string | null
  status: PurchaseOrderStatus
  order_date: string
  expected_date: string | null
  notes: string | null
  created_by: string | null
  created_by_name: string | null
  approved_by: string | null
  approved_by_name: string | null
  approved_at: string | null
  total_amount: number
  items: PurchaseOrderItem[]
  is_active: boolean
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────
// Goods Receiving Types
// ──────────────────────────────────────────────────
type GoodsReceivingStatus =
  | "PENDING"
  | "INSPECTED"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "REJECTED"

interface GoodsReceivingItem {
  id: string
  stock_item: string
  stock_item_name: string | null
  stock_item_sku: string | null
  expected_quantity: number
  received_quantity: number
  rejected_quantity: number
  accepted_quantity: number
  unit: string
  unit_price: number
  line_total: number
  expiry_date: string | null
  batch_number: string | null
  notes: string | null
}

export interface GoodsReceiving {
  id: string
  receiving_number: string
  purchase_order: string | null
  purchase_order_number: string | null
  supplier: string
  supplier_name: string | null
  warehouse: string
  warehouse_name: string | null
  status: GoodsReceivingStatus
  received_date: string
  invoice_number: string | null
  waybill_number: string | null
  received_by: string | null
  received_by_name: string | null
  inspected_by: string | null
  inspected_by_name: string | null
  notes: string | null
  total_amount: number
  items: GoodsReceivingItem[]
  is_active: boolean
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────
// Transfer Types
// ──────────────────────────────────────────────────
type TransferStatus =
  | "DRAFT"
  | "PENDING"
  | "IN_TRANSIT"
  | "COMPLETED"
  | "CANCELLED"

interface WarehouseTransferItem {
  id: string
  stock_item: string
  stock_item_name: string | null
  stock_item_sku: string | null
  quantity: number
  unit: string
  received_quantity: number
  notes: string | null
}

export interface WarehouseTransfer {
  id: string
  transfer_number: string
  source_warehouse: string
  source_warehouse_name: string | null
  target_warehouse: string
  target_warehouse_name: string | null
  status: TransferStatus
  transfer_date: string
  completed_date: string | null
  requested_by: string | null
  requested_by_name: string | null
  approved_by: string | null
  approved_by_name: string | null
  notes: string | null
  items: WarehouseTransferItem[]
  is_active: boolean
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────
// Stock Counting Types
// ──────────────────────────────────────────────────
type CountingStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "APPROVED"

export type CountingDifferenceReason =
  | "CORRECTION"
  | "WRONG_MEASUREMENT"
  | "CANCEL_RETURN"
  | "WASTE"
  | "OTHER"

export const COUNTING_DIFFERENCE_REASONS: CountingDifferenceReason[] = [
  "CORRECTION",
  "WRONG_MEASUREMENT",
  "CANCEL_RETURN",
  "WASTE",
  "OTHER",
]

export interface StockCountingItem {
  id: string
  stock_item: string
  stock_item_name: string | null
  stock_item_sku: string | null
  system_quantity: number
  counted_quantity: number
  difference: number
  unit: string
  notes: string | null
  difference_reason?: CountingDifferenceReason | null
  difference_reason_display?: string | null
  linked_movement?: string | null
}

export interface StockCounting {
  id: string
  counting_number: string
  warehouse: string
  warehouse_name: string | null
  status: CountingStatus
  counting_date: string
  counted_by: string | null
  counted_by_name: string | null
  approved_by: string | null
  approved_by_name: string | null
  approved_at: string | null
  notes: string | null
  items: StockCountingItem[]
  is_active: boolean
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────
// Summary & Common Types
// ──────────────────────────────────────────────────
export interface WarehouseSummary {
  total_warehouses: number
  pending_orders: number
  overdue_orders: number
  pending_receivings: number
  active_transfers: number
  pending_countings: number
}

interface ProcurementOverdueOrder {
  po_id: string
  order_number: string
  supplier_id: string
  supplier_name: string
  warehouse_id: string
  warehouse_name: string
  expected_date: string
  days_overdue: number
  status: string
}

interface ProcurementSupplierAlert {
  supplier_id: string
  supplier_name: string
  overdue_count: number
  max_days_overdue: number
  on_time_rate: number | null
  severity: "critical" | "warning"
}

export interface ProcurementAlertsResponse {
  overdue_orders_count: number
  overdue_orders: ProcurementOverdueOrder[]
  supplier_alerts: ProcurementSupplierAlert[]
}

export interface PriceIncreaseRow {
  stock_item_id: string
  name: string
  sku: string
  unit: string
  previous_price: string
  current_price: string
  change_pct: string
  last_purchase_date: string
  supplier_name: string | null
}

// ──────────────────────────────────────────────────
// Purchase Recommendation Types (EPIC-01)
// ──────────────────────────────────────────────────
interface PurchaseRecommendationSupplier {
  id: string
  name: string
}

export interface PurchaseRecommendation {
  stock_item_id: string
  stock_item_name: string
  stock_item_sku: string
  unit: string
  current_quantity: string
  minimum_quantity: string
  in_transit_quantity: string
  weekly_average_consumption: string
  daily_average_consumption: string
  total_consumption: string
  recommended_quantity: string
  horizon_days: number
  estimated_days_until_stockout: string | null
  urgency: "critical" | "warning" | "ok"
  is_low_stock: boolean
  suppliers: PurchaseRecommendationSupplier[]
  has_supplier_conflict: boolean
}

export interface PurchaseRecommendationsResponse {
  count: number
  next: string | null
  previous: string | null
  results: PurchaseRecommendation[]
  warehouse_id: string
  weeks: number
  horizon_days: number
  safety_factor: string
  since: string
}

export type WarehouseTabType =
  | "warehouses"
  | "purchase_recommendations"
  | "price_increases"
  | "purchase_orders"
  | "goods_receiving"
  | "transfers"
  | "stock_counting"
  | "deficiency_reports"
  | "kitchen_closing"
  | "expiring_lots"
  | "waste_reports"
  | "return_cancel_reports"

// ──────────────────────────────────────────────────
// Kitchen Closing (Gün Sonu Kapanış Sayımı) Types
// ──────────────────────────────────────────────────
export interface KitchenClosingItem {
  stock_item_id: string
  stock_item_name: string
  stock_item_sku: string
  unit: string
  theoretical_quantity: number
  counted_quantity: number | null
}

export interface KitchenClosingResult {
  waste_count: number
  message: string
}

// ──────────────────────────────────────────────────
// Expiring Lots (SKT Yaklaşan Partiler) Types
// ──────────────────────────────────────────────────
export interface ExpiringLot {
  id: string
  stock_item_id?: string
  stock_item_name: string
  stock_item_sku: string
  warehouse_id?: string
  warehouse_name: string
  lot_number: string
  expiry_date: string | null
  days_until_expiry: number | null
  quantity: number | string
  is_expired: boolean
  risk_score?: number
}

export type ExpiryActionType = "PRIORITY_CONSUME" | "TRANSFER_SUGGEST" | "PLAN_NOTE"

export interface ExpiryActionPreviewSummary {
  action_type: ExpiryActionType
  can_execute: boolean
  warnings: string[]
  automation_enabled?: boolean
  fefo_boost_value?: number
  fefo_boost_until?: string
  prep_tasks?: Array<{
    id: string
    title: string
    current_priority: number
    new_priority: number
  }>
  source_warehouse_id?: string
  source_warehouse_name?: string
  target_warehouse_id?: string
  target_warehouse_name?: string
  quantity?: string
  unit?: string
  stock_item_name?: string
  note_preview?: string
  plan_id?: string | null
  existing_transfer_number?: string
}

export interface ExpiryActionTypesResponse {
  automation_enabled: boolean
  types: Array<{ value: ExpiryActionType; label: string }>
}

export interface ExpirySummary {
  within_3_days: number
  within_7_days: number
  expired: number
}

export interface ExpiryActionHistoryItem {
  id: string
  lot_id: string
  stock_item_name: string
  stock_item_sku: string
  warehouse_name: string
  lot_number: string
  expiry_date: string | null
  action_type: ExpiryActionType
  action_type_label: string
  notes: string
  created_by_name: string | null
  created_at: string
  result_json?: Record<string, unknown>
  automation_applied?: boolean
  linked_transfer_number?: string | null
}

export interface ExpiryWarningsResponse {
  count: number
  next: string | null
  previous: string | null
  results: ExpiringLot[]
}

/** Dropdown / tablolarda liste için — görünen etiket `useTranslations('warehouse')('warehouseType.' + kod)` ile */
export const WAREHOUSE_TYPE_CODES = ["MAIN", "SUB", "COLD", "DRY", "RAW", "KITCHEN"] as const satisfies readonly Warehouse["warehouse_type"][]

// ──────────────────────────────────────────────────
// Deficiency Report (Eksik Listesi) Types
// ──────────────────────────────────────────────────
type DeficiencyReportStatus = "DRAFT" | "PENDING" | "APPROVED" | "ORDERED" | "PARTIALLY_COMMITTED" | "COMMITTED" | "CANCELLED"

export interface DeficiencyReportItem {
  id: string
  stock_item: string
  stock_item_name: string | null
  stock_item_sku: string | null
  quantity: number
  unit: string
  notes: string | null
  /** Hedef (mutfak) deposundaki güncel miktar (Taslak vb. için stok sütunu) */
  current_stock?: number | null
  /** Hedef depodaki minimum eşik */
  minimum_stock?: number | null
  /** Hedef depoda bu satır için düşük stok (null/undefined = seviye kaydı yok veya eski API) */
  is_low_stock?: boolean | null
}

export interface DeficiencyReport {
  id: string
  report_number: string
  kitchen_station: string
  kitchen_station_name: string | null
  branch_name: string | null
  target_warehouse: string
  target_warehouse_name: string | null
  status: DeficiencyReportStatus
  notes: string | null
  created_by: string | null
  created_by_name: string | null
  approved_by: string | null
  approved_by_name: string | null
  approved_at: string | null
  items: DeficiencyReportItem[]
  /** Bağlı satın alma siparişi sayısı (silme kuralları için) */
  purchase_orders_count?: number
  /** Eksik listesine bağlı depo transferleri (KDS geçmiş / durum + transfer kalemleri) */
  transfers?: Array<{
    id: string
    transfer_number: string
    status: TransferStatus
    transfer_date: string
    completed_date: string | null
    items: WarehouseTransferItem[]
  }>
  is_active: boolean
  created_at: string
  updated_at: string
}
