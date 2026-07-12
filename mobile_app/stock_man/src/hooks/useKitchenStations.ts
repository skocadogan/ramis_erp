// ============================================================
// Stock Man — Kitchen Station hooks
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { kitchenStationService } from "@/services/kitchenStationService";
import { useBranchStore } from "@/store/useBranchStore";

export function useKitchenStations() {
  const branchId = useBranchStore((s) => s.activeBranchId);
  return useQuery({
    queryKey: ["kitchen-stations", branchId],
    queryFn: () =>
      kitchenStationService.list({ branch_id: branchId ?? undefined }),
    enabled: !!branchId,
    staleTime: 60_000,
  });
}
