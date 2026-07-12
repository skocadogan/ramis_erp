// ============================================================
// Stock Man — PO Action Bar
//
// Renders the context-sensitive action buttons for a PO,
// driven by `po.status` + the user's permissions:
//
//   DRAFT        → "Onaya Gönder", "Sil"
//   PENDING      → "Onayla"     (needs warehouse.approve_purchase_order)
//                  "İptal"
//   APPROVED     → "Sipariş Edildi İşaretle"  (needs warehouse.place_purchase_order)
//                  "İptal"
//   ORDERED / PARTIALLY_RECEIVED → create goods receiving
//   RECEIVED     → read-only
//   CANCELLED    → read-only
//
// Every destructive action goes through `dialog.confirm()`
// so the user has to opt-in. The component is a pure
// presentational view; the parent owns the success / error
// toasts.
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import {
  Ban,
  CheckCheck,
  CheckCircle2,
  PackageCheck,
  Send,
  Trash2,
  Truck,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDialogStore, dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import { useI18n } from "@/i18n";
import { usePermission } from "@/hooks/usePermission";
import {
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
  useDeletePurchaseOrder,
  useMarkOrderedPurchaseOrder,
  useSubmitPurchaseOrder,
} from "../hooks/usePurchaseOrders";
import { isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import type { PurchaseOrder } from "@/types";

export interface POActionBarProps {
  po: PurchaseOrder;
  onActionComplete?: (action: "submit" | "approve" | "mark_ordered" | "cancel" | "delete") => void;
  onReceive?: () => void;
}

export function POActionBar({ po, onActionComplete, onReceive }: POActionBarProps) {
  const { t } = useI18n();
  const toast = useToast();
  const canManage = usePermission("warehouse.manage_purchase_order");
  const canApprove = usePermission("warehouse.approve_purchase_order");
  const canPlace = usePermission("warehouse.place_purchase_order");
  const canReceive = usePermission("warehouse.manage_goods_receiving");

  const submit = useSubmitPurchaseOrder();
  const approve = useApprovePurchaseOrder();
  const markOrdered = useMarkOrderedPurchaseOrder();
  const cancel = useCancelPurchaseOrder();
  const remove = useDeletePurchaseOrder();

  const isPending =
    submit.isPending ||
    approve.isPending ||
    markOrdered.isPending ||
    cancel.isPending ||
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

  // ORDERED / PARTIALLY_RECEIVED → additional goods receiving allowed
  if (po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED") {
    return (
      <View className="gap-2">
        {po.status === "PARTIALLY_RECEIVED" ? (
          <View className="rounded-xl border border-border bg-muted/40 p-4">
            <View className="flex-row items-center">
              <PackageCheck size={18} color="#1E40AF" />
              <Text className="ml-2 text-caption text-foreground font-medium">
                {t("purchase.statusLabels.partiallyReceived")}
              </Text>
            </View>
          </View>
        ) : null}
        {canReceive ? (
          <Button
            variant="primary"
            onPress={onReceive ?? (() => {})}
            disabled={!onReceive}
            leftIcon={Truck}
            fullWidth
          >
            {t("purchase.actions.createReceiving")}
          </Button>
        ) : (
          <View className="rounded-xl border border-border bg-muted/40 p-4">
            <Text className="text-caption text-muted-foreground text-center">
              {t("errors.forbidden")}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Read-only terminal states (RECEIVED, CANCELLED)
  if (po.status === "RECEIVED" || po.status === "CANCELLED") {
    return (
      <View className="rounded-xl border border-border bg-muted/40 p-4">
        <View className="flex-row items-center">
          <CheckCircle2 size={18} color="#64748B" />
          <Text className="ml-2 text-caption text-muted-foreground">
            {po.status === "CANCELLED"
              ? t("purchase.statusLabels.cancelled")
              : t("purchase.statusLabels.received")}
          </Text>
        </View>
      </View>
    );
  }

  const onSubmit = () => {
    dialog.confirm(
      t("purchase.actions.submit"),
      `${po.order_number} — ${t("common.confirm")}?`,
      () => {
        submit.mutate(po.id, {
          onSuccess: (result) => {
            if (isOfflineQueued(result)) {
              showOfflineQueuedToast(toast, t);
              return;
            }
            onActionComplete?.("submit");
          },
          onError: onMutationError,
        });
      }
    );
  };

  const onApprove = () => {
    dialog.confirm(
      t("purchase.actions.approve"),
      `${po.order_number} — ${t("common.confirm")}?`,
      () => {
        approve.mutate(po.id, {
          onSuccess: () => onActionComplete?.("approve"),
          onError: onMutationError,
        });
      }
    );
  };

  const onMarkOrdered = () => {
    dialog.confirm(
      t("purchase.actions.markOrdered"),
      `${po.order_number} — ${t("common.confirm")}?`,
      () => {
        markOrdered.mutate(po.id, {
          onSuccess: () => onActionComplete?.("mark_ordered"),
          onError: onMutationError,
        });
      }
    );
  };

  const onCancel = () => {
    confirmDestructive(
      t("purchase.actions.cancel"),
      `${po.order_number} — ${t("common.confirm")}?`,
      () => {
        cancel.mutate(po.id, {
          onSuccess: () => onActionComplete?.("cancel"),
          onError: onMutationError,
        });
      }
    );
  };

  const onDelete = () => {
    confirmDestructive(
      t("common.delete"),
      `${po.order_number} — ${t("common.confirm")}?`,
      () => {
        remove.mutate(po.id, {
          onSuccess: () => onActionComplete?.("delete"),
          onError: onMutationError,
        });
      }
    );
  };

  if (po.status === "DRAFT") {
    return (
      <View className="gap-2">
        {canManage ? (
          <Button
            variant="primary"
            onPress={onSubmit}
            loading={submit.isPending}
            disabled={isPending && !submit.isPending}
            leftIcon={Send}
            fullWidth
          >
            {t("purchase.actions.submit")}
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

  if (po.status === "PENDING") {
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
            {t("purchase.actions.approve")}
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
            {t("purchase.actions.cancel")}
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

  if (po.status === "APPROVED") {
    return (
      <View className="gap-2">
        {canPlace ? (
          <Button
            variant="primary"
            onPress={onMarkOrdered}
            loading={markOrdered.isPending}
            disabled={isPending && !markOrdered.isPending}
            leftIcon={PackageCheck}
            fullWidth
          >
            {t("purchase.actions.markOrdered")}
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
            {t("purchase.actions.cancel")}
          </Button>
        ) : null}
        {!canPlace && !canManage ? (
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

