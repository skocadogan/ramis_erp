// ============================================================
// Stock Man — Domain models (P1)
//
// Single source of truth for every entity surfaced in the
// dashboard, stock, supplier and expiry screens. Each shape
// mirrors the corresponding DRF serializer in the backend
// (see docs/wiki/Inventory.md, Warehouse.md, Stock_Man_App.md).
//
// Conventions:
//   - UUID = string.  The DRF UUID field is a `str` in JSON.
//   - All optional fields are explicitly marked with `?` so
//     `noUncheckedIndexedAccess` is happy.
//   - `*_display` / `*_name` fields are the read-only joins the
//     backend returns alongside the FK. They're never used for
//     writes — use the underlying FK id for those.
// ============================================================

/** Generic UUID identifier (DRF returns UUIDField as string). */
export type UUID = string;

// ─── Branch ──────────────────────────────────────────────────
export type Branch = {
  id: UUID;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  currency?: string;
  tax_rate?: number;
  table_cleaning_duration_minutes?: number;
  is_active?: boolean;
};

// ─── Kitchen Station ─────────────────────────────────────────
export type KitchenStation = {
  id: UUID;
  branch: UUID;
  branch_name?: string;
  name: string;
  code: string;
  color?: string;
  description?: string;
  is_active?: boolean;
  categories_count?: number;
  pending_orders_count?: number;
  warehouse?: UUID | null;
  warehouse_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

// ─── Warehouse ───────────────────────────────────────────────
type WarehouseType = "MAIN" | "SUB" | "COLD" | "DRY" | "RAW" | "KITCHEN";

export type Warehouse = {
  id: UUID;
  name: string;
  code: string;
  warehouse_type: WarehouseType;
  warehouse_type_display?: string;
  branches: UUID[];
  branch_names?: string[];
  manager?: UUID | null;
  manager_name?: string | null;
  is_default?: boolean;
  address?: string;
  capacity_info?: string;
  notes?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type WarehouseSummary = {
  total_warehouses: number;
  pending_orders: number;
  pending_receivings: number;
  active_transfers: number;
  pending_countings: number;
};

// ─── Warehouse Stock Level (per-item, per-warehouse) ─────────
export type WarehouseStockLevel = {
  id?: UUID;
  warehouse?: UUID;
  warehouse_id?: UUID;
  warehouse_code?: string;
  warehouse_name?: string;
  stock_item?: UUID;
  stock_item_name?: string;
  stock_item_sku?: string;
  stock_item_unit?: string;
  quantity: number | string;
  minimum_quantity: number | string;
  is_low_stock: boolean;
  created_at?: string;
  updated_at?: string;
};

// ─── Stock Item ──────────────────────────────────────────────
export type StockItem = {
  id: UUID;
  name: string;
  sku: string;
  barcode?: string;
  unit: string;
  minimum_quantity: number;
  effective_minimum?: number;
  last_purchase_price?: number;
  average_cost?: number;
  current_quantity?: number;
  physical_quantity?: number;
  reserved_quantity?: number;
  category?: UUID | null;
  category_name?: string | null;
  category_code?: string | null;
  allergens?: UUID[];
  allergen_names?: string[];
  is_returnable?: boolean;
  is_low_stock?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

// ─── Stock Lot (FEFO) ────────────────────────────────────────
export type StockLot = {
  id: UUID;
  stock_item: UUID;
  stock_item_name?: string;
  warehouse: UUID;
  warehouse_name?: string;
  lot_number: string;
  expiry_date?: string | null;
  quantity: number;
  initial_quantity: number;
  unit_price?: number;
  received_at?: string;
  is_expired?: boolean;
  days_until_expiry?: number | null;
};

// ─── Stock Movement ──────────────────────────────────────────
export type StockMovementType =
  | "IN"
  | "OUT"
  | "ADJUSTMENT"
  | "WASTE"
  | "TRANSFER"
  | "RETURN"
  | "CANCEL"
  | "DISPOSAL";

export type StockMovement = {
  id: UUID;
  stock_item: UUID;
  stock_item_name?: string;
  stock_item_sku?: string;
  warehouse?: UUID | null;
  warehouse_name?: string;
  movement_type: StockMovementType;
  movement_type_display?: string;
  quantity: number;
  signed_quantity?: number;
  unit: string;
  unit_price?: number;
  reference?: string;
  notes?: string;
  performed_by?: UUID | null;
  performed_by_name?: string;
  supplier?: UUID | null;
  supplier_name?: string;
  created_at: string;
};

// ─── Supplier ────────────────────────────────────────────────
export type Supplier = {
  id: UUID;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  stock_items?: UUID[];
  stock_item_names?: string[];
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SupplierPerformance = {
  days: number;
  since: string;
  receivings_count: number;
  received_total: number;
  rejected_total: number;
  rejection_rate: number;
  avg_lead_days?: number | null;
  on_time_rate?: number | null;
};

// ─── Stock Category ──────────────────────────────────────────
export type StockCategory = {
  id: UUID;
  name: string;
  code: string;
  parent?: UUID | null;
  parent_name?: string;
  is_active?: boolean;
};

// ─── Allergen ────────────────────────────────────────────────
export type Allergen = {
  id: UUID;
  code: string;
  name: string;
  prevalence_pct?: number;
  risk_score?: number;
  sort_order?: number;
};

// ─── Unit ────────────────────────────────────────────────────
export type StockUnit = {
  id: UUID;
  name: string;
  short_name: string;
  multiplier: number;
  category: "WEIGHT" | "VOLUME" | "COUNT" | "OTHER";
  category_display?: string;
};

// ─── Expiry warnings (EPIC-04) ───────────────────────────────
export type ExpiryWarning = {
  /** Backend ExpiringLotSerializer returns the lot UUID as `id`. */
  id: UUID;
  stock_item_id: UUID;
  stock_item_name: string;
  stock_item_sku: string;
  warehouse_id: UUID;
  warehouse_name: string;
  lot_number: string;
  expiry_date: string;
  days_until_expiry: number;
  quantity: number;
  unit?: string;
  is_expired: boolean;
};

export type ExpirySummary = {
  warehouse_id?: UUID;
  within_3_days: number;
  within_7_days: number;
  expired: number;
  total_expiring: number;
};

export type ExpiryActionType = "PRIORITY_CONSUME" | "TRANSFER_SUGGEST" | "PLAN_NOTE";

export type ExpiryAction = {
  id: UUID;
  lot_id: UUID;
  stock_item_name?: string;
  stock_item_sku?: string;
  warehouse_name?: string;
  lot_number?: string;
  expiry_date?: string;
  action_type: ExpiryActionType;
  action_type_label?: string;
  notes?: string;
  created_by_name?: string;
  created_at: string;
};

// ─── Purchase Order (Warehouse app) ─────────────────────────
export type POStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "ORDERED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export type PurchaseOrderItem = {
  id?: UUID;
  stock_item: UUID;
  stock_item_name?: string;
  stock_item_sku?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  received_quantity?: number;
  line_total?: number;
  is_fully_received?: boolean;
  notes?: string;
};

export type PurchaseOrder = {
  id: UUID;
  order_number: string;
  supplier: UUID;
  supplier_name?: string;
  warehouse: UUID;
  warehouse_name?: string;
  status: POStatus;
  status_display?: string;
  order_date: string;
  expected_date?: string | null;
  notes?: string;
  created_by?: UUID | null;
  created_by_name?: string;
  approved_by?: UUID | null;
  approved_by_name?: string;
  approved_at?: string | null;
  total_amount?: number;
  items: PurchaseOrderItem[];
  is_active?: boolean;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderCreateItem = {
  stock_item_id: UUID;
  quantity: number;
  unit: string;
  unit_price: number;
  notes?: string;
};

export type PurchaseOrderCreatePayload = {
  supplier_id: UUID;
  warehouse_id: UUID;
  order_date: string;
  expected_date?: string;
  notes?: string;
  items: PurchaseOrderCreateItem[];
};

export type PurchaseOrderUpdatePayload = Partial<PurchaseOrderCreatePayload>;

export type PurchaseOrderSuggestion = {
  stock_item_id: UUID;
  stock_item_name?: string;
  stock_item_sku?: string;
  unit?: string;
  current_quantity: number;
  minimum_quantity: number;
  weekly_avg: number;
  recommended_quantity: number;
  preferred_supplier_id?: UUID | null;
  preferred_supplier_name?: string | null;
  estimated_cost?: number;
  reason?: string;
};

export type PurchaseOrderSuggestionRequest = {
  warehouse_id: UUID;
  weeks?: 4 | 8;
  only_positive?: boolean;
  category_id?: UUID;
  search?: string;
  branch_id?: UUID;
};

type PurchaseOrderSuggestionCommitItem = {
  stock_item_id: UUID;
  quantity: number;
  recommended_quantity?: number;
  notes?: string;
};

export type PurchaseOrderSuggestionCommitPayload = {
  warehouse_id: UUID;
  items: PurchaseOrderSuggestionCommitItem[];
  preferred_suppliers?: Record<UUID, UUID>; // stock_item_id → supplier_id
};

// GoodsReceiving minimal (P2 uses, P3 expands)
export type GoodsReceiving = {
  id: UUID;
  receiving_number: string;
  purchase_order?: UUID | null;
  purchase_order_number?: string;
  supplier: UUID;
  supplier_name?: string;
  warehouse: UUID;
  warehouse_name?: string;
  status: "PENDING" | "INSPECTED" | "ACCEPTED" | "PARTIALLY_ACCEPTED" | "REJECTED";
  status_display?: string;
  received_date: string;
  invoice_number?: string;
  waybill_number?: string;
  total_amount?: number;
  received_by_name?: string;
  inspected_by_name?: string;
  notes?: string;
  items: {
    id?: UUID;
    stock_item: UUID;
    stock_item_name?: string;
    expected_quantity: number;
    received_quantity: number;
    rejected_quantity: number;
    accepted_quantity?: number;
    unit: string;
    unit_price: number;
    line_total?: number;
    expiry_date?: string | null;
    batch_number?: string;
    notes?: string;
  }[];
  created_at: string;
  updated_at: string;
};

// ─── Warehouse Transfer ─────────────────────────────────────
export type TransferStatus = "DRAFT" | "PENDING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";

export type WarehouseTransferItem = {
  id?: UUID;
  stock_item: UUID;
  stock_item_name?: string;
  stock_item_sku?: string;
  quantity: number;
  unit: string;
  received_quantity?: number;
  notes?: string;
};

export type WarehouseTransfer = {
  id: UUID;
  transfer_number: string;
  source_warehouse: UUID;
  source_warehouse_name?: string;
  target_warehouse: UUID;
  target_warehouse_name?: string;
  status: TransferStatus;
  status_display?: string;
  transfer_date: string;
  completed_date?: string | null;
  requested_by?: UUID | null;
  requested_by_name?: string;
  approved_by?: UUID | null;
  approved_by_name?: string;
  notes?: string;
  deficiency_report?: UUID | null;
  items: WarehouseTransferItem[];
  is_active?: boolean;
  created_at: string;
  updated_at: string;
};

export type WarehouseTransferCreateItem = {
  stock_item_id: UUID;
  quantity: number;
  unit: string;
  notes?: string;
};

export type WarehouseTransferCreatePayload = {
  source_warehouse_id: UUID;
  target_warehouse_id: UUID;
  transfer_date: string;
  notes?: string;
  items: WarehouseTransferCreateItem[];
  accept_partial?: boolean;
};

export type WarehouseTransferUpdatePayload = Partial<WarehouseTransferCreatePayload>;

// ─── Stock Counting ─────────────────────────────────────────
export type StockCountingStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "APPROVED";

export type StockCountingItem = {
  id?: UUID;
  stock_item: UUID;
  stock_item_name?: string;
  stock_item_sku?: string;
  system_quantity: number;
  counted_quantity: number;
  difference: number;
  unit: string;
  notes?: string;
};

export type StockCounting = {
  id: UUID;
  counting_number: string;
  warehouse: UUID;
  warehouse_name?: string;
  status: StockCountingStatus;
  status_display?: string;
  counting_date: string;
  counted_by?: UUID | null;
  counted_by_name?: string;
  approved_by?: UUID | null;
  approved_by_name?: string;
  approved_at?: string | null;
  notes?: string;
  items: StockCountingItem[];
  is_active?: boolean;
  created_at: string;
  updated_at: string;
};

export type StockCountingCreateItem = {
  stock_item_id: UUID;
  system_quantity: number;
  counted_quantity: number;
  unit: string;
  notes?: string;
};

export type StockCountingCreatePayload = {
  warehouse_id: UUID;
  counting_date: string;
  notes?: string;
  items: StockCountingCreateItem[];
  auto_populate?: boolean;
};

export type StockCountingItemUpdate = {
  stock_item_id: UUID;
  counted_quantity: number;
  unit?: string;
  notes?: string;
};

// ─── Deficiency Report ──────────────────────────────────────
export type DeficiencyStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "ORDERED"
  | "PARTIALLY_COMMITTED"
  | "COMMITTED"
  | "CANCELLED";

export type DeficiencyReportItem = {
  id?: UUID;
  stock_item: UUID;
  stock_item_name?: string;
  stock_item_sku?: string;
  quantity: number;
  unit: string;
  notes?: string;
  current_stock?: number;
  minimum_stock?: number;
  is_low_stock?: boolean;
};

export type DeficiencyReport = {
  id: UUID;
  report_number: string;
  kitchen_station: UUID;
  kitchen_station_name?: string;
  branch_name?: string;
  target_warehouse: UUID;
  target_warehouse_name?: string;
  status: DeficiencyStatus;
  status_display?: string;
  notes?: string;
  created_by?: UUID | null;
  created_by_name?: string;
  approved_by?: UUID | null;
  approved_by_name?: string;
  approved_at?: string | null;
  items: DeficiencyReportItem[];
  transfers?: {
    id: UUID;
    transfer_number: string;
    status: string;
    transfer_date: string;
    completed_date?: string;
    items: any[];
    is_active?: boolean;
  }[];
  purchase_orders_count?: number;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
};

export type DeficiencyReportCreateItem = {
  stock_item_id: UUID;
  quantity: number;
  unit: string;
  notes?: string;
};

export type DeficiencyReportCreatePayload = {
  kitchen_station_id: UUID;
  notes?: string;
  items: DeficiencyReportCreateItem[];
};

export type DeficiencyActionType = "PURCHASE_ALL" | "PURCHASE_PARTIAL" | "FULFILL_STOCK" | "REJECT";

export type DeficiencyItemActionExecutePayload = {
  items: { item_id: UUID; action: DeficiencyActionType }[];
  supplier_id?: UUID;
  warehouse_id?: UUID;
};

/** GET .../stock_availability/ — kalem bazlı tedarik stok özeti */
export type DeficiencyAvailabilityRow = {
  item_id: UUID;
  stock_item_id: UUID;
  stock_item_name: string;
  required_quantity: string;
  total_available: string;
  can_fully_fulfill: boolean;
  can_partially_fulfill: boolean;
  warehouses?: {
    warehouse_id: UUID;
    warehouse_name: string;
    available_quantity: string;
  }[];
};

// ─── Printer ────────────────────────────────────────────────
export type Printer = {
  id: UUID;
  name: string;
  printer_type: "KITCHEN" | "RECEIPT" | "TRANSFER" | "REPORT";
  usage_type?: string;
  usage_type_display?: string;
  ip_address?: string;
  port?: number;
  device_path?: string;
  connection_type: "NETWORK" | "USB" | "BLUETOOTH";
  connection_type_display?: string;
  is_default?: boolean;
  is_active?: boolean;
  receipt_template?: string | null;
  kitchen_station?: UUID | null;
  kitchen_station_name?: string | null;
};

export type PrintJobCreate = {
  printer_id: UUID;
  job_type: "GOODS_RECEIVING_LABEL" | "TRANSFER_DOCUMENT" | "PO_PRINT" | "STOCK_COUNT_REPORT";
  reference_id: UUID;
  copies?: number;
};

// ─── Generic DRF envelope ────────────────────────────────────
export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type ApiError = {
  detail?: string;
  error?: string;
  code?: string;
  status?: number;
};
