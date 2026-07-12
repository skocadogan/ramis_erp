// ============================================================
// Stock Man — Deficiency Report hooks
//
// React Query wrappers for `deficiencyReportService`. Cache shape:
//
//   ["deficiency-reports", filters]                                  list
//   ["deficiency-reports", id]                                       detail
//   ["deficiency-reports", id, "stock-availability"]                 availability snapshot
//
// Every mutation invalidates `["deficiency-reports"]` so the list /
// detail screens re-fetch on the next render. The detail key is
// also invalidated on a single-report mutation so the detail screen
// reflects the change without a manual refetch.
//
// Side-effect caches:
//   - `useCreatePOFromDeficiency`    → also invalidates ["purchase-orders"]
//   - `useCreateTransferFromDeficiency` → also invalidates ["transfers"]
//
// Stale times:
//   - list / detail / availability → 30s (reports change often during a shift)
//
// Like stock countings, the cache key is NOT scoped to the active
// branch because DeficiencyReport is kitchen-station-scoped
// (`kitchen_station_id` is the primary filter), and the cross-branch
// `warehouse_id` / `branch_id` filters make a global cache safer.
// ============================================================

import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { deficiencyReportService, type DeficiencyFilters } from "@/services/deficiencyReportService";
import { useBranchStore } from "@/store/useBranchStore";
import type {
  DeficiencyReport,
  DeficiencyReportCreatePayload,
  DeficiencyActionType,
  DeficiencyItemActionExecutePayload,
  Paginated,
  UUID,
} from "@/types";

// ─── Queries ──────────────────────────────────────────────

export function useDeficiencyReports(
  filters: DeficiencyFilters = {},
  options?: { staleTime?: number; enabled?: boolean }
) {
  const branchId = useBranchStore((s) => s.activeBranchId);
  const merged = branchId ? { ...filters, branch_id: filters.branch_id ?? branchId } : filters;
  return useQuery({
    queryKey: ["deficiency-reports", merged],
    queryFn: () => deficiencyReportService.list(merged),
    staleTime: options?.staleTime ?? 30_000,
    enabled: options?.enabled !== false && !!branchId,
  });
}

export function useInfiniteDeficiencyReports(filters: DeficiencyFilters = {}) {
  const branchId = useBranchStore((s) => s.activeBranchId);
  const merged = branchId ? { ...filters, branch_id: filters.branch_id ?? branchId } : filters;
  return useInfiniteQuery({
    queryKey: ["deficiency-reports", "infinite", merged],
    queryFn: ({ pageParam = 1 }) =>
      deficiencyReportService.list({ ...merged, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: Paginated<DeficiencyReport> | undefined) => {
      if (!lastPage?.next) return undefined;
      const match = lastPage.next.match(/page=(\d+)/);
      return match?.[1] ? parseInt(match[1], 10) : undefined;
    },
    staleTime: 30_000,
    enabled: !!branchId,
  });
}

export function useDeficiencyReport(id: UUID | undefined) {
  return useQuery({
    queryKey: ["deficiency-reports", id],
    queryFn: () => deficiencyReportService.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useDeficiencyStockAvailability(id: UUID | undefined) {
  return useQuery({
    queryKey: ["deficiency-reports", id, "stock-availability"],
    queryFn: () => deficiencyReportService.stockAvailability(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────

function useInvalidateDeficiency() {
  const qc = useQueryClient();
  return (id?: UUID) => {
    void qc.invalidateQueries({ queryKey: ["deficiency-reports"] });
    if (id) void qc.invalidateQueries({ queryKey: ["deficiency-reports", id] });
  };
}

export function useCreateDeficiencyReport() {
  const invalidate = useInvalidateDeficiency();
  return useMutation({
    mutationFn: (payload: DeficiencyReportCreatePayload) => deficiencyReportService.create(payload),
    onSuccess: (dr) => invalidate(dr.id),
  });
}

export function useApproveDeficiencyReport() {
  const invalidate = useInvalidateDeficiency();
  return useMutation({ mutationFn: (id: UUID) => deficiencyReportService.approve(id), onSuccess: (dr) => invalidate(dr.id) });
}

export function useCancelDeficiencyReport() {
  const invalidate = useInvalidateDeficiency();
  return useMutation({ mutationFn: (id: UUID) => deficiencyReportService.cancel(id), onSuccess: (dr) => invalidate(dr.id) });
}

export function useCreatePOFromDeficiency() {
  const qc = useQueryClient();
  const invalidate = useInvalidateDeficiency();
  return useMutation({
    mutationFn: ({
      id,
      supplier_id,
      warehouse_id,
    }: {
      id: UUID;
      supplier_id: UUID;
      warehouse_id: UUID;
    }) => deficiencyReportService.createPurchaseOrder(id, { supplier_id, warehouse_id }),
    onSuccess: (_data, { id }) => {
      invalidate(id);
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}

export function useCreateTransferFromDeficiency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      source_warehouse_id,
    }: {
      id: UUID;
      source_warehouse_id: UUID;
    }) => deficiencyReportService.createTransfer(id, { source_warehouse_id }),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ["deficiency-reports"] });
      void qc.invalidateQueries({ queryKey: ["deficiency-reports", id] });
      void qc.invalidateQueries({ queryKey: ["transfers"] });
    },
  });
}

export function useAutoFulfillDeficiency() {
  const invalidate = useInvalidateDeficiency();
  return useMutation({ mutationFn: (id: UUID) => deficiencyReportService.autoFulfill(id), onSuccess: (dr) => invalidate(dr.id) });
}

export function usePreviewItemActions() {
  return useMutation({
    mutationFn: ({
      id,
      items,
    }: {
      id: UUID;
      items: { item_id: UUID; action: DeficiencyActionType }[];
    }) => deficiencyReportService.previewItemActions(id, items),
  });
}

export function useExecuteItemActions() {
  const invalidate = useInvalidateDeficiency();
  return useMutation({
    mutationFn: ({ id, payload }: { id: UUID; payload: DeficiencyItemActionExecutePayload }) =>
      deficiencyReportService.executeItemActions(id, payload),
    onSuccess: (dr) => invalidate(dr.id),
  });
}

export function useDeleteDeficiencyReport() {
  const invalidate = useInvalidateDeficiency();
  return useMutation({ mutationFn: (id: UUID) => deficiencyReportService.remove(id), onSuccess: () => invalidate() });
}

// Re-export the model type so screens can `import type { DeficiencyReport } from "@/hooks"`.
export type { DeficiencyReport };
