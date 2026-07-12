// ============================================================
// Stock Man — Deficiency Report Item Row
//
// One line in a DeficiencyReport item list. Read-only by
// default; when `editable` is true, the quantity becomes a
// `NumberStepper` and an X (Trash2) button appears so the
// user can drop the line from the draft.
//
// Per-line context (current stock, minimum stock, low-stock
// badge) is shown as caption rows so the user can see why
// the item is "deficient" while drafting.
// ============================================================

import React from "react";
import { Pressable, Text, View } from "react-native";
import { AlertTriangle, Package, Trash2 } from "lucide-react-native";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Badge } from "@/components/ui/Badge";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { cn } from "@/utils/cn";
import type { DeficiencyReportItem } from "@/types";

export interface DeficiencyItemRowProps {
  item: DeficiencyReportItem;
  editable?: boolean;
  onQuantityChange?: (qty: number) => void;
  onRemove?: () => void;
  className?: string;
}

export function DeficiencyItemRow({
  item,
  editable = false,
  onQuantityChange,
  onRemove,
  className,
}: DeficiencyItemRowProps) {
  const { t } = useI18n();
  const { qtyWithUnit } = useFormatters();

  const quantity = item.quantity ?? 0;
  const unit = item.unit ?? "";
  const currentStock = item.current_stock;
  const minimumStock = item.minimum_stock;
  const isLow = !!item.is_low_stock;

  return (
    <View
      className={cn(
        "rounded-xl border border-border bg-card p-3 mb-2",
        className
      )}
    >
      <View className="flex-row items-start">
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted mr-3">
          <Package size={18} color="#64748B" />
        </View>
        <View className="flex-1 min-w-0">
          <Text
            className="text-body font-semibold text-foreground"
            numberOfLines={1}
          >
            {item.stock_item_name ?? t("deficiency.items")}
          </Text>
          {item.stock_item_sku ? (
            <Text
              className="text-caption text-mono text-muted-foreground mt-0.5"
              numberOfLines={1}
            >
              {item.stock_item_sku}
            </Text>
          ) : null}
        </View>
        {editable && onRemove ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={t("purchase.removeItem")}
            className="h-9 w-9 items-center justify-center rounded-lg active:bg-destructive/10"
            hitSlop={8}
          >
            <Trash2 size={18} color="#DC2626" />
          </Pressable>
        ) : null}
      </View>

      {/* Quantity (editable) + stock context (read-only) */}
      <View className="mt-3 flex-row items-end gap-2">
        <View className="flex-1">
          {editable && onQuantityChange ? (
            <NumberStepper
              value={quantity}
              onChange={onQuantityChange}
              min={0}
              max={99999}
              label={t("common.quantity")}
            />
          ) : (
            <>
              <Text className="text-caption text-muted-foreground mb-1">
                {t("common.quantity")}
              </Text>
              <Text className="text-body font-semibold text-foreground">
                {qtyWithUnit(quantity, unit)}
              </Text>
            </>
          )}
        </View>

        <View className="flex-1">
          <Text className="text-caption text-muted-foreground mb-1">
            {t("deficiency.currentStock")}
          </Text>
          <Text className="text-body font-semibold text-foreground">
            {currentStock != null ? qtyWithUnit(currentStock, unit) : "—"}
          </Text>
        </View>
      </View>

      {/* Minimum + low-stock badge */}
      <View className="mt-2 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Text className="text-caption text-muted-foreground mr-1">
            {t("deficiency.minimumStock")}:
          </Text>
          <Text className="text-caption text-foreground font-semibold">
            {minimumStock != null ? qtyWithUnit(minimumStock, unit) : "—"}
          </Text>
        </View>
        {isLow ? (
          <Badge
            variant="warning"
            size="sm"
            label={t("deficiency.isLow")}
            icon={AlertTriangle}
          />
        ) : null}
      </View>
    </View>
  );
}

