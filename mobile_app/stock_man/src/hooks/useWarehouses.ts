// ============================================================
// Stock Man — Warehouse hooks
//
// React Query wrappers for the warehouse service. The branch
// id is read from `useBranchStore` so all queries are
// automatically scoped to the active branch.
//
// Stale times:
//   - list / detail / summary → 60s (rarely change in a session)
//   - stock levels             → 30s (closer to real-time)
//
// If a screen needs a custom stale time it should call the
// service directly — these hooks are for the common cases.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { warehouseService } from "@/services/warehouseService";
import { useBranchStore } from "@/store/useBranchStore";

export function useWarehouses(params?: { search?: string }) {
  const branchId = useBranchStore((s) => s.activeBranchId);
  return useQuery({
    queryKey: ["warehouses", branchId, params?.search],
    queryFn: () =>
      warehouseService.list({ ...params, branch_id: branchId ?? undefined }),
    enabled: !!branchId,
    staleTime: 60_000,
  });
}

export function useWarehouseSummary() {
  const branchId = useBranchStore((s) => s.activeBranchId);
  return useQuery({
    queryKey: ["warehouses", branchId, "summary"],
    queryFn: () => warehouseService.summary({ branch_id: branchId ?? undefined }),
    enabled: !!branchId,
    staleTime: 60_000,
  });
}
