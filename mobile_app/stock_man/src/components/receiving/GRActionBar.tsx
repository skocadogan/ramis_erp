// ============================================================
// Stock Man — Goods Receiving Action Bar
//
// Renders the context-sensitive action buttons for a
// GoodsReceiving, driven by `gr.status` + the user's
// permissions:
//
//   PENDING     → "Tamamla" (needs warehouse.manage_goods_receiving)
//                 "Sil"   (soft delete)
//   INSPECTED /
//   ACCEPTED /
//   PARTIALLY_… /
//   REJECTED    → read-only
//
// Every destructive action goes through a confirmation dialog
// so the user has to opt-in. The component is a pure
// presentational view; the parent owns the success / error
// toasts.
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import {
  CheckCircle2,
  PackageCheck,
  Trash2,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDialogStore, dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import { useI18n } from "@/i18n";
import { usePermission } from "@/hooks/usePermission";
import {
  useCompleteGoodsReceiving,
  useDeleteGoodsReceiving,
} from "@/hooks/useGoodsReceivings";
import { isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import type { GoodsReceiving } from "@/types";

export interface GRActionBarProps {
  gr: GoodsReceiving;
  onActionComplete?: (action: "complete" | "delete") => void;
}

export function GRActionBar({ gr, onActionComplete }: GRActionBarProps) {
  const { t } = useI18n();
  const toast = useToast();
  const canManage = usePermission("warehouse.manage_goods_receiving");

  const complete = useCompleteGoodsReceiving();
  const remove = useDeleteGoodsReceiving();

  const isPending = complete.isPending || remove.isPending;

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
  if (gr.status !== "PENDING") {
    return (
      <View className="rounded-xl border border-border bg-muted/40 p-4">
        <View className="flex-row items-center">
          <CheckCircle2 size={18} color="#64748B" />
          <Text className="ml-2 text-caption text-muted-foreground">
            {t("common.success")}
          </Text>
        </View>
      </View>
    );
  }

  const onComplete = () => {
    dialog.confirm(
      t("receiving.actions.complete"),
      `${gr.receiving_number} — ${t("common.confirm")}?`,
      () => {
        complete.mutate(gr.id, {
          onSuccess: (result) => {
            if (isOfflineQueued(result)) {
              showOfflineQueuedToast(toast, t);
              return;
            }
            onActionComplete?.("complete");
          },
          onError: onMutationError,
        });
      }
    );
  };

  const onDelete = () => {
    confirmDestructive(
      t("receiving.actions.deleteTitle"),
      t("receiving.actions.deleteDescription", { number: gr.receiving_number }),
      () => {
        remove.mutate(gr.id, {
          onSuccess: () => onActionComplete?.("delete"),
          onError: onMutationError,
        });
      }
    );
  };

  return (
    <View className="gap-2">
      {canManage ? (
        <Button
          variant="primary"
          onPress={onComplete}
          loading={complete.isPending}
          disabled={isPending && !complete.isPending}
          leftIcon={PackageCheck}
          fullWidth
        >
          {t("receiving.actions.complete")}
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

