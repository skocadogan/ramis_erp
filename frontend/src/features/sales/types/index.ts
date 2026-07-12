import type { StockMovement } from "@/features/inventory/types";

export type PaymentMethod = 'CASH' | 'CARD' | 'OTHER' | 'CREDIT';

export interface Sale {
    id: string;
    order: string;
    branch: string;
    branch_name: string;
    table_name: string | null;
    created_by: string | null;
    created_by_name: string | null;
    payment_method: PaymentMethod;
    payment_method_display: string;
    is_split_payment?: boolean;
    total_amount: string;
    paid_at: string;
    notes: string;
    is_deleted: boolean;
    deleted_at: string | null;
    created_at: string;
    discount_amount?: string;
    discount_type?: string | null;
    discount_type_display?: string | null;
    discount_applied_by?: string | null;
    discount_applied_by_name?: string | null;
    order_type?: 'TABLE' | 'TAKEAWAY';
}

export type TabType = 'sales' | 'summary' | 'products' | 'menu_engineering' | 'cancellations';

export type MenuEngineeringClass = 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';
type RecipeStatus = 'HAS_RECIPE' | 'NO_RECIPE';
type CostSource = 'RECIPE_LAST_COST' | 'RECIPE_FEFO_ESTIMATE' | null;
type StockTrackingModeCoverage = 'INGREDIENT' | 'PRODUCT' | 'MIXED';
type VarianceCoverage = 'NONE' | 'STOCK_ONLY';
type ActualCoverage = 'NONE' | 'PARTIAL' | 'FULL';
export type MenuEngineeringAction =
    | 'INCREASE_PRICE'
    | 'FEATURE'
    | 'REMOVE_FROM_MENU'
    | 'COST_INCREASED';

export interface MenuEngineeringCombinedComponent {
    product_id: string;
    product_name: string;
    quantity: number;
    effective_quantity: number;
    product_unit_id: string | null;
    product_unit_name: string | null;
    product_unit_multiplier: number;
}

export interface MenuEngineeringRow {
    product_id: string;
    product_name: string;
    category_id: string | null;
    category_name: string;
    is_combined: boolean;
    combined_components: MenuEngineeringCombinedComponent[];
    sold_qty: number;
    revenue: number;
    avg_sell_price: number;
    estimated_unit_cost: number | null;
    estimated_food_cost: number | null;
    estimated_gross_profit: number | null;
    estimated_margin_pct: number | null;
    popularity_index: number | null;
    profit_index: number | null;
    menu_class: MenuEngineeringClass | null;
    actual_unit_cost: number | null;
    actual_food_cost: number | null;
    actual_gross_profit: number | null;
    actual_margin_pct: number | null;
    actual_profit_index: number | null;
    actual_popularity_index: number | null;
    actual_menu_class: MenuEngineeringClass | null;
    actual_coverage: ActualCoverage;
    actual_covered_qty: number;
    actual_cost_entries: number;
    recipe_status: RecipeStatus;
    cost_source: CostSource;
    stock_tracking_mode_coverage: StockTrackingModeCoverage;
    variance_coverage: VarianceCoverage;
    action_recommendations: MenuEngineeringAction[];
    diagnostics: {
        branch_count: number;
        missing_cost: boolean;
        actual_covered_order_items: number;
    };
}

interface MenuEngineeringSummary {
    total_products: number;
    classified_products: number;
    stars_count: number;
    puzzlers_count: number;
    plowhorses_count: number;
    dogs_count: number;
    total_estimated_profit: number;
    avg_estimated_margin_pct: number;
    popularity_threshold_qty: number;
    profit_threshold_amount: number;
}

interface ActualMenuEngineeringSummary {
    total_products: number;
    classified_products: number;
    stars_count: number;
    puzzlers_count: number;
    plowhorses_count: number;
    dogs_count: number;
    total_actual_profit: number;
    avg_actual_margin_pct: number;
    popularity_threshold_qty: number;
    profit_threshold_amount: number;
    fully_costed_products: number;
    partial_coverage_products: number;
    uncovered_products: number;
}

interface StockVarianceTotals {
    waste_qty: number;
    cancel_qty: number;
    return_qty: number;
    disposal_qty: number;
    adjustment_qty: number;
    total_variance_qty: number;
    total_variance_cost: number;
}

export interface StockVarianceItem {
    stock_item_id: string;
    name: string;
    sku: string;
    unit: string;
    total_qty: number;
    total_cost: number;
    waste_qty: number;
    cancel_qty: number;
    return_qty: number;
    disposal_qty: number;
    adjustment_qty: number;
}

interface StockVarianceMovement {
    movement_id: string;
    stock_item_id: string;
    stock_item_name: string;
    warehouse_id: string;
    warehouse_name: string;
    movement_type: StockMovement["movement_type"];
    quantity: number;
    unit_price: number;
    total_cost: number;
    reference: string;
    created_at: string;
}

interface StockVarianceSummary {
    range: { start_date: string; end_date: string };
    totals: StockVarianceTotals;
    top_items: StockVarianceItem[];
    recent_movements: StockVarianceMovement[];
}

export interface MenuEngineeringAnalyticsData {
    range: { start_date: string; end_date: string };
    summary: MenuEngineeringSummary;
    actual_summary: ActualMenuEngineeringSummary;
    products: MenuEngineeringRow[];
    action_summary: Record<MenuEngineeringAction, number>;
    stock_variance_summary: StockVarianceSummary;
}

type CancellationRecordType = 'CANCELLATION' | 'RETURN';

export interface CancellationRecord {
    id: string;
    record_type: CancellationRecordType;
    cancelled_at: string;
    branch_id: string;
    branch_name: string;
    order_id: string;
    table_name: string | null;
    order_type: 'TABLE' | 'TAKEAWAY';
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: string;
    total_price: string;
    cancel_reason_code: string | null;
    cancel_reason_text: string | null;
    cancelled_by_id: string | null;
    cancelled_by_name: string | null;
}

export interface CancellationListTotals {
    item_count: number;
    total_amount: number;
}

export function parseCancellationTotals(
    data: { totals?: CancellationListTotals },
    rows: CancellationRecord[],
): CancellationListTotals {
    if (data.totals && typeof data.totals === 'object') {
        return {
            item_count: Number(data.totals.item_count ?? 0),
            total_amount: Number(data.totals.total_amount ?? 0),
        };
    }
    return rows.reduce(
        (acc, row) => ({
            item_count: acc.item_count + row.quantity,
            total_amount: acc.total_amount + Number(row.total_price),
        }),
        { item_count: 0, total_amount: 0 },
    );
}

export type SaleMoneyRow = { total_amount: string | number; discount_amount?: string | number | null };

export function sumSaleMoneyTotals(rows: SaleMoneyRow[]) {
    return rows.reduce(
        (acc, x) => {
            const net = Number(x.total_amount);
            const d = Number(x.discount_amount ?? 0);
            acc.net += net;
            acc.discount += d;
            acc.gross += net + d;
            return acc;
        },
        { gross: 0, discount: 0, net: 0 },
    );
}

export function parseListTotals(
    data: { totals?: { gross_total?: number; discount_total?: number; net_total?: number } },
    rows: SaleMoneyRow[],
) {
    if (data.totals && typeof data.totals === 'object') {
        return {
            gross: Number(data.totals.gross_total ?? 0),
            discount: Number(data.totals.discount_total ?? 0),
            net: Number(data.totals.net_total ?? 0),
        };
    }
    return sumSaleMoneyTotals(rows);
}
