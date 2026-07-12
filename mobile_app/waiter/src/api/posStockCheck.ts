import apiClient from "./client";

export type StockTrackingMode = "PRODUCT" | "INGREDIENT";

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
  stockTrackingMode: StockTrackingMode = "PRODUCT"
): Promise<PosStationStockCheckResult> {
  const { data } = await apiClient.post<PosStationStockCheckResult>(
    "/orders/main/check_station_stock/",
    {
      branch_id: branchId,
      items,
      stock_tracking_mode: stockTrackingMode,
    }
  );
  return data;
}

export async function fetchTerminalStockTrackingMode(
  terminalUuid: string
): Promise<StockTrackingMode> {
  const { data } = await apiClient.get<{ stock_tracking_mode?: string }>(
    `/pos-display/terminals/${terminalUuid}/screen-preferences/`
  );
  const mode = data?.stock_tracking_mode;
  return mode === "INGREDIENT" ? "INGREDIENT" : "PRODUCT";
}
