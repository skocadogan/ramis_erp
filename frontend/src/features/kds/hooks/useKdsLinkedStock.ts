import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export type KdsLinkedStockLevel = {
  id: string;
  warehouse: string;
  warehouse_name: string;
  stock_item: string;
  stock_item_name: string;
  stock_item_sku: string;
  stock_item_unit: string;
  quantity: string;
  minimum_quantity: string;
  is_low_stock: boolean;
};

export type KdsLinkedStockResponse = {
  warehouse_id: string | null;
  warehouse_name: string | null;
  levels: KdsLinkedStockLevel[];
};

async function fetchKdsLinkedStock(stationId: string): Promise<KdsLinkedStockResponse> {
  const res = await api.get<KdsLinkedStockResponse>(`/stations/${stationId}/linked-stock-levels/`);
  return res.data;
}

export function useKdsLinkedStock(stationId: string | undefined) {
  return useQuery({
    queryKey: stationId ? queryKeys.kdsLinkedStock(stationId) : queryKeys.kdsLinkedStock("NONE"),
    queryFn: () => fetchKdsLinkedStock(stationId!),
    enabled: !!stationId,
    staleTime: 15_000,
  });
}
