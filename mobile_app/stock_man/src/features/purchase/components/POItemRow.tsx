// ============================================================
// Stock Man — PO Item Row
//
// One line in a PO's item list. Read-only by default; when
// `editable` is true, the quantity becomes a `NumberStepper`
// and the price becomes a small inline editor (tap to open
// a numeric prompt). The line total is `Amount`-driven, so
// RBAC masking is handled for us.
//
// The row is a stateless display — it never mutates the
// wizard's draft; the parent owns the array and listens to
// the change callbacks.
// ============================================================

import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Package, Trash2 } from "lucide-react-native";
import { Amount } from "@/components/ui/Amount";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useCanViewAmounts } from "@/hooks/usePermission";
import { cn } from "@/utils/cn";
import type { PurchaseOrderItem } from "@/types";

export interface POItemRowProps {
  item: PurchaseOrderItem;
  editable?: boolean;
  onQuantityChange?: (qty: number) => void;
  onPriceChange?: (price: number) => void;
  onRemove?: () => void;
  className?: string;
}

export function POItemRow({
  item,
  editable = false,
  onQuantityChange,
  onPriceChange,
  onRemove,
  className,
}: POItemRowProps) {
  const { t } = useI18n();
  const { qtyWithUnit } = useFormatters();
  const canViewAmounts = useCanViewAmounts();
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState(String(item.unit_price ?? 0));

  const lineTotal = item.line_total ?? (item.quantity ?? 0) * (item.unit_price ?? 0);

  const qtyText = qtyWithUnit(item.quantity ?? 0, item.unit ?? "");

  const commitPrice = () => {
    const parsed = parseFloat(priceDraft.replace(",", "."));
    if (!isNaN(parsed) && parsed >= 0) {
      onPriceChange?.(parsed);
    } else {
      setPriceDraft(String(item.unit_price ?? 0));
    }
    setEditingPrice(false);
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
            {item.stock_item_name ?? t("purchase.items")}
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

      <View className="mt-3 flex-row items-end gap-2">
        {editable && onQuantityChange ? (
          <View className="flex-1">
            <NumberStepper
              value={item.quantity ?? 0}
              onChange={onQuantityChange}
              min={1}
              max={9999}
              label={t("common.quantity")}
            />
          </View>
        ) : (
          <View className="flex-1">
            <Text className="text-caption text-muted-foreground">
              {t("common.quantity")}
            </Text>
            <Text className="text-body font-semibold text-foreground mt-1">
              {qtyText}
            </Text>
          </View>
        )}

        <View className="flex-1">
          <Text className="text-caption text-muted-foreground mb-1">
            {t("common.price")}
          </Text>
          {editable && onPriceChange && canViewAmounts ? (
            editingPrice ? (
              <Input
                value={priceDraft}
                onChangeText={setPriceDraft}
                onBlur={commitPrice}
                keyboardType="decimal-pad"
                autoFocus
                className="text-body"
                containerClassName="mb-0"
              />
            ) : (
              <Pressable
                onPress={() => {
                  setPriceDraft(String(item.unit_price ?? 0));
                  setEditingPrice(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={t("common.price")}
                className="min-h-[48px] rounded-xl border border-input bg-background px-3 justify-center active:bg-muted"
              >
                <Text className="text-body text-foreground">
                  {Number(item.unit_price ?? 0).toFixed(2)}
                </Text>
              </Pressable>
            )
          ) : (
            <Amount
              value={item.unit_price ?? 0}
              className="text-body"
              minimumFractionDigits={2}
              maximumFractionDigits={2}
            />
          )}
        </View>
      </View>

      <View className="mt-2 flex-row items-center justify-end">
        <Text className="text-caption text-muted-foreground mr-2">
          {t("common.total")}:
        </Text>
        <Amount
          value={lineTotal}
          minimumFractionDigits={2}
          maximumFractionDigits={2}
        />
      </View>
    </View>
  );
}

