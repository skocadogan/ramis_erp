"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { prepApi } from "../services/prepApi";
import { PrepTemplate } from "../types";
import type { PaginatedResponse } from "@/types/user.types";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";

export function usePrepTemplates(branchId?: string, options?: { skipQuery?: boolean }) {
  const t = useTranslations("prep");
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const skipQuery = options?.skipQuery ?? false;

  const query = useQuery({
    queryKey: ["prep-templates", branchId],
    queryFn: () => prepApi.getTemplates({ branch_id: branchId }),
    enabled: !skipQuery && (!!branchId || !!user?.is_superuser),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<PrepTemplate>) => prepApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-templates"] });
      queryClient.invalidateQueries({ queryKey: ["prep-templates-infinite"] });
      toast.success(t("toasts.templates.created"));
    },
    onError: () => {
      toast.error(t("toasts.templates.createError"));
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<PrepTemplate> }) => 
      prepApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-templates"] });
      queryClient.invalidateQueries({ queryKey: ["prep-templates-infinite"] });
      toast.success(t("toasts.templates.updated"));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => prepApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-templates"] });
      queryClient.invalidateQueries({ queryKey: ["prep-templates-infinite"] });
      toast.success(t("toasts.templates.deleted"));
    }
  });

  const templatesData = query.data;
  const templates: PrepTemplate[] = Array.isArray(templatesData) 
    ? templatesData 
    : (templatesData as PaginatedResponse<PrepTemplate> | undefined)?.results || [];

  return {
    templates,
    isLoading: query.isLoading,
    createTemplate: createMutation.mutateAsync,
    updateTemplate: updateMutation.mutateAsync,
    deleteTemplate: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    refresh: query.refetch,
  };
}
