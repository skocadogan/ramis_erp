// ============================================================
// Stock Man — Return / Cancel Detail Sheet
// ============================================================

import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Trash2, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Amount } from "@/components/ui/Amount";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import {
  parseReturnCancelNotesMeta,
  returnCancelDisplayTotal,
  parseMovementMoney,
} from "@/utils/returnCancelDetail";
import { returnCancelReasonLabelKey } from "@/utils/returnCancelReason";
import { cn } from "@/utils/cn";
import type { StockMovement } from "@/types";

export interface ReturnCancelDetailSheetProps {
  row: StockMovement;
  canManage: boolean;
  onClose: () => void;
  onDelete?: (row: StockMovement) => void;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="border-b border-border py-3">
      <Text className="text-caption text-muted-foreground mb-1">{label}</Text>
      <View>{children}</View>
    </View>
  );
}

export function ReturnCancelDetailSheet({
  row,
  canManage,
  onClose,
  onDelete,
}: ReturnCancelDetailSheetProps) {
  const { t } = useI18n();
  const { dateTime, qtyWithUnit } = useFormatters();
  const isReturn = row.movement_type === "RETURN";
  const notesMeta = parseReturnCancelNotesMeta(row.notes);
  const reasonKey = returnCancelReasonLabelKey(row.reference);
  const reasonText = reasonKey ? t(reasonKey) : row.reference || "—";
  const unitCost = parseMovementMoney(row.unit_price);
  const lineTotal = returnCancelDisplayTotal(row);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 justify-end bg-black/60"
        accessibilityLabel="return-cancel-detail-dismiss"
      >
        <Pressable onPress={() => {}} className="bg-card border-t border-border rounded-t-2xl max-h-[88%]">
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <View className="flex-1 min-w-0 pr-2">
              <Text className="text-h3 text-foreground" numberOfLines={1}>
                {t("returnCancel.detailTitle")}
              </Text>
              <Text className="text-caption text-muted-foreground mt-0.5" numberOfLines={1}>
                {row.stock_item_name ?? "—"}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("returnCancel.detailClose")}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
              hitSlop={8}
            >
              <X size={20} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView className="px-4 py-2" keyboardShouldPersistTaps="handled">
            <DetailRow label={t("returnCancel.detailId")}>
              <Text className="text-caption text-mono text-muted-foreground">{row.id}</Text>
            </DetailRow>
            <DetailRow label={t("returnCancel.colDateTime")}>
              <Text className="text-body text-foreground">{dateTime(row.created_at)}</Text>
            </DetailRow>
            <DetailRow label={t("returnCancel.colType")}>
              <View
                className={cn(
                  "self-start rounded-md px-2 py-0.5",
                  isReturn
                    ? "bg-blue-100 dark:bg-blue-950/40"
                    : "bg-amber-100 dark:bg-amber-950/40"
                )}
              >
                <Text
                  className={cn(
                    "text-caption font-semibold",
                    isReturn
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-amber-800 dark:text-amber-200"
                  )}
                >
                  {isReturn
                    ? t("returnCancel.movementTypeReturn")
                    : t("returnCancel.movementTypeCancel")}
                </Text>
              </View>
            </DetailRow>
            <DetailRow label={t("returnCancel.colProduct")}>
              <Text className="text-body font-semibold text-foreground">
                {row.stock_item_name ?? "—"}
              </Text>
              {row.stock_item_sku ? (
                <Text className="text-caption text-mono text-muted-foreground mt-0.5">
                  {row.stock_item_sku}
                </Text>
              ) : null}
            </DetailRow>
            <DetailRow label={t("returnCancel.colWarehouse")}>
              <Text className="text-body text-foreground">{row.warehouse_name ?? "—"}</Text>
            </DetailRow>
            <DetailRow label={t("returnCancel.colQuantity")}>
              <Text className="text-body font-semibold text-destructive">
                {qtyWithUnit(row.quantity, row.unit)}
              </Text>
            </DetailRow>
            <DetailRow label={t("returnCancel.colUnitCost")}>
              <Amount value={unitCost} minimumFractionDigits={2} maximumFractionDigits={2} />
            </DetailRow>
            <DetailRow label={t("returnCancel.colTotal")}>
              <Amount
                value={lineTotal}
                className="text-body font-semibold"
                minimumFractionDigits={2}
                maximumFractionDigits={2}
              />
            </DetailRow>
            <DetailRow label={t("returnCancel.colReason")}>
              <Text className="text-body text-foreground">{reasonText}</Text>
            </DetailRow>
            {notesMeta.purchaseOrder ? (
              <DetailRow label={t("returnCancel.detailPurchaseOrder")}>
                <Text className="text-body text-foreground">{notesMeta.purchaseOrder}</Text>
              </DetailRow>
            ) : null}
            {notesMeta.goodsReceiving ? (
              <DetailRow label={t("returnCancel.detailGoodsReceiving")}>
                <Text className="text-body text-foreground">{notesMeta.goodsReceiving}</Text>
              </DetailRow>
            ) : null}
            <DetailRow label={t("returnCancel.colSupplier")}>
              <Text className="text-body text-foreground">{row.supplier_name || "—"}</Text>
            </DetailRow>
            <DetailRow label={t("returnCancel.detailPerformedBy")}>
              <Text className="text-body text-foreground">{row.performed_by_name || "—"}</Text>
            </DetailRow>
            {notesMeta.userNotes ? (
              <DetailRow label={t("returnCancel.detailUserNotes")}>
                <Text className="text-body text-foreground">{notesMeta.userNotes}</Text>
              </DetailRow>
            ) : null}
            {notesMeta.fullNotes ? (
              <DetailRow label={t("returnCancel.detailFullNotes")}>
                <Text className="text-body text-muted-foreground">{notesMeta.fullNotes}</Text>
              </DetailRow>
            ) : null}
            <View className="h-4" />
          </ScrollView>

          <View className="px-4 py-3 border-t border-border gap-2">
            {canManage && onDelete ? (
              <Button
                variant="destructive"
                onPress={() => onDelete(row)}
                leftIcon={Trash2}
                fullWidth
              >
                {t("returnCancel.delete")}
              </Button>
            ) : null}
            <Button variant="secondary" onPress={onClose} fullWidth>
              {t("returnCancel.detailClose")}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

