// ============================================================
// Stock Man — Transfer Item Row
//
// One line in a WarehouseTransfer's item list. Read-only by
// default; when `editable` is true, the quantity becomes a
// `NumberStepper` and a remove button is shown.
//
// The row is a stateless display — it never mutates the
// parent's draft.
// ============================================================

import React from "react";
import { Pressable, Text, View } from "react-native";
import { Package, Trash2 } from "lucide-react-native";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { cn } from "@/utils/cn";
import type { WarehouseTransferItem } from "@/types";

export interface TransferItemRowProps {
  item: WarehouseTransferItem;
  editable?: boolean;
  onQtyChange?: (qty: number) => void;
  onRemove?: () => void;
  className?: string;
}

export function TransferItemRow({
  item,
  editable = false,
  onQtyChange,
  onRemove,
  className,
}: TransferItemRowProps) {
  const { t } = useI18n();
  const { qtyWithUnit } = useFormatters();

  const qtyText = qtyWithUnit(item.quantity ?? 0, item.unit ?? "");

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
            {item.stock_item_name ?? t("transfer.items")}
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

      <View className="mt-3">
        {editable && onQtyChange ? (
          <NumberStepper
            value={item.quantity ?? 0}
            onChange={onQtyChange}
            min={1}
            max={9999}
            label={t("common.quantity")}
          />
        ) : (
          <View>
            <Text className="text-caption text-muted-foreground">
              {t("common.quantity")}
            </Text>
            <Text className="text-body font-semibold text-foreground mt-1">
              {qtyText}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

