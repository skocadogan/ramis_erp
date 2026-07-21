// ============================================================
// Stock Man — Purchase Order hooks
//
// React Query wrappers for `purchaseOrderService`. Cache shape:
//
//   ["purchase-orders", branchId, filters]            list
//   ["purchase-orders", id]                           detail
//   ["purchase-orders", "suggestions", request]       preview
//
// Every mutation invalidates `["purchase-orders"]` so the
// list / detail screens re-fetch on the next render. The
// detail key is also invalidated on a single-PO mutation so
// the detail screen reflects the change without a manual
// refetch.
//
// Stale times:
//   - list / detail       → 30s (POs change often during a session)
//   - suggestion preview  → 60s (depends on weekly consumption, not real-time)
// ============================================================

import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { purchaseOrderService, type PurchaseOrderFilters } from "../services/purchaseOrderService";
import { createOfflineMutationFn, isOfflineQueued } from "@/lib/offline/useOfflineMutation";
import { useBranchStore } from "@/store/useBranchStore";
import type {
  PurchaseOrder,
  PurchaseOrderCreatePayload,
  PurchaseOrderUpdatePayload,
  PurchaseOrderSuggestion,
  PurchaseOrderSuggestionRequest,
  PurchaseOrderSuggestionCommitPayload,
  UUID,
} from "@/types";

// ─── Queries ──────────────────────────────────────────────

export function useInfinitePurchaseOrders(filters: PurchaseOrderFilters = {}) {
  const branchId = useBranchStore((s) => s.activeBranchId);
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);
  const scoped: PurchaseOrderFilters = {
    ...filters,
    warehouse_id: filters.warehouse_id ?? activeWarehouseId ?? undefined,
  };
  return useInfiniteQuery({
    queryKey: ["purchase-orders", "infinite", branchId, scoped],
    queryFn: ({ pageParam = 1 }) => purchaseOrderService.list({ ...scoped, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: any) => {
      if (!lastPage || !lastPage.next) return undefined;
      const match = lastPage.next.match(/page=(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    },
    enabled: !!branchId,
    staleTime: 30_000,
  });
}

export function usePurchaseOrder(id: UUID | undefined) {
  return useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: () => purchaseOrderService.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function usePurchaseOrderSuggestions(
  request: PurchaseOrderSuggestionRequest | null,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["purchase-orders", "suggestions", request],
    queryFn: async () => {
      if (!request?.warehouse_id) return [];
      if (!purchaseOrderService?.suggestPreview) {
        console.warn("purchaseOrderService or suggestPreview is undefined");
        return [];
      }
      return purchaseOrderService.suggestPreview(request);
    },
    enabled: enabled && !!request?.warehouse_id,
    staleTime: 60_000,
    // API bazen paginated {results:[], count:N} döndürebilir; her zaman array'e normalize et.
    select: (data): PurchaseOrderSuggestion[] => {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      // Paginated response shape
      const paginated = data as unknown as { results?: PurchaseOrderSuggestion[] };
      if (Array.isArray(paginated?.results)) return paginated.results;
      return [];
    },
  });
}

// ─── Mutations ────────────────────────────────────────────

function useInvalidatePurchaseOrders() {
  const qc = useQueryClient();
  return (id?: UUID) => {
    void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    if (id) {
      void qc.invalidateQueries({ queryKey: ["purchase-orders", id] });
    }
  };
}

export function useCreatePurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: createOfflineMutationFn<PurchaseOrder, PurchaseOrderCreatePayload>((payload) => ({
      endpoint: "/warehouse/purchase-orders/",
      method: "POST",
      payload,
      feature: "purchase-order",
      description: "Create purchase order",
    })),
    onSuccess: (po) => {
      if (isOfflineQueued(po)) return;
      invalidate(po.id);
    },
  });
}

export function useUpdatePurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: ({ id, payload }: { id: UUID; payload: PurchaseOrderUpdatePayload }) =>
      purchaseOrderService.update(id, payload),
    onSuccess: (po) => invalidate(po.id),
  });
}

export function useDeletePurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (id: UUID) => purchaseOrderService.remove(id),
    onSuccess: () => invalidate(),
  });
}

export function useSubmitPurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: createOfflineMutationFn<PurchaseOrder, UUID>((id) => ({
      endpoint: `/warehouse/purchase-orders/${id}/submit/`,
      method: "POST",
      payload: undefined,
      feature: "purchase-order",
      description: "Submit purchase order",
    })),
    onSuccess: (po, id) => {
      if (isOfflineQueued(po)) return;
      invalidate(po.id ?? id);
    },
  });
}

export function useApprovePurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (id: UUID) => purchaseOrderService.approve(id),
    onSuccess: (po) => invalidate(po.id),
  });
}

export function useMarkOrderedPurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (id: UUID) => purchaseOrderService.markOrdered(id),
    onSuccess: (po) => invalidate(po.id),
  });
}

export function useCancelPurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (id: UUID) => purchaseOrderService.cancel(id),
    onSuccess: (po) => invalidate(po.id),
  });
}

export function useCommitSuggestions() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (payload: PurchaseOrderSuggestionCommitPayload) =>
      purchaseOrderService.commitSuggestions(payload),
    onSuccess: (pos) => {
      invalidate();
      pos.forEach((po) => invalidate(po.id));
    },
  });
}
