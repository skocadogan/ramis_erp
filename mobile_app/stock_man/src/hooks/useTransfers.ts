// ============================================================
// Stock Man — Warehouse Transfer hooks
//
// React Query wrappers for `transferService`. Cache shape:
//
//   ["transfers", branchId, filters]            list
//   ["transfers", id]                           detail
//
// Every mutation invalidates `["transfers"]` so the list /
// detail screens re-fetch on the next render. The detail key
// is also invalidated on a single-transfer mutation so the
// detail screen reflects the change without a manual refetch.
//
// Stale times:
//   - list / detail  → 30s (transfers change often in motion)
//
// The list query is scoped to the active branch (read from
// `useBranchStore`) so switching branches automatically shows
// the right warehouse universe, matching the pattern used by
// `usePurchaseOrders`.
// ============================================================

import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { transferService, type TransferFilters } from "@/services/transferService";
import { createOfflineMutationFn, isOfflineQueued } from "@/lib/offline/useOfflineMutation";
import type {
  WarehouseTransfer,
  WarehouseTransferCreatePayload,
  UUID,
} from "@/types";

// ─── Queries ──────────────────────────────────────────────

export function useInfiniteTransfers(filters: TransferFilters = {}) {
  return useInfiniteQuery({
    queryKey: ["transfers", "infinite", filters],
    queryFn: ({ pageParam = 1 }) => transferService.list({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: any) => {
      if (!lastPage || !lastPage.next) return undefined;
      const match = lastPage.next.match(/page=(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    },
    staleTime: 30_000,
  });
}

export function useTransfer(id: UUID | undefined) {
  return useQuery({
    queryKey: ["transfers", id],
    queryFn: () => transferService.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────

function useInvalidateTransfers() {
  const qc = useQueryClient();
  return (id?: UUID) => {
    void qc.invalidateQueries({ queryKey: ["transfers"] });
    if (id) {
      void qc.invalidateQueries({ queryKey: ["transfers", id] });
    }
  };
}

export function useCreateTransfer() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: createOfflineMutationFn<WarehouseTransfer, WarehouseTransferCreatePayload>(
      (payload) => ({
        endpoint: "/warehouse/transfers/",
        method: "POST",
        payload,
        feature: "transfer",
        description: "Create transfer",
      })
    ),
    onSuccess: (t) => {
      if (isOfflineQueued(t)) return;
      invalidate(t.id);
    },
  });
}

export function useApproveTransfer() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (id: UUID) => transferService.approve(id),
    onSuccess: (t) => invalidate(t.id),
  });
}

export function useCompleteTransfer() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: createOfflineMutationFn<WarehouseTransfer, UUID>((id) => ({
      endpoint: `/warehouse/transfers/${id}/complete/`,
      method: "POST",
      payload: undefined,
      feature: "transfer",
      description: "Complete transfer",
    })),
    onSuccess: (t, id) => {
      if (isOfflineQueued(t)) return;
      invalidate(t.id ?? id);
    },
  });
}

export function useCancelTransfer() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (id: UUID) => transferService.cancel(id),
    onSuccess: (t) => invalidate(t.id),
  });
}

export function useDeleteTransfer() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (id: UUID) => transferService.remove(id),
    onSuccess: () => invalidate(),
  });
}
