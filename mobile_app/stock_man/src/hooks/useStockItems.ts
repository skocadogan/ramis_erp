// ============================================================
// Stock Man — Stock Item hooks (+ categories, units, allergens)
//
// React Query wrappers for the stockItem / category / unit /
// allergen services. Each hook owns its own query key so cache
// invalidation is straightforward from feature mutation hooks
// (e.g. `invalidateQueries({ queryKey: ["stock-items"] })`).
//
// The category/unit/allergen hooks return plain arrays (the
// `extractResults` / `.results` unwrap is done in the queryFn
// so the consumer never has to touch the DRF envelope).
// ============================================================

import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  stockItemService,
  stockCategoryService,
  stockUnitService,
} from "@/services/stockItemService";
import { useBranchStore } from "@/store/useBranchStore";
import type { UUID } from "@/types";

export type StockItemFilters = {
  warehouse_id?: UUID;
  category_id?: UUID;
  supplier_id?: UUID;
  is_low_stock?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
  stock_status?: "normal" | "low" | "critical" | "warning";
};

export function useStockItems(
  filters: StockItemFilters = {},
  options?: { enabled?: boolean; staleTime?: number }
) {
  return useQuery({
    queryKey: ["stock-items", filters],
    queryFn: () => stockItemService.list(filters),
    staleTime: options?.staleTime ?? 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useInfiniteStockItems(
  filters: StockItemFilters = {},
  options?: { enabled?: boolean }
) {
  return useInfiniteQuery({
    queryKey: ["stock-items", "infinite", filters],
    queryFn: ({ pageParam = 1 }) => stockItemService.list({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: any) => {
      if (!lastPage || !lastPage.next) return undefined;
      const match = lastPage.next.match(/page=(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    },
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useStockItem(id: UUID | undefined) {
  return useQuery({
    queryKey: ["stock-items", null, id],
    queryFn: () => stockItemService.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useStockItemWarehouseLevels(id: UUID | undefined) {
  return useQuery({
    queryKey: ["stock-items", null, id, "warehouse-levels"],
    queryFn: () => stockItemService.warehouseLevels(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useFefoReportDetail(
  stockItemId?: UUID,
  params?: { warehouse_id?: UUID },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["fefo-report-detail", stockItemId, params],
    queryFn: () =>
      stockItemService.fefoReportDetail({
        stock_item_id: stockItemId!,
        ...params,
      }),
    staleTime: 60_000,
    enabled: (options?.enabled ?? true) && !!stockItemId,
  });
}

export function useStockItemsSummary(params?: { warehouse_id?: UUID }) {
  const branchId = useBranchStore((s) => s.activeBranchId);
  return useQuery({
    queryKey: ["stock-items", "summary", branchId, params],
    queryFn: () => stockItemService.summary(params),
    enabled: !!branchId,
    staleTime: 60_000,
  });
}

export function useStockMovements(params?: {
  stock_item_id?: UUID;
  warehouse_id?: UUID;
  movement_type?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}) {
  return useQuery({
    queryKey: ["stock-movements", params],
    queryFn: () => stockItemService.movements(params),
    staleTime: 30_000,
  });
}

export function useStockCategories() {
  return useQuery({
    queryKey: ["stock-categories"],
    queryFn: async () => {
      const r = await stockCategoryService.list();
      return r.results;
    },
    staleTime: 5 * 60_000,
  });
}

export function useStockUnits() {
  return useQuery({
    queryKey: ["stock-units"],
    queryFn: () => stockUnitService.list(),
    staleTime: 60 * 60_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────

export function useCreateStockItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      sku: string;
      barcode?: string;
      unit?: string;
      category?: UUID;
      minimum_quantity?: number;
      last_purchase_price?: number;
      allergen_ids?: UUID[];
    }) => stockItemService.create(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stock-items"] });
      void qc.invalidateQueries({ queryKey: ["stock-items", "summary"] });
    },
  });
}
