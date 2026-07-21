// ============================================================
// Stock Man — Goods Receiving hooks
//
// React Query wrappers for `goodsReceivingService`. Cache shape:
//
//   ["goods-receivings", branchId, filters]        list
//   ["goods-receivings", id]                       detail
//
// Every mutation invalidates `["goods-receivings"]` so the
// list / detail screens re-fetch on the next render. The
// detail key is also invalidated on a single-GR mutation so
// the detail screen reflects the change without a manual
// refetch.
//
// Stale times:
//   - list / detail  → 30s (GRs change often during receiving)
//
// The list query is scoped to the active branch (read from
// `useBranchStore`) so switching branches automatically shows
// the right warehouse universe, matching the pattern used by
// `usePurchaseOrders`.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  goodsReceivingService,
  type GoodsReceivingCreatePayload,
} from "@/services/goodsReceivingService";
import { createOfflineMutationFn, isOfflineQueued } from "@/lib/offline/useOfflineMutation";
import type { GoodsReceiving, UUID } from "@/types";

// ─── Queries ──────────────────────────────────────────────

export function useGoodsReceiving(id: UUID | undefined) {
  return useQuery({
    queryKey: ["goods-receivings", id],
    queryFn: () => goodsReceivingService.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useGoodsReceivingsByPurchaseOrder(
  purchaseOrderId: UUID | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["goods-receivings", "by-po", purchaseOrderId],
    queryFn: async () => {
      const res = await goodsReceivingService.list({
        purchase_order_id: purchaseOrderId!,
        page_size: 100,
      });
      return res.results ?? [];
    },
    enabled: !!purchaseOrderId && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────

function useInvalidateGR() {
  const qc = useQueryClient();
  return (id?: UUID) => {
    void qc.invalidateQueries({ queryKey: ["goods-receivings"] });
    void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    void qc.invalidateQueries({ queryKey: ["stock-items"] });
    if (id) {
      void qc.invalidateQueries({ queryKey: ["goods-receivings", id] });
    }
  };
}

export function useCreateGoodsReceiving() {
  const invalidate = useInvalidateGR();
  return useMutation({
    mutationFn: createOfflineMutationFn<GoodsReceiving, GoodsReceivingCreatePayload>((payload) => ({
      endpoint: "/warehouse/goods-receiving/",
      method: "POST",
      payload,
      feature: "goods-receiving",
      description: "Create goods receiving",
    })),
    onSuccess: (gr) => {
      if (isOfflineQueued(gr)) return;
      invalidate(gr.id);
    },
  });
}

export function useCompleteGoodsReceiving() {
  const invalidate = useInvalidateGR();
  return useMutation({
    mutationFn: createOfflineMutationFn<GoodsReceiving, UUID>((id) => ({
      endpoint: `/warehouse/goods-receiving/${id}/complete/`,
      method: "POST",
      payload: undefined,
      feature: "goods-receiving",
      description: "Complete goods receiving",
      idempotencyKey: `sm:goods-receiving:complete:${id}`,
    })),
    onSuccess: (gr, id) => {
      if (isOfflineQueued(gr)) return;
      invalidate(gr.id ?? id);
    },
  });
}

export function useDeleteGoodsReceiving() {
  const invalidate = useInvalidateGR();
  return useMutation({
    mutationFn: (id: UUID) => goodsReceivingService.remove(id),
    onSuccess: () => invalidate(),
  });
}
