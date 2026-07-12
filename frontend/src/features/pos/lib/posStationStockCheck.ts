import api from "@/lib/api";

export type PosStationStockIssue = {
  code: "INSUFFICIENT_STOCK" | "CRITICAL_STOCK" | "SOLD_OUT" | "LIMITED_EXCEEDED";
  stock_item_name: string;
  station_name: string | null;
  warehouse_name: string;
  unit: string;
  available: string;
  physical: string;
  reserved: string;
  required: string;
  minimum_quantity: string;
};

export type PosStationStockCheckResult = {
  ok: boolean;
  issues: PosStationStockIssue[];
  smart_firing_stats?: {
    enabled: boolean;
    max_buffer_minutes: number;
    busy_threshold_minutes?: number;
  };
};

export async function checkPosStationStock(
  branchId: string,
  items: { product_id: string; quantity: number }[],
  stockTrackingMode: "PRODUCT" | "INGREDIENT" = "PRODUCT"
): Promise<PosStationStockCheckResult> {
  const { data } = await api.post<PosStationStockCheckResult>(
    "/orders/main/check_station_stock/",
    {
      branch_id: branchId,
      items,
      stock_tracking_mode: stockTrackingMode,
    }
  );
  return data;
}
