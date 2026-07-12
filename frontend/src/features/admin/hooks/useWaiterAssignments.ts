import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "../services/adminApi";
import { tablesApi } from "@/features/tables/services/tablesApi";
import { toast } from "sonner";
import { toastApiError } from "@/lib/operationalToast";

export function useWaiterAssignments(branchId: string, userId: string) {
  const queryClient = useQueryClient();
  const t = useTranslations("admin");

  const zonesQuery = useQuery({
    queryKey: ["admin", "zones", branchId],
    queryFn: () => tablesApi.getZones(branchId),
    enabled: !!branchId,
  });

  const tablesQuery = useQuery({
    queryKey: ["admin", "tables", branchId],
    queryFn: () => tablesApi.getAll({ branch_id: branchId }),
    enabled: !!branchId,
  });

  const usersQuery = useQuery({
    queryKey: ["admin", "branch-users", branchId],
    queryFn: () => adminApi.getBranchUsers(branchId),
    enabled: !!branchId,
  });

  const assignmentsQuery = useQuery({
    queryKey: ["admin", "waiter-assignments", branchId, userId],
    queryFn: () => adminApi.getWaiterAssignments(branchId, userId),
    enabled: !!branchId && !!userId,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { zone_ids: string[]; table_ids: string[] }) =>
      adminApi.updateWaiterAssignments(branchId, userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "waiter-assignments", branchId, userId],
      });
      toast.success(t("assignments.common.toastWaiterSaved"));
    },
    onError: (e) => {
      toastApiError(e, t("assignments.common.toastSaveFailed"));
    },
  });

  const zones = zonesQuery.data ?? [];
  const dineZoneIds = new Set(zones.map(z => z.id));
  const tables = tablesQuery.data?.filter(t => dineZoneIds.has(t.zone)) ?? [];
  const users = usersQuery.data ?? [];

  return {
    zones,
    tables,
    users,
    assignments: assignmentsQuery.data,
    isLoading: zonesQuery.isLoading || tablesQuery.isLoading || usersQuery.isLoading,
    isAssignmentsLoading: assignmentsQuery.isLoading,
    isUpdating: updateMutation.isPending,
    updateAssignments: updateMutation.mutate,
  };
}
