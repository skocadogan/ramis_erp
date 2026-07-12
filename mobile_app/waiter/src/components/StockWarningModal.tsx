import React from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import type { PosStationStockIssue } from "../api/posStockCheck";
import { formatQuantityWithUnit, parseStockQty } from "../lib/formatQuantityWithUnit";

type StockWarningModalProps = {
  visible: boolean;
  issues: PosStationStockIssue[];
  canForcePastCritical: boolean;
  onClose: () => void;
  onForceSubmit?: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function StockIssueCard({
  issue,
  t,
}: {
  issue: PosStationStockIssue;
  t: StockWarningModalProps["t"];
}) {
  const isInsufficient =
    issue.code === "INSUFFICIENT_STOCK" ||
    issue.code === "SOLD_OUT" ||
    issue.code === "LIMITED_EXCEEDED";
  const physicalQty = parseStockQty(issue.physical);
  const reservedQty = parseStockQty(issue.reserved);
  const requiredQty = parseStockQty(issue.required);
  const availableQty = parseStockQty(issue.available);
  const isReservedIssue = isInsufficient && physicalQty > 0 && availableQty <= 0;

  return (
    <View className="border-b border-border/80 pb-3 last:border-b-0 last:pb-0 dark:border-border/80">
      <View className="flex-row items-center gap-3">
        <View
          className={`h-2 w-2 rounded-full ${isInsufficient ? "bg-destructive" : "bg-amber-500"}`}
        />
        <View className="min-w-0 flex-1">
          <Text className="font-bold text-foreground">{issue.stock_item_name}</Text>
          <Text className="text-[10px] text-muted-foreground">
            {issue.warehouse_name}
            {issue.station_name ? ` · ${issue.station_name}` : ""}
          </Text>
        </View>
      </View>

      <View className="ml-5 mt-2 rounded-lg bg-secondary/60 p-3">
        <View className="flex-row items-center justify-between gap-4 py-0.5">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("order.stock.physical")}
          </Text>
          <Text className="text-xs font-semibold tabular-nums text-foreground">
            {formatQuantityWithUnit(physicalQty, issue.unit)}
          </Text>
        </View>

        <View className="mt-1 flex-row items-start justify-between gap-4 py-0.5">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("order.stock.reserved")}
          </Text>
          <View className="items-end">
            {reservedQty > 0 ? (
              <Text className="text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                -{formatQuantityWithUnit(reservedQty, issue.unit)}
              </Text>
            ) : null}
            {requiredQty > 0 ? (
              <Text className="text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                -{formatQuantityWithUnit(requiredQty, issue.unit)}
              </Text>
            ) : null}
            {reservedQty === 0 && requiredQty === 0 ? (
              <Text className="text-xs text-muted-foreground">—</Text>
            ) : null}
          </View>
        </View>

        <View className="mt-1 flex-row items-center justify-between gap-4 border-t border-border/60 pt-1.5">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("order.stock.available")}
          </Text>
          <Text
            className={`text-xs font-bold tabular-nums ${
              availableQty <= 0
                ? "text-destructive dark:text-destructive"
                : "text-blue-600 dark:text-blue-400"
            }`}
          >
            {formatQuantityWithUnit(availableQty, issue.unit)}
          </Text>
        </View>
      </View>

      <Text
        className={`ml-5 mt-2 text-[11px] italic ${
          isReservedIssue
            ? "text-amber-700 dark:text-amber-400"
            : isInsufficient
              ? "text-destructive dark:text-destructive"
              : "text-amber-600 dark:text-amber-400"
        }`}
      >
        {isReservedIssue
          ? t("order.stock.reservedDepleted")
          : isInsufficient
            ? t("order.stock.insufficient")
            : t("order.stock.belowCritical")}
      </Text>
    </View>
  );
}

export function StockWarningModal({
  visible,
  issues,
  canForcePastCritical,
  onClose,
  onForceSubmit,
  t,
}: StockWarningModalProps) {
  const title = canForcePastCritical
    ? t("order.stock.criticalTitle")
    : t("order.stock.warningTitle");
  const description = canForcePastCritical
    ? t("order.stock.criticalDesc")
    : t("order.stock.warningDesc");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/60 px-4 py-8">
        <View className="max-h-[92%] w-full max-w-[440px] rounded-2xl border border-border bg-card shadow-2xl">
          <View className="items-center px-5 pb-3 pt-5">
            <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
              <AlertTriangle size={24} color="#D97706" />
            </View>
            <Text className="text-center text-lg font-black text-foreground">{title}</Text>
            <Text className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
              {description}
            </Text>
          </View>

          <ScrollView
            className="mx-4 max-h-[420px] rounded-xl border border-border bg-secondary/30 px-3 py-3"
            showsVerticalScrollIndicator={issues.length > 2}
          >
            {issues.map((issue, idx) => (
              <StockIssueCard key={`${issue.stock_item_name}-${idx}`} issue={issue} t={t} />
            ))}
          </ScrollView>

          <View className="gap-2.5 p-5">
            <Pressable
              onPress={onClose}
              className="h-12 items-center justify-center rounded-xl border border-border bg-secondary active:opacity-80"
            >
              <Text className="text-sm font-bold text-foreground">{t("order.stock.ok")}</Text>
            </Pressable>
            {canForcePastCritical && onForceSubmit ? (
              <Pressable
                onPress={onForceSubmit}
                className="h-12 items-center justify-center rounded-xl bg-amber-600 active:opacity-90"
              >
                <Text className="text-sm font-bold text-white">{t("order.stock.forceStock")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
