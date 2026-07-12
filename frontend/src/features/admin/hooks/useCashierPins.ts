import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import api, { skipInterceptorToast } from "@/lib/api";
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";
import { toastApiError } from "@/lib/operationalToast";

export interface PosTerminal {
  id: string;
  name: string;
  code: string;
}

export interface CashierPinAssignment {
  id: string;
  branch: string;
  user: string;
  username: string;
  pos_terminals: string[];
  pos_terminal_ids: string[];
  pin: string;
}

export function useCashierPins(branchId: string, userId: string) {
  const queryClient = useQueryClient();
  const t = useTranslations("admin");

  // Fetch POS terminals of selected branch
  const posQuery = useQuery<PosTerminal[]>({
    queryKey: ["admin", "pos-terminals", branchId],
    queryFn: async () => {
      const res = await api.get<PosTerminal[] | { results: PosTerminal[] }>("/pos-display/terminals/", {
        params: { branch_id: branchId, page_size: 200 }
      });
      return Array.isArray(res.data) ? res.data : (res.data.results ?? []);
    },
    enabled: !!branchId,
  });

  // Fetch branch users
  const usersQuery = useQuery({
    queryKey: ["admin", "branch-users", branchId],
    queryFn: () => adminApi.getBranchUsers(branchId),
    enabled: !!branchId,
  });

  // Fetch current cashier pin assignment for selected user
  const assignmentQuery = useQuery<CashierPinAssignment | null>({
    queryKey: ["admin", "cashier-pin-assignment", branchId, userId],
    queryFn: async () => {
      const res = await api.get<{ results: CashierPinAssignment[] }>("/shifts/cashier-pins/", {
        params: { branch_id: branchId, user_id: userId }
      });
      const results = res.data.results || [];
      return results.length > 0 ? results[0] : null;
    },
    enabled: !!branchId && !!userId,
  });

  // Create or Update mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: { pos_terminals: string[]; pin: string }) => {
      const current = assignmentQuery.data;
      if (current) {
        // Update
        return api.put(`/shifts/cashier-pins/${current.id}/`, {
          branch: branchId,
          user: userId,
          pos_terminals: payload.pos_terminals,
          pin: payload.pin,
        }, { ...skipInterceptorToast });
      } else {
        // Create
        return api.post("/shifts/cashier-pins/", {
          branch: branchId,
          user: userId,
          pos_terminals: payload.pos_terminals,
          pin: payload.pin,
        }, { ...skipInterceptorToast });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "cashier-pin-assignment", branchId, userId],
      });
      toast.success(t("assignments.cashierPin.toastCashierSaved"));
    },
    onError: (e) => {
      toastApiError(e, t("assignments.common.toastSaveFailed"));
    },
  });

  const posTerminals = posQuery.data ?? [];
  const users = usersQuery.data ?? [];

  // Filter to Kasiyer/Cashier roles
  const cashierUsers = users.filter(u =>
    u.role_names?.some(r =>
      r.toLowerCase() === "kasiyer" || r.toLowerCase() === "cashier"
    )
  );

  return {
    posTerminals,
    cashierUsers,
    assignment: assignmentQuery.data,
    isLoading: posQuery.isLoading || usersQuery.isLoading,
    isAssignmentLoading: assignmentQuery.isLoading,
    isSaving: saveMutation.isPending,
    saveAssignment: saveMutation.mutate,
  };
}
