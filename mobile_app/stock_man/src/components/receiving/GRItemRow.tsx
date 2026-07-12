// ============================================================
// Stock Man — Goods Receiving Item Row
//
// One line in a GoodsReceiving item list. Read-only by
// default; when `editable` is true, the received / rejected
// quantities become `NumberStepper`s, and the lot / expiry
// fields become `TextInput`s.
//
// The row is a stateless display — it never mutates the
// parent's draft; the parent owns the array and listens to
// the change callbacks.
// ============================================================

import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Calendar, Hash, Package, Trash2 } from "lucide-react-native";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { Amount } from "@/components/ui/Amount";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { isValidIsoDate, parseIsoDate, toIsoDate } from "@/lib/format/date";
import { cn } from "@/utils/cn";

interface GRItemRowItem {
  id?: string;
  stock_item: string;
  stock_item_name?: string;
  stock_item_sku?: string;
  expected_quantity: number;
  received_quantity: number;
  rejected_quantity?: number;
  unit: string;
  unit_price: number;
  line_total?: number;
  expiry_date?: string | null;
  batch_number?: string;
  notes?: string;
}

export interface GRItemRowProps {
  item: GRItemRowItem;
  editable?: boolean;
  onReceivedChange?: (qty: number) => void;
  onRejectedChange?: (qty: number) => void;
  onPriceChange?: (price: number) => void;
  onLotChange?: (lot: string) => void;
  onExpiryChange?: (iso: string) => void;
  onRemove?: () => void;
  className?: string;
}

function ExpiryDateField({
  value,
  onChange,
  label,
}: {
  value?: string | null;
  onChange: (iso: string) => void;
  label: string;
}) {
  const { t } = useI18n();
  const hasValue = !!value && isValidIsoDate(value);
  const [showPicker, setShowPicker] = useState(hasValue);

  if (!hasValue && !showPicker) {
    return (
      <Pressable
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel={t("common.selectDate")}
        className="flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 min-h-[44px]"
      >
        <Text className="text-caption text-muted-foreground">
          {label} ({t("common.optional")})
        </Text>
        <Calendar size={18} color="#64748B" />
      </Pressable>
    );
  }

  return (
    <View>
      <DatePicker
        label={label}
        value={parseIsoDate(value ?? toIsoDate(new Date()))}
        onChange={(d) => onChange(toIsoDate(d))}
      />
      {hasValue ? (
        <Pressable
          onPress={() => {
            onChange("");
            setShowPicker(false);
          }}
          accessibilityRole="button"
          className="mt-1 self-start px-1 py-0.5"
        >
          <Text className="text-caption text-muted-foreground">{t("common.clear")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function GRItemRow({
  item,
  editable = false,
  onReceivedChange,
  onRejectedChange,
  onPriceChange,
  onLotChange,
  onExpiryChange,
  onRemove,
  className,
}: GRItemRowProps) {
  const { t } = useI18n();
  const { qtyWithUnit } = useFormatters();

  const lineTotal =
    item.line_total ??
    (item.received_quantity ?? 0) * (item.unit_price ?? 0);

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
            {item.stock_item_name ?? t("receiving.items")}
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

      {/* Expected vs received (editable) */}
      <View className="mt-3 flex-row items-end gap-2">
        <View className="flex-1">
          <Text className="text-caption text-muted-foreground mb-1">
            {t("receiving.expectedQty")}
          </Text>
          <Text className="text-body font-semibold text-foreground">
            {qtyWithUnit(item.expected_quantity ?? 0, item.unit ?? "")}
          </Text>
        </View>

        <View className="flex-1">
          {editable && onReceivedChange ? (
            <NumberStepper
              value={item.received_quantity ?? 0}
              onChange={onReceivedChange}
              min={0}
              max={9999}
              label={t("receiving.receivedQty")}
            />
          ) : (
            <>
              <Text className="text-caption text-muted-foreground mb-1">
                {t("receiving.receivedQty")}
              </Text>
              <Text className="text-body font-semibold text-foreground">
                {qtyWithUnit(item.received_quantity ?? 0, item.unit ?? "")}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Rejected + lot */}
      <View className="mt-2 flex-row items-end gap-2">
        <View className="flex-1">
          {editable && onRejectedChange ? (
            <NumberStepper
              value={item.rejected_quantity ?? 0}
              onChange={onRejectedChange}
              min={0}
              max={9999}
              label={t("receiving.rejectedQty")}
            />
          ) : (item.rejected_quantity ?? 0) > 0 ? (
            <>
              <Text className="text-caption text-muted-foreground mb-1">
                {t("receiving.rejectedQty")}
              </Text>
              <Text className="text-body font-semibold text-destructive">
                {qtyWithUnit(item.rejected_quantity ?? 0, item.unit ?? "")}
              </Text>
            </>
          ) : (
            <View>
              <Text className="text-caption text-muted-foreground mb-1">
                {t("receiving.rejectedQty")}
              </Text>
              <Text className="text-body font-semibold text-muted-foreground">
                0
              </Text>
            </View>
          )}
        </View>

        <View className="flex-1">
          {editable && onLotChange ? (
            <Input
              label={t("receiving.lot")}
              value={item.batch_number ?? ""}
              onChangeText={onLotChange}
              placeholder={t("receiving.batch")}
              leftIcon={Hash}
              containerClassName="mb-0"
            />
          ) : item.batch_number ? (
            <>
              <Text className="text-caption text-muted-foreground mb-1">
                {t("receiving.lot")}
              </Text>
              <Text className="text-body font-mono text-foreground">
                {item.batch_number}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Unit price */}
      <View className="mt-2 flex-row items-end gap-2">
        <View className="flex-1">
          <Text className="text-caption text-muted-foreground mb-1">
            {t("common.price")}
          </Text>
          {editable && onPriceChange ? (
            <Input
              value={String(item.unit_price ?? 0)}
              onChangeText={(v) => {
                const n = parseFloat(v);
                if (!isNaN(n) && n >= 0) onPriceChange(n);
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              containerClassName="mb-0"
            />
          ) : (
            <Amount
              value={item.unit_price ?? 0}
              minimumFractionDigits={2}
              maximumFractionDigits={2}
            />
          )}
        </View>
        <View className="flex-1" />
      </View>

      {/* Expiry date */}
      {editable && onExpiryChange ? (
        <View className="mt-2">
          <ExpiryDateField
            label={t("receiving.expiry")}
            value={item.expiry_date}
            onChange={onExpiryChange}
          />
        </View>
      ) : item.expiry_date ? (
        <View className="mt-2 flex-row items-center">
          <Calendar size={12} color="#64748B" />
          <Text className="ml-1 text-caption text-muted-foreground">
            {t("receiving.expiry")}: {item.expiry_date}
          </Text>
        </View>
      ) : null}

      {/* Line total */}
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


