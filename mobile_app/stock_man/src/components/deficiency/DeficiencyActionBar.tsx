// ============================================================
// Stock Man — Deficiency Report Action Bar
// ============================================================

import React, { useState } from "react";
import { Text, View } from "react-native";
import {
  Ban,
  CheckCheck,
  ShoppingCart,
  Trash2,
  Truck,
  Wand2,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { SupplierPicker } from "@/features/purchase/components/SupplierPicker";
import { WarehousePicker } from "@/components/transfer/WarehousePicker";
import { useDialogStore, dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import { useI18n } from "@/i18n";
import { usePermission } from "@/hooks/usePermission";
import {
  useApproveDeficiencyReport,
  useCancelDeficiencyReport,
  useCreatePOFromDeficiency,
  useCreateTransferFromDeficiency,
  useAutoFulfillDeficiency,
  useDeleteDeficiencyReport,
} from "@/hooks/useDeficiencyReports";
import type { DeficiencyReport, UUID } from "@/types";

export interface DeficiencyActionBarProps {
  dr: DeficiencyReport;
  onActionComplete?: (
    action:
      | "approve"
      | "cancel"
      | "delete"
      | "create_po"
      | "create_transfer"
      | "auto_fulfill",
    payload?: { purchase_order_id?: string; transfer_id?: string }
  ) => void;
}

export function DeficiencyActionBar({
  dr,
  onActionComplete,
}: DeficiencyActionBarProps) {
  const { t } = useI18n();
  const canManage = usePermission("warehouse.manage_deficiency_report");

  const approve = useApproveDeficiencyReport();
  const cancel = useCancelDeficiencyReport();
  const createPO = useCreatePOFromDeficiency();
  const createTransfer = useCreateTransferFromDeficiency();
  const autoFulfill = useAutoFulfillDeficiency();
  const remove = useDeleteDeficiencyReport();

  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [warehousePickerOpen, setWarehousePickerOpen] = useState(false);
  const [sourceWarehousePickerOpen, setSourceWarehousePickerOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState<UUID | null>(null);

  const isPending =
    approve.isPending ||
    cancel.isPending ||
    createPO.isPending ||
    createTransfer.isPending ||
    autoFulfill.isPending ||
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

  const submitCreatePO = (supplierId: UUID, warehouseId: UUID) => {
    createPO.mutate(
      { id: dr.id, supplier_id: supplierId, warehouse_id: warehouseId },
      {
        onSuccess: (data) =>
          onActionComplete?.("create_po", { purchase_order_id: data.id }),
        onError: onMutationError,
      }
    );
  };

  const submitCreateTransfer = (sourceWarehouseId: UUID) => {
    createTransfer.mutate(
      { id: dr.id, source_warehouse_id: sourceWarehouseId },
      {
        onSuccess: (data) =>
          onActionComplete?.("create_transfer", { transfer_id: data.id }),
        onError: onMutationError,
      }
    );
  };

  if (
    dr.status === "PARTIALLY_COMMITTED" ||
    dr.status === "COMMITTED" ||
    dr.status === "CANCELLED"
  ) {
    return null;
  }

  const onApprove = () => {
    dialog.confirm(
      t("deficiency.actions.approve"),
      `${dr.report_number} — ${t("common.confirm")}?`,
      () => {
        approve.mutate(dr.id, {
          onSuccess: () => onActionComplete?.("approve"),
          onError: onMutationError,
        });
      }
    );
  };

  const onCancel = () => {
    confirmDestructive(
      t("deficiency.actions.cancel"),
      `${dr.report_number} — ${t("common.confirm")}?`,
      () => {
        cancel.mutate(dr.id, {
          onSuccess: () => onActionComplete?.("cancel"),
          onError: onMutationError,
        });
      }
    );
  };

  const onDelete = () => {
    confirmDestructive(
      t("common.delete"),
      `${dr.report_number} — ${t("common.confirm")}?`,
      () => {
        remove.mutate(dr.id, {
          onSuccess: () => onActionComplete?.("delete"),
          onError: onMutationError,
        });
      }
    );
  };

  const onCreatePO = () => {
    setPoSupplierId(null);
    setSupplierPickerOpen(true);
  };

  const onCreateTransfer = () => {
    setSourceWarehousePickerOpen(true);
  };

  const onAutoFulfill = () => {
    confirmDestructive(
      t("deficiency.actions.autoFulfill"),
      `${dr.report_number} — ${t("common.confirm")}?`,
      () => {
        autoFulfill.mutate(dr.id, {
          onSuccess: () => onActionComplete?.("auto_fulfill"),
          onError: onMutationError,
        });
      }
    );
  };

  const pickerModals = (
    <>
      <SupplierPicker
        visible={supplierPickerOpen}
        value={poSupplierId}
        onSelect={(id) => {
          setPoSupplierId(id);
          setSupplierPickerOpen(false);
          setWarehousePickerOpen(true);
        }}
        onClose={() => setSupplierPickerOpen(false)}
      />
      <WarehousePicker
        visible={warehousePickerOpen}
        title={t("deficiency.poModal.targetWarehouse")}
        onSelect={(w) => {
          setWarehousePickerOpen(false);
          if (poSupplierId) {
            dialog.confirm(
              t("deficiency.actions.createPO"),
              dr.report_number,
              () => submitCreatePO(poSupplierId, w.id)
            );
          }
        }}
        onClose={() => setWarehousePickerOpen(false)}
      />
      <WarehousePicker
        visible={sourceWarehousePickerOpen}
        title={t("deficiency.trModal.sourceWarehouse")}
        onSelect={(w) => {
          setSourceWarehousePickerOpen(false);
          dialog.confirm(
            t("deficiency.actions.createTransfer"),
            dr.report_number,
            () => submitCreateTransfer(w.id)
          );
        }}
        onClose={() => setSourceWarehousePickerOpen(false)}
      />
    </>
  );

  if (dr.status === "DRAFT") {
    return (
      <View className="gap-2 mb-3">
        {pickerModals}
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
        ) : (
          <ForbiddenNote t={t} />
        )}
      </View>
    );
  }

  if (dr.status === "PENDING") {
    return (
      <View className="gap-2 mb-3">
        {pickerModals}
        {canManage ? (
          <>
            <Button
              variant="primary"
              onPress={onApprove}
              loading={approve.isPending}
              disabled={isPending && !approve.isPending}
              leftIcon={CheckCheck}
              fullWidth
            >
              {t("deficiency.actions.approve")}
            </Button>
            <Button
              variant="outline"
              onPress={onAutoFulfill}
              loading={autoFulfill.isPending}
              disabled={isPending && !autoFulfill.isPending}
              leftIcon={Wand2}
              fullWidth
            >
              {t("deficiency.actions.autoFulfill")}
            </Button>
            <Button
              variant="destructive"
              onPress={onCancel}
              loading={cancel.isPending}
              disabled={isPending && !cancel.isPending}
              leftIcon={Ban}
              fullWidth
            >
              {t("deficiency.actions.cancel")}
            </Button>
          </>
        ) : (
          <ForbiddenNote t={t} />
        )}
      </View>
    );
  }

  if (dr.status === "APPROVED") {
    return (
      <View className="gap-2 mb-3">
        {pickerModals}
        {canManage ? (
          <>
            <Button
              variant="primary"
              onPress={onCreatePO}
              loading={createPO.isPending}
              disabled={isPending && !createPO.isPending}
              leftIcon={ShoppingCart}
              fullWidth
            >
              {t("deficiency.actions.createPO")}
            </Button>
            <Button
              variant="outline"
              onPress={onCreateTransfer}
              loading={createTransfer.isPending}
              disabled={isPending && !createTransfer.isPending}
              leftIcon={Truck}
              fullWidth
            >
              {t("deficiency.actions.createTransfer")}
            </Button>
            <Button
              variant="ghost"
              onPress={onCancel}
              loading={cancel.isPending}
              disabled={isPending && !cancel.isPending}
              leftIcon={Ban}
              fullWidth
            >
              {t("deficiency.actions.cancel")}
            </Button>
          </>
        ) : (
          <ForbiddenNote t={t} />
        )}
      </View>
    );
  }

  if (dr.status === "ORDERED") {
    return (
      <View className="gap-2 mb-3">
        {pickerModals}
        {canManage ? (
          <Button
            variant="outline"
            onPress={onCreateTransfer}
            loading={createTransfer.isPending}
            disabled={isPending && !createTransfer.isPending}
            leftIcon={Truck}
            fullWidth
          >
            {t("deficiency.actions.createTransfer")}
          </Button>
        ) : (
          <ForbiddenNote t={t} />
        )}
      </View>
    );
  }

  return null;
}

function ForbiddenNote({ t }: { t: (key: string) => string }) {
  return (
    <View className="rounded-xl border border-border bg-muted/40 p-4">
      <Text className="text-caption text-muted-foreground text-center">
        {t("errors.forbidden")}
      </Text>
    </View>
  );
}

