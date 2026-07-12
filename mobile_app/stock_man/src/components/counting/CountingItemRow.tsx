// ============================================================
// Stock Man — Stock Counting Item Row
//
// One line in a StockCounting item list. Read-only by
// default; when `editable` is true, the counted_quantity
// becomes a `NumberStepper` so the user can enter the
// physical count. The system_quantity is always shown
// read-only (it's the "what the system says there is"
// baseline; users can only edit the `counted` field).
//
// The row is a stateless display — it never mutates the
// parent's draft; the parent owns the array and listens
// to the change callbacks. The `difference` is auto-
// calculated as `counted - system` and coloured
//   green if  == 0 (no variance)
//   red   if  != 0 (variance needs reconciliation)
// with a sign on the value (e.g. "+3" or "-1.5").
// ============================================================

import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { Package } from "lucide-react-native";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { cn } from "@/utils/cn";
import type { StockCountingItem } from "@/types";

export interface CountingItemRowProps {
  item: StockCountingItem;
  editable?: boolean;
  onCountedChange?: (qty: number) => void;
  className?: string;
}

export function CountingItemRow({
  item,
  editable = false,
  onCountedChange,
  className,
}: CountingItemRowProps) {
  const { t } = useI18n();
  const { qtyWithUnit } = useFormatters();

  const systemQty = item.system_quantity ?? 0;
  const countedQty = item.counted_quantity ?? 0;
  const difference = useMemo(
    () => countedQty - systemQty,
    [countedQty, systemQty]
  );
  const isMatch = difference === 0;

  const formatSigned = (n: number): string => {
    if (n === 0) return "0";
    if (n > 0) return `+${n}`;
    return String(n);
  };

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
            {item.stock_item_name ?? t("counting.items")}
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
      </View>

      <View className="mt-3 flex-row items-end gap-2">
        <View className="flex-1">
          <Text className="text-caption text-muted-foreground mb-1">
            {t("counting.systemQty")}
          </Text>
          <Text className="text-body font-semibold text-foreground">
            {qtyWithUnit(systemQty, item.unit ?? "")}
          </Text>
        </View>

        <View className="flex-1">
          {editable && onCountedChange ? (
            <NumberStepper
              value={countedQty}
              onChange={onCountedChange}
              min={0}
              max={99999}
              label={t("counting.countedQty")}
            />
          ) : (
            <>
              <Text className="text-caption text-muted-foreground mb-1">
                {t("counting.countedQty")}
              </Text>
              <Text className="text-body font-semibold text-foreground">
                {qtyWithUnit(countedQty, item.unit ?? "")}
              </Text>
            </>
          )}
        </View>
      </View>

      <View className="mt-2 flex-row items-center justify-end">
        <Text className="text-caption text-muted-foreground mr-2">
          {t("counting.difference")}:
        </Text>
        <Text
          className={cn(
            "text-body font-bold",
            isMatch ? "text-success" : "text-destructive"
          )}
        >
          {formatSigned(difference)} {item.unit ?? ""}
        </Text>
      </View>
    </View>
  );
}

