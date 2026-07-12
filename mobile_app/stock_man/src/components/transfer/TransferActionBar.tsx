// ============================================================
// Stock Man — Transfer Action Bar
//
// Renders the context-sensitive action buttons for a
// WarehouseTransfer, driven by `t.status` + the user's
// permissions:
//
//   DRAFT/PENDING → "Onayla" (needs warehouse.approve_transfer)
//                   DRAFT: "Sil" | PENDING: "İptal Et" (manage)
//   IN_TRANSIT  → "Tamamla"       (needs warehouse.manage_transfer)
//                "İptal Et"
//   COMPLETED   → read-only
//   CANCELLED   → read-only
//
// Special handling:
//   - `complete` is a *stock-moving* action. The backend can
//     return 400 INSUFFICIENT_STOCK when one of the items
//     isn't available in the source warehouse. We catch that
//     here and surface a `dialog.error(...)` with the
//     insufficient item names from the response payload.
//   - Every destructive action goes through a confirmation
//     dialog so the user has to opt-in.
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import {
  Ban,
  CheckCheck,
  Send,
  Trash2,
  Truck,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDialogStore, dialog } from "@/store/useDialogStore";
import { useI18n } from "@/i18n";
import { usePermission } from "@/hooks/usePermission";
import {
  useApproveTransfer,
  useCancelTransfer,
  useCompleteTransfer,
  useDeleteTransfer,
} from "@/hooks/useTransfers";
import { isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import { extractApiError } from "@/utils/apiError";
import type { WarehouseTransfer } from "@/types";

export interface TransferActionBarProps {
  t: WarehouseTransfer;
  onActionComplete?: (
    action:
      | "submit"
      | "approve"
      | "complete"
      | "cancel"
      | "delete"
  ) => void;
}

interface InsufficientStockDetail {
  stock_item_id?: string;
  stock_item_name?: string;
  required?: number;
  available?: number;
  unit?: string;
  [k: string]: unknown;
}

function isInsufficientStockPayload(
  data: unknown
): data is { code?: string; insufficient_items?: InsufficientStockDetail[] } {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (obj.code === "INSUFFICIENT_STOCK") return true;
  return Array.isArray(obj.insufficient_items);
}

export function TransferActionBar({ t, onActionComplete }: TransferActionBarProps) {
  const { t: ti } = useI18n();
  const toast = useToast();
  const canManage = usePermission("warehouse.manage_transfer");
  const canApprove = usePermission("warehouse.approve_transfer");

  const approve = useApproveTransfer();
  const complete = useCompleteTransfer();
  const cancel = useCancelTransfer();
  const remove = useDeleteTransfer();

  const isPending =
    approve.isPending ||
    complete.isPending ||
    cancel.isPending ||
    remove.isPending;

  const onMutationError = (err: unknown) => {
    dialog.error(ti("errors.unknown"), extractApiError(err, ti("errors.unknown")));
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
        { label: ti("common.cancel"), variant: "secondary" },
        { label: ti("common.confirm"), variant: "destructive", onPress: onConfirm },
      ],
    });
  };

  // Terminal states — timeline already shows status; no actions left.
  if (t.status === "COMPLETED" || t.status === "CANCELLED") {
    return null;
  }

  /**
   * Surface 400 INSUFFICIENT_STOCK errors from `complete`
   * (and other stock-moving mutations) as a dialog so the
   * user sees the specific item names instead of a generic
   * toast.
   */
  const onComplete = () => {
    dialog.confirm(
      ti("transfer.actions.complete"),
      `${t.transfer_number} — ${ti("common.confirm")}?`,
      () => {
        complete.mutate(t.id, {
          onSuccess: (result) => {
            if (isOfflineQueued(result)) {
              showOfflineQueuedToast(toast, ti);
              return;
            }
            onActionComplete?.("complete");
          },
          onError: (err: any) => {
            const data = err?.response?.data;
            if (isInsufficientStockPayload(data)) {
              const items = data.insufficient_items ?? [];
              const lines =
                items.length > 0
                  ? items
                      .map((it) => {
                        const name =
                          it.stock_item_name ??
                          it.stock_item_id ??
                          "?";
                        const required =
                          typeof it.required === "number" ? it.required : null;
                        const available =
                          typeof it.available === "number"
                            ? it.available
                            : null;
                        if (required != null && available != null) {
                          return `• ${name}: ${available} / ${required} ${it.unit ?? ""}`;
                        }
                        return `• ${name}`;
                      })
                      .join("\n")
                  : null;
              dialog.error(
                ti("transfer.insufficientStock", { name: "" }).replace(":", "").trim() ||
                  ti("errors.unknown"),
                lines ?? extractApiError(err, ti("errors.unknown"))
              );
              return;
            }
            onMutationError(err);
          },
        });
      }
    );
  };

  const onApprove = () => {
    dialog.confirm(
      ti("transfer.actions.approve"),
      `${t.transfer_number} — ${ti("common.confirm")}?`,
      () => {
        approve.mutate(t.id, {
          onSuccess: () => onActionComplete?.("approve"),
          onError: onMutationError,
        });
      }
    );
  };

  const onCancel = () => {
    confirmDestructive(
      ti("transfer.actions.cancel"),
      `${t.transfer_number} — ${ti("common.confirm")}?`,
      () => {
        cancel.mutate(t.id, {
          onSuccess: () => onActionComplete?.("cancel"),
          onError: onMutationError,
        });
      }
    );
  };

  const onDelete = () => {
    confirmDestructive(
      ti("common.delete"),
      `${t.transfer_number} — ${ti("common.confirm")}?`,
      () => {
        remove.mutate(t.id, {
          onSuccess: () => onActionComplete?.("delete"),
          onError: onMutationError,
        });
      }
    );
  };

  // DRAFT / PENDING — web ile aynı: approve endpoint (→ IN_TRANSIT).
  if (t.status === "DRAFT" || t.status === "PENDING") {
    return (
      <View className="gap-2 mb-3">
        {canApprove ? (
          <Button
            variant="primary"
            onPress={onApprove}
            loading={approve.isPending}
            disabled={isPending && !approve.isPending}
            leftIcon={t.status === "DRAFT" ? Send : CheckCheck}
            fullWidth
          >
            {ti("transfer.actions.approve")}
          </Button>
        ) : null}
        {canManage && t.status === "DRAFT" ? (
          <Button
            variant="destructive"
            onPress={onDelete}
            loading={remove.isPending}
            disabled={isPending && !remove.isPending}
            leftIcon={Trash2}
            fullWidth
          >
            {ti("common.delete")}
          </Button>
        ) : null}
        {canManage && t.status === "PENDING" ? (
          <Button
            variant="destructive"
            onPress={onCancel}
            loading={cancel.isPending}
            disabled={isPending && !cancel.isPending}
            leftIcon={Ban}
            fullWidth
          >
            {ti("transfer.actions.cancel")}
          </Button>
        ) : null}
        {!canApprove && !canManage ? (
          <View className="rounded-xl border border-border bg-muted/40 p-4 mb-3">
            <Text className="text-caption text-muted-foreground text-center">
              {ti("errors.forbidden")}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  // IN_TRANSIT — stock is in motion; user can complete or
  // (rarely) cancel.
  return (
    <View className="gap-2 mb-3">
      {canManage ? (
        <Button
          variant="primary"
          onPress={onComplete}
          loading={complete.isPending}
          disabled={isPending && !complete.isPending}
          leftIcon={Truck}
          fullWidth
        >
          {ti("transfer.actions.complete")}
        </Button>
      ) : null}
      {canManage ? (
        <Button
          variant="destructive"
          onPress={onCancel}
          loading={cancel.isPending}
          disabled={isPending && !cancel.isPending}
          leftIcon={Ban}
          fullWidth
        >
          {ti("transfer.actions.cancel")}
        </Button>
      ) : null}
      {!canManage ? (
        <View className="rounded-xl border border-border bg-muted/40 p-4">
          <Text className="text-caption text-muted-foreground text-center">
            {ti("errors.forbidden")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

