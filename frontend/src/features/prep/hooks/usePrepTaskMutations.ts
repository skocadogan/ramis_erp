"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { prepApi } from "../services/prepApi";
import { PrepStatus, PrepTask } from "../types";
import { toast } from "sonner";
import { toastApiError } from "@/lib/operationalToast";

function invalidatePrepTasks(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["prep-tasks"] });
  void queryClient.invalidateQueries({ queryKey: ["prep-tasks-infinite"] });
  void queryClient.invalidateQueries({ queryKey: ["prep-task-count"] });
}

export function usePrepTaskMutations() {
  const t = useTranslations("prep");
  const queryClient = useQueryClient();
  const [progressRecordingTaskId, setProgressRecordingTaskId] = useState<string | null>(null);

  const updateStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: PrepStatus }) =>
      prepApi.updateStatus(taskId, status),
    onSuccess: () => {
      invalidatePrepTasks(queryClient);
      toast.success(t("toasts.tasks.statusUpdated"));
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({ taskId, qty }: { taskId: string; qty?: number }) =>
      prepApi.completeTask(taskId, qty),
    onSuccess: () => {
      invalidatePrepTasks(queryClient);
      toast.success(t("toasts.tasks.completed"));
    },
  });

  const recordProgressMutation = useMutation({
    mutationFn: ({ taskId, qty }: { taskId: string; qty: number }) =>
      prepApi.recordProgress(taskId, qty),
    onMutate: ({ taskId }) => setProgressRecordingTaskId(taskId),
    onSettled: () => setProgressRecordingTaskId(null),
    onSuccess: () => {
      invalidatePrepTasks(queryClient);
    },
    onError: (err: unknown) => {
      toastApiError(err, t("toasts.tasks.progressError"));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<PrepTask>) => prepApi.createTask(data),
    onSuccess: () => {
      invalidatePrepTasks(queryClient);
      toast.success(t("toasts.tasks.created"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => prepApi.deleteTask(taskId),
    onSuccess: () => {
      invalidatePrepTasks(queryClient);
      toast.success(t("toasts.tasks.deleted"));
    },
  });

  return {
    updateStatus: updateStatusMutation.mutate,
    completeTask: completeMutation.mutate,
    recordProgress: recordProgressMutation.mutate,
    progressRecordingTaskId,
    createTask: createMutation.mutate,
    deleteTask: deleteMutation.mutate,
  };
}
