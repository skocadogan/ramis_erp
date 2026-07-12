// ============================================================
// Stock Man — Expiry Warning Row
//
// One row of the SKT warning list. The row surfaces:
//   - Stock item name (left, bold)
//   - Lot + qty (middle)
//   - Expiry date + days-until (right)
//   - "İşlemler" button → onActionPress (manage_expiry_action)
//   - "İptal/İade" button → onAutoReturnCancelPress (expired + manage_return_cancel)
//
// Background colour is tinted by urgency so the user can scan
// for critical lots at a glance.
// ============================================================

import React from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowRight, Calendar, Hash, RotateCcw } from "lucide-react-native";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { cn } from "@/utils/cn";
import type { ExpiryWarning } from "@/types";

export interface ExpiryWarningRowProps {
  warning: ExpiryWarning;
  showActions?: boolean;
  showAutoReturnCancel?: boolean;
  onActionPress: () => void;
  onAutoReturnCancelPress?: () => void;
}

function severityOf(w: ExpiryWarning): "expired" | "urgent" | "soon" | "ok" {
  if (w.is_expired) return "expired";
  if (w.days_until_expiry < 3) return "urgent";
  if (w.days_until_expiry < 7) return "soon";
  return "ok";
}

const rowStyles: Record<
  "expired" | "urgent" | "soon" | "ok",
  { bg: string; border: string; daysText: string }
> = {
  expired: {
    bg: "bg-destructive/10",
    border: "border-l-destructive",
    daysText: "text-destructive",
  },
  urgent: {
    bg: "bg-warning/15",
    border: "border-l-warning",
    daysText: "text-warning",
  },
  soon: {
    bg: "bg-warning/5",
    border: "border-l-warning/60",
    daysText: "text-warning",
  },
  ok: {
    bg: "bg-card",
    border: "border-l-border",
    daysText: "text-muted-foreground",
  },
};

export function ExpiryWarningRow({
  warning,
  showActions = false,
  showAutoReturnCancel = false,
  onActionPress,
  onAutoReturnCancelPress,
}: ExpiryWarningRowProps) {
  const { t } = useI18n();
  const { date, qtyWithUnit } = useFormatters();
  const severity = severityOf(warning);
  const s = rowStyles[severity];

  const daysLabel = warning.is_expired
    ? t("expiry.expiredDaysAgo", {
        days: Math.abs(warning.days_until_expiry),
      })
    : t("expiry.daysLeft", { days: warning.days_until_expiry });

  return (
    <View
      className={cn(
        "flex-row items-center rounded-xl border border-border border-l-4 px-3 py-3 mb-2",
        s.bg,
        s.border
      )}
      accessibilityLabel={`${warning.stock_item_name}, ${warning.lot_number}, ${daysLabel}`}
    >
      {/* Item name + warehouse */}
      <View className="flex-1 min-w-0">
        <Text className="text-body font-semibold text-foreground" numberOfLines={1}>
          {warning.stock_item_name}
        </Text>
        <Text className="text-caption text-muted-foreground" numberOfLines={1}>
          {warning.warehouse_name}
        </Text>
      </View>

      {/* Lot + qty (middle) */}
      <View className="px-2 items-end min-w-[88px]">
        <View className="flex-row items-center">
          <Hash size={12} color="#64748B" />
          <Text
            className="ml-1 text-caption text-mono text-foreground"
            numberOfLines={1}
          >
            {warning.lot_number}
          </Text>
        </View>
        <Text className="text-caption text-muted-foreground text-mono">
          {qtyWithUnit(warning.quantity, warning.unit ?? "adet")}
        </Text>
      </View>

      {/* Expiry date + days */}
      <View className="px-2 items-end min-w-[88px]">
        <View className="flex-row items-center">
          <Calendar size={12} color="#64748B" />
          <Text className="ml-1 text-caption text-mono text-foreground">
            {date(warning.expiry_date)}
          </Text>
        </View>
        <Text className={cn("text-caption font-semibold", s.daysText)}>
          {daysLabel}
        </Text>
      </View>

      {(showActions || showAutoReturnCancel) ? (
        <View className="ml-2 gap-1.5">
          {showActions ? (
            <Pressable
              onPress={onActionPress}
              accessibilityRole="button"
              accessibilityLabel={t("expiry.recordAction")}
              className="flex-row items-center bg-primary active:bg-primary/90 px-2.5 py-2 rounded-lg"
              hitSlop={4}
            >
              <ArrowRight size={14} color="#FFFFFF" />
              <Text className="ml-1 text-caption font-semibold text-primary-foreground">
                {t("common.actions")}
              </Text>
            </Pressable>
          ) : null}
          {showAutoReturnCancel && onAutoReturnCancelPress ? (
            <Pressable
              onPress={onAutoReturnCancelPress}
              accessibilityRole="button"
              accessibilityLabel={t("expiry.autoReturnCancel")}
              className="flex-row items-center border border-destructive bg-destructive/10 active:bg-destructive/20 px-2.5 py-2 rounded-lg"
              hitSlop={4}
            >
              <RotateCcw size={14} color="#DC2626" />
              <Text
                className="ml-1 text-caption font-semibold text-destructive"
                numberOfLines={1}
              >
                {t("expiry.autoReturnCancel")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

