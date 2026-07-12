"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { prepApi } from "../services/prepApi";
import { PrepSmartRule } from "../types";
import { toast } from "sonner";

export function usePrepSmartRules(branchId?: string, options?: { skipQuery?: boolean }) {
  const t = useTranslations("prep");
  const queryClient = useQueryClient();
  const skipQuery = options?.skipQuery ?? false;

  const { data: rules = [], isLoading, refetch } = useQuery<PrepSmartRule[]>({
    queryKey: ["prep-smart-rules", branchId],
    queryFn: () => prepApi.getSmartRules({ branch_id: branchId }),
    enabled: !skipQuery && !!branchId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<PrepSmartRule>) => prepApi.createSmartRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-smart-rules"] });
      queryClient.invalidateQueries({ queryKey: ["prep-smart-rules-infinite"] });
      queryClient.invalidateQueries({ queryKey: ["prep-smart-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["prep-smart-suggestions-infinite"] });
      toast.success(t("toasts.smartRules.created"));
    },
    onError: () => toast.error(t("toasts.smartRules.createError")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PrepSmartRule> }) =>
      prepApi.updateSmartRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-smart-rules"] });
      queryClient.invalidateQueries({ queryKey: ["prep-smart-rules-infinite"] });
      queryClient.invalidateQueries({ queryKey: ["prep-smart-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["prep-smart-suggestions-infinite"] });
      toast.success(t("toasts.smartRules.updated"));
    },
    onError: () => toast.error(t("toasts.smartRules.updateError")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => prepApi.deleteSmartRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-smart-rules"] });
      queryClient.invalidateQueries({ queryKey: ["prep-smart-rules-infinite"] });
      queryClient.invalidateQueries({ queryKey: ["prep-smart-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["prep-smart-suggestions-infinite"] });
      toast.success(t("toasts.smartRules.deleted"));
    },
    onError: () => toast.error(t("toasts.smartRules.deleteError")),
  });

  return {
    rules,
    isLoading,
    refresh: refetch,
    createRule: createMutation.mutateAsync,
    updateRule: updateMutation.mutateAsync,
    deleteRule: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
