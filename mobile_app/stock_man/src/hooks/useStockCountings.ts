// ============================================================
// Stock Man — Stock Counting hooks
//
// React Query wrappers for `stockCountingService`. Cache shape:
//
//   ["stock-countings", filters]            list
//   ["stock-countings", id]                 detail
//
// Every mutation invalidates `["stock-countings"]` so the list /
// detail screens re-fetch on the next render. The detail key is
// also invalidated on a single-counting mutation so the detail
// screen reflects the change without a manual refetch.
//
// Stale times:
//   - list / detail  → 30s (countings change often during a session)
//
// Unlike purchase orders / transfers, the cache key is NOT scoped
// to the active branch because StockCounting is always warehouse-
// scoped (`warehouse_id` lives in the filter), and a single user
// can audit any warehouse they have permission for.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stockCountingService } from "@/services/stockCountingService";
import { createOfflineMutationFn, isOfflineQueued } from "@/lib/offline/useOfflineMutation";
import type { StockCounting, StockCountingCreatePayload, StockCountingItemUpdate, UUID } from "@/types";

// ─── Queries ──────────────────────────────────────────────

export function useStockCounting(id: UUID | undefined) {
  return useQuery({
    queryKey: ["stock-countings", id],
    queryFn: () => stockCountingService.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────

function useInvalidateCountings() {
  const qc = useQueryClient();
  return (id?: UUID) => {
    void qc.invalidateQueries({ queryKey: ["stock-countings"] });
    if (id) void qc.invalidateQueries({ queryKey: ["stock-countings", id] });
  };
}

export function useCreateStockCounting() {
  const invalidate = useInvalidateCountings();
  return useMutation({
    mutationFn: createOfflineMutationFn<StockCounting, StockCountingCreatePayload>((payload) => ({
      endpoint: "/warehouse/stock-counting/",
      method: "POST",
      payload,
      feature: "stock-counting",
      description: "Create stock counting",
    })),
    onSuccess: (c) => {
      if (isOfflineQueued(c)) return;
      invalidate(c.id);
    },
  });
}

export function useStartStockCounting() {
  const invalidate = useInvalidateCountings();
  return useMutation({
    mutationFn: createOfflineMutationFn<StockCounting, UUID>((id) => ({
      endpoint: `/warehouse/stock-counting/${id}/start/`,
      method: "POST",
      payload: undefined,
      feature: "stock-counting",
      description: "Start stock counting",
      idempotencyKey: `sm:stock-counting:start:${id}`,
    })),
    onSuccess: (c, id) => {
      if (isOfflineQueued(c)) return;
      invalidate(c.id ?? id);
    },
  });
}

export function useFinishStockCounting() {
  const invalidate = useInvalidateCountings();
  return useMutation({
    mutationFn: createOfflineMutationFn<StockCounting, UUID>((id) => ({
      endpoint: `/warehouse/stock-counting/${id}/finish/`,
      method: "POST",
      payload: undefined,
      feature: "stock-counting",
      description: "Finish stock counting",
      idempotencyKey: `sm:stock-counting:finish:${id}`,
    })),
    onSuccess: (c, id) => {
      if (isOfflineQueued(c)) return;
      invalidate(c.id ?? id);
    },
  });
}

export function useApproveStockCounting() {
  const invalidate = useInvalidateCountings();
  return useMutation({
    mutationFn: createOfflineMutationFn<StockCounting, UUID>((id) => ({
      endpoint: `/warehouse/stock-counting/${id}/approve/`,
      method: "POST",
      payload: undefined,
      feature: "stock-counting",
      description: "Approve stock counting",
      idempotencyKey: `sm:stock-counting:approve:${id}`,
    })),
    onSuccess: (c, id) => {
      if (isOfflineQueued(c)) return;
      invalidate(c.id ?? id);
    },
  });
}

export function useUpdateCountingItems() {
  const invalidate = useInvalidateCountings();
  return useMutation({
    mutationFn: createOfflineMutationFn<
      StockCounting,
      { id: UUID; items: StockCountingItemUpdate[] }
    >(({ id, items }) => ({
      endpoint: `/warehouse/stock-counting/${id}/update_items/`,
      method: "POST",
      payload: { items },
      feature: "stock-counting",
      description: "Update counting items",
      idempotencyKey: `sm:stock-counting:update_items:${id}`,
    })),
    onSuccess: (c, { id }) => {
      if (isOfflineQueued(c)) return;
      invalidate(c.id ?? id);
    },
  });
}

export function useDeleteStockCounting() {
  const invalidate = useInvalidateCountings();
  return useMutation({ mutationFn: (id: UUID) => stockCountingService.remove(id), onSuccess: () => invalidate() });
}

// Re-export the model type so screens can `import type { StockCounting } from "@/hooks"`.
export type { StockCounting };
