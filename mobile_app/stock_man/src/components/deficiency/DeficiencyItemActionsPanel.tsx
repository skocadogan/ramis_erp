// ============================================================
// Stock Man — Deficiency Item Actions Panel
//
// Web DeficiencyReportDetailModal ile aynı kalem bazlı aksiyon
// akışı: stok uygunluğuna göre öneri + önizle + uygula.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Play, X } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Loading } from "@/components/ui/Loading";
import { SupplierPicker } from "@/features/purchase/components/SupplierPicker";
import { WarehousePicker } from "@/components/transfer/WarehousePicker";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import {
  usePreviewItemActions,
  useExecuteItemActions,
} from "@/hooks/useDeficiencyReports";
import { useToast } from "@/components/ui/Toast";
import { extractApiError } from "@/utils/apiError";
import {
  type DeficiencyAvailabilityRow,
  type DeficiencyItemAction,
  type DeficiencyActionPlanSummary,
  buildInitialItemActions,
  isDeficiencyActionAllowed,
  suggestDeficiencyItemAction,
} from "@/utils/deficiencyItemActions";
import type { DeficiencyReport, UUID } from "@/types";

const ACTION_OPTIONS: DeficiencyItemAction[] = [
  "PURCHASE_ALL",
  "PURCHASE_PARTIAL",
  "FULFILL_STOCK",
  "REJECT",
];

export interface DeficiencyItemActionsPanelProps {
  report: DeficiencyReport;
  availability: DeficiencyAvailabilityRow[];
  isAvailabilityLoading: boolean;
  canManage: boolean;
  onComplete?: () => void;
}

export function DeficiencyItemActionsPanel({
  report,
  availability,
  isAvailabilityLoading,
  canManage,
  onComplete,
}: DeficiencyItemActionsPanelProps) {
  const { t } = useI18n();
  const { qtyWithUnit } = useFormatters();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const previewMut = usePreviewItemActions();
  const executeMut = useExecuteItemActions();
 

  const canProcess =
    canManage &&
    (report.status === "PENDING" || report.status === "APPROVED") &&
    (report.items?.length ?? 0) > 0;

  const itemIds = useMemo(
    () =>
      (report.items ?? [])
        .map((i) => i.id)
        .filter((id): id is UUID => typeof id === "string" && id.length > 0),
    [report.items]
  );

  const [itemActions, setItemActions] = useState<Record<string, DeficiencyItemAction>>({});
  const userTouchedRef = useRef<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionSummary, setActionSummary] = useState<DeficiencyActionPlanSummary | null>(
    null
  );
  const [supplierId, setSupplierId] = useState<UUID | null>(null);
  const [warehouseId, setWarehouseId] = useState<UUID | null>(
    (report.target_warehouse as UUID | undefined) ?? null
  );
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [warehousePickerOpen, setWarehousePickerOpen] = useState(false);

  useEffect(() => {
    userTouchedRef.current = new Set();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemActions(buildInitialItemActions(itemIds, availability));
  }, [report.id, itemIds, availability]);

  useEffect(() => {
    if (!canProcess) return;
    const byId = new Map(availability.map((a) => [a.item_id, a]));
    setItemActions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of itemIds) {
        if (userTouchedRef.current.has(id)) continue;
        const suggested = suggestDeficiencyItemAction(byId.get(id));
        if (next[id] !== suggested) {
          next[id] = suggested;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [availability, itemIds, canProcess]);

  if (!canProcess) return null;

  const availById = new Map(availability.map((a) => [a.item_id, a]));
  const allSelected = itemIds.length > 0 && itemIds.every((id) => itemActions[id]);

  const actionLabel = (action: DeficiencyItemAction) => {
    switch (action) {
      case "PURCHASE_ALL":
        return t("deficiency.actionLabels.purchaseAll");
      case "PURCHASE_PARTIAL":
        return t("deficiency.actionLabels.purchasePartial");
      case "FULFILL_STOCK":
        return t("deficiency.actionLabels.fulfillStock");
      case "REJECT":
        return t("deficiency.actionLabels.reject");
      default:
        return action;
    }
  };

  const onPreview = () => {
    const items = Object.entries(itemActions).map(([item_id, action]) => ({
      item_id: item_id as UUID,
      action,
    }));
    previewMut.mutate(
      { id: report.id, items },
      {
        onSuccess: (summary) => {
          setActionSummary(summary);
          setConfirmOpen(true);
        },
        onError: (err) => {
          toast.error(extractApiError(err, t("deficiency.actionErrors.preview")));
        },
      }
    );
  };

  const onExecute = () => {
    if (!actionSummary) return;
    const items = Object.entries(itemActions).map(([item_id, action]) => ({
      item_id: item_id as UUID,
      action,
    }));
    executeMut.mutate(
      {
        id: report.id,
        payload: {
          items,
          supplier_id: actionSummary.requires_purchase_config
            ? (supplierId ?? undefined)
            : undefined,
          warehouse_id: actionSummary.requires_purchase_config
            ? (warehouseId ?? undefined)
            : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(t("deficiency.actionSuccess.queued"));
          setConfirmOpen(false);
          setActionSummary(null);
          onComplete?.();
        },
        onError: (err) => {
          toast.error(extractApiError(err, t("deficiency.actionErrors.execute")));
        },
      }
    );
  };

  const canConfirm =
    !actionSummary?.requires_purchase_config || (!!supplierId && !!warehouseId);

  return (
    <Card className="mb-3">
      <Text className="text-h3 text-foreground mb-1">
        {t("deficiency.advancedTitle")}
      </Text>
      <Text className="text-caption text-muted-foreground mb-3">
        {t("deficiency.advancedHint")}
      </Text>

      {isAvailabilityLoading ? (
        <Loading label={t("common.loading")} />
      ) : (
        <View className="gap-3">
          {(report.items ?? [])
            .filter((item) => !!item.id)
            .map((item) => {
            const avail = availById.get(item.id!);
            const selected = itemActions[item.id!];
            return (
              <View
                key={item.id}
                className="rounded-xl border border-border p-3 bg-muted/20"
              >
                <Text className="text-body font-semibold text-foreground" numberOfLines={1}>
                  {item.stock_item_name ?? item.stock_item}
                </Text>
                <Text className="text-caption text-muted-foreground mt-0.5">
                  {t("deficiency.currentStock")}:{" "}
                  {avail != null
                    ? qtyWithUnit(avail.total_available, item.unit ?? "")
                    : "—"}{" "}
                  / {qtyWithUnit(item.quantity ?? 0, item.unit ?? "")}
                </Text>
                <View className="flex-row flex-wrap gap-2 mt-2">
                  {ACTION_OPTIONS.map((action) => {
                    const allowed = isDeficiencyActionAllowed(action, avail);
                    return (
                      <Chip
                        key={action}
                        label={actionLabel(action)}
                        selected={selected === action}
                        disabled={!allowed}
                        onPress={() => {
                          userTouchedRef.current.add(item.id!);
                          setItemActions((prev) => ({ ...prev, [item.id!]: action }));
                        }}
                        size="sm"
                        variant={selected === action ? "primary" : "default"}
                      />
                    );
                  })}
                </View>
              </View>
            );
          })}

          <Button
            variant="primary"
            onPress={onPreview}
            loading={previewMut.isPending}
            disabled={!allSelected || previewMut.isPending}
            leftIcon={Play}
            fullWidth
          >
            {t("deficiency.actions.previewActions")}
          </Button>
        </View>
      )}

      <Modal
        visible={confirmOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setConfirmOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => setConfirmOpen(false)}
          />
          <View
            className="bg-card border-t border-border rounded-t-2xl max-h-[85%]"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <View className="flex-row items-center px-4 py-3 border-b border-border">
              <Text className="flex-1 text-h3 text-foreground">
                {t("deficiency.actionConfirm.title")}
              </Text>
              <Pressable onPress={() => setConfirmOpen(false)} hitSlop={8}>
                <X size={20} color="#64748B" />
              </Pressable>
            </View>
            <ScrollView className="px-4 py-3" keyboardShouldPersistTaps="handled">
              {actionSummary ? (
                <>
                  <Text className="text-caption text-muted-foreground mb-3">
                    {t("deficiency.actionConfirm.intro")}
                  </Text>
                  {actionSummary.transfers.length > 0 ? (
                    <View className="mb-3">
                      <Text className="text-caption font-semibold text-muted-foreground uppercase mb-1">
                        {t("deficiency.actionConfirm.transfers")}
                      </Text>
                      {actionSummary.transfers.map((tr, idx) => (
                        <View key={idx} className="rounded-lg border border-border p-2 mb-2">
                          <Text className="text-body font-semibold">{tr.source_warehouse_name}</Text>
                          {tr.items.map((it, i) => (
                            <Text key={i} className="text-caption text-muted-foreground">
                              {it.stock_item_name} —{" "}
                              {qtyWithUnit(it.quantity, it.unit ?? "")}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {actionSummary.purchases.length > 0 ? (
                    <View className="mb-3">
                      <Text className="text-caption font-semibold text-muted-foreground uppercase mb-1">
                        {t("purchase.title")}
                      </Text>
                      {actionSummary.purchases.map((p, i) => (
                        <Text key={i} className="text-caption text-muted-foreground">
                          {p.stock_item_name} — {qtyWithUnit(p.quantity, p.unit ?? "")}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {actionSummary.requires_purchase_config ? (
                    <View className="gap-2 mb-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={() => setSupplierPickerOpen(true)}
                      >
                        {supplierId
                          ? t("deficiency.actionConfirm.supplierSelected")
                          : t("purchase.selectSupplier")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={() => setWarehousePickerOpen(true)}
                      >
                        {warehouseId
                          ? t("deficiency.actionConfirm.warehouseSelected")
                          : t("purchase.selectWarehouse")}
                      </Button>
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
            <View className="px-4 pb-2 flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1 min-w-0"
                onPress={() => setConfirmOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                className="flex-1 min-w-0"
                onPress={onExecute}
                loading={executeMut.isPending}
                disabled={!canConfirm || executeMut.isPending}
              >
                {t("deficiency.actions.executeActions")}
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <SupplierPicker
        visible={supplierPickerOpen}
        value={supplierId}
        onSelect={setSupplierId}
        onClose={() => setSupplierPickerOpen(false)}
      />
      <WarehousePicker
        visible={warehousePickerOpen}
        title={t("purchase.selectWarehouse")}
        onSelect={(w) => setWarehouseId(w.id)}
        onClose={() => setWarehousePickerOpen(false)}
      />
    </Card>
  );
}

