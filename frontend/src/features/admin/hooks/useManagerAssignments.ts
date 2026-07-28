import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";
import { toastApiError } from "@/lib/operationalToast";

export function useManagerAssignments(userId: string) {
  const queryClient = useQueryClient();
  const t = useTranslations("admin");

  // All branches for selection
  const branchesQuery = useQuery({
    queryKey: ["admin", "branches"],
    queryFn: () => adminApi.getBranches(),
  });

  // Users for selection (Global users)
  const usersQuery = useQuery({
    queryKey: ["admin", "users", "all"],
    queryFn: () => adminApi.fetchAllUsers(),
  });

  const assignmentsQuery = useQuery({
    queryKey: ["admin", "manager-assignments", userId],
    queryFn: () => adminApi.getManagerAssignments(userId),
    enabled: !!userId,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { branch_ids: string[] }) =>
      adminApi.updateManagerAssignments(userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "manager-assignments", userId],
      });
      // Also invalidate accessible branches for other parts of the app if needed
      toast.success(t("assignments.common.toastManagerSaved"));
    },
    onError: (e) => {
      toastApiError(e, t("assignments.common.toastSaveFailed"));
    },
  });

  const branches = Array.isArray(branchesQuery.data) ? branchesQuery.data : [];
  const users = usersQuery.data ?? [];

  return {
    branches,
    users,
    assignments: assignmentsQuery.data,
    isLoading: branchesQuery.isLoading || usersQuery.isLoading,
    isAssignmentsLoading: assignmentsQuery.isLoading,
    isUpdating: updateMutation.isPending,
    updateAssignments: updateMutation.mutate,
  };
}
