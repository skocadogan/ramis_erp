import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";
import { toastApiError } from "@/lib/operationalToast";

export function useCookAssignments(branchId: string, userId: string) {
  const queryClient = useQueryClient();
  const t = useTranslations("admin");

  const stationsQuery = useQuery({
    queryKey: ["admin", "stations", branchId],
    queryFn: () => adminApi.getStations({ branch_id: branchId }),
    enabled: !!branchId,
  });

  const usersQuery = useQuery({
    queryKey: ["admin", "branch-users", branchId],
    queryFn: () => adminApi.getBranchUsers(branchId),
    enabled: !!branchId,
  });

  const assignmentsQuery = useQuery({
    queryKey: ["admin", "cook-assignments", branchId, userId],
    queryFn: () => adminApi.getCookAssignments(branchId, userId),
    enabled: !!branchId && !!userId,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { station_ids: string[] }) =>
      adminApi.updateCookAssignments(branchId, userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "cook-assignments", branchId, userId],
      });
      toast.success(t("assignments.common.toastCookSaved"));
    },
    onError: (e) => {
      toastApiError(e, t("assignments.common.toastSaveFailed"));
    },
  });

  const stations = stationsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  return {
    stations,
    users,
    assignments: assignmentsQuery.data,
    isLoading: stationsQuery.isLoading || usersQuery.isLoading,
    isAssignmentsLoading: assignmentsQuery.isLoading,
    isUpdating: updateMutation.isPending,
    updateAssignments: updateMutation.mutate,
  };
}
