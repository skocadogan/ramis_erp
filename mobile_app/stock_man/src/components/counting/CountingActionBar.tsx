// ============================================================
// Stock Man — Stock Counting Action Bar
//
// Renders the context-sensitive action buttons for a
// StockCounting, driven by `counting.status` + the user's
// permissions:
//
//   DRAFT        → "Sayımı Başlat" (start)
//                  "Sil"            (manage_stock_counting)
//   IN_PROGRESS  → "Sayımı Tamamla"  (finish, manage_stock_counting)
//                  "Kalemleri Güncelle" (bulk save via update_items,
//                  opens a modal in the parent to confirm a save)
//   COMPLETED    → "Onayla"          (approve, approve_stock_counting)
//                  "Sil"            (manage_stock_counting)
//   APPROVED     → read-only
//
// Every destructive action goes through `dialog.confirm()` /
// `useDialogStore.getState().show()` so the user has to
// opt-in. The component is a pure presentational view;
// the parent owns the success / error toasts and the modal
// for the bulk-save flow.
//
// "Kalemleri Güncelle" is stubbed as a callback in this bar —
// the actual modal lives on the detail screen because it
// needs the working draft of counted items.
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import {
  CheckCheck,
  CheckCircle2,
  ClipboardEdit,
  Play,
  Trash2,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDialogStore, dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import { useI18n } from "@/i18n";
import { usePermission } from "@/hooks/usePermission";
import {
  useStartStockCounting,
  useFinishStockCounting,
  useApproveStockCounting,
  useDeleteStockCounting,
} from "@/hooks/useStockCountings";
import { isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import type { StockCounting } from "@/types";

export interface CountingActionBarProps {
  counting: StockCounting;
  /**
   * Bulk-save callback. Triggered from the IN_PROGRESS state
   * so the parent can show a confirmation dialog + fire
   * `useUpdateCountingItems` with the current working draft.
   * Optional because not every host needs it (e.g. read-only
   * detail view in a future context).
   */
  onBulkSave?: () => void;
  onActionComplete?: (
    action: "start" | "finish" | "approve" | "delete" | "bulk_save"
  ) => void;
}

export function CountingActionBar({
  counting,
  onBulkSave,
  onActionComplete,
}: CountingActionBarProps) {
  const { t } = useI18n();
  const toast = useToast();
  const canManage = usePermission("warehouse.manage_stock_counting");
  const canApprove = usePermission("warehouse.approve_stock_counting");

  const start = useStartStockCounting();
  const finish = useFinishStockCounting();
  const approve = useApproveStockCounting();
  const remove = useDeleteStockCounting();

  const isPending =
    start.isPending ||
    finish.isPending ||
    approve.isPending ||
    remove.isPending;

  const onMutationError = (err: unknown) => {
    dialog.error(t("errors.unknown"), extractApiError(err, t("errors.unknown")));
  };

  const confirmDestructive = (
    title: string,
    description: string,
    onConfirm: () => void
  ) => {
    useDialogStore.getState().show({
      title,
      description,
      iconVariant: "confirm",
      actions: [
        { label: t("common.cancel"), variant: "secondary" },
        { label: t("common.confirm"), variant: "destructive", onPress: onConfirm },
      ],
    });
  };

  // Read-only states
  if (counting.status === "APPROVED") {
    return (
      <View className="rounded-xl border border-border bg-muted/40 p-4">
        <View className="flex-row items-center">
          <CheckCircle2 size={18} color="#059669" />
          <Text className="ml-2 text-caption text-muted-foreground">
            {t("counting.statusLabels.approved")}
          </Text>
        </View>
      </View>
    );
  }

  const onStart = () => {
    dialog.confirm(
      t("counting.actions.start"),
      `${counting.counting_number} — ${t("common.confirm")}?`,
      () => {
        start.mutate(counting.id, {
          onSuccess: () => onActionComplete?.("start"),
          onError: onMutationError,
        });
      }
    );
  };

  const onFinish = () => {
    dialog.confirm(
      t("counting.actions.finish"),
      `${counting.counting_number} — ${t("common.confirm")}?`,
      () => {
        finish.mutate(counting.id, {
          onSuccess: (result) => {
            if (isOfflineQueued(result)) {
              showOfflineQueuedToast(toast, t);
              return;
            }
            onActionComplete?.("finish");
          },
          onError: onMutationError,
        });
      }
    );
  };

  const onApprove = () => {
    dialog.confirm(
      t("counting.actions.approve"),
      `${counting.counting_number} — ${t("common.confirm")}?`,
      () => {
        approve.mutate(counting.id, {
          onSuccess: () => onActionComplete?.("approve"),
          onError: onMutationError,
        });
      }
    );
  };

  const onDelete = () => {
    confirmDestructive(
      t("common.delete"),
      `${counting.counting_number} — ${t("common.confirm")}?`,
      () => {
        remove.mutate(counting.id, {
          onSuccess: () => onActionComplete?.("delete"),
          onError: onMutationError,
        });
      }
    );
  };

  if (counting.status === "DRAFT") {
    return (
      <View className="gap-2">
        {canManage ? (
          <Button
            variant="primary"
            onPress={onStart}
            loading={start.isPending}
            disabled={isPending && !start.isPending}
            leftIcon={Play}
            fullWidth
          >
            {t("counting.actions.start")}
          </Button>
        ) : null}
        {canManage ? (
          <Button
            variant="destructive"
            onPress={onDelete}
            loading={remove.isPending}
            disabled={isPending && !remove.isPending}
            leftIcon={Trash2}
            fullWidth
          >
            {t("common.delete")}
          </Button>
        ) : null}
        {!canManage ? (
          <View className="rounded-xl border border-border bg-muted/40 p-4">
            <Text className="text-caption text-muted-foreground text-center">
              {t("errors.forbidden")}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (counting.status === "IN_PROGRESS") {
    return (
      <View className="gap-2">
        {canManage && onBulkSave ? (
          <Button
            variant="outline"
            onPress={onBulkSave}
            leftIcon={ClipboardEdit}
            fullWidth
          >
            {t("common.save")}
          </Button>
        ) : null}
        {canManage ? (
          <Button
            variant="primary"
            onPress={onFinish}
            loading={finish.isPending}
            disabled={isPending && !finish.isPending}
            leftIcon={CheckCheck}
            fullWidth
          >
            {t("counting.actions.finish")}
          </Button>
        ) : null}
        {!canManage ? (
          <View className="rounded-xl border border-border bg-muted/40 p-4">
            <Text className="text-caption text-muted-foreground text-center">
              {t("errors.forbidden")}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (counting.status === "COMPLETED") {
    return (
      <View className="gap-2">
        {canApprove ? (
          <Button
            variant="primary"
            onPress={onApprove}
            loading={approve.isPending}
            disabled={isPending && !approve.isPending}
            leftIcon={CheckCheck}
            fullWidth
          >
            {t("counting.actions.approve")}
          </Button>
        ) : null}
        {canManage ? (
          <Button
            variant="destructive"
            onPress={onDelete}
            loading={remove.isPending}
            disabled={isPending && !remove.isPending}
            leftIcon={Trash2}
            fullWidth
          >
            {t("common.delete")}
          </Button>
        ) : null}
        {!canApprove && !canManage ? (
          <View className="rounded-xl border border-border bg-muted/40 p-4">
            <Text className="text-caption text-muted-foreground text-center">
              {t("errors.forbidden")}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return null;
}

