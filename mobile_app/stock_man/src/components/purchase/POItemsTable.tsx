// ============================================================
// Stock Man — PO Items Table (detail view)
//
// Read-only tabular list of purchase order line items.
// ============================================================

import React, { useMemo } from "react";
import { ScrollView, Text, View, TextInput, Pressable } from "react-native";
import { Trash2 } from "lucide-react-native";
import { Amount } from "@/components/ui/Amount";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useCanViewAmounts } from "@/hooks/usePermission";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/utils/cn";
import type { PurchaseOrderItem, UUID } from "@/types";

type ColumnAlign = "left" | "right" | "center";

type ItemTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: ColumnAlign;
  flex?: number;
};

export interface POItemsTableProps {
  items: PurchaseOrderItem[];
  className?: string;
  editable?: boolean;
  onUpdateQuantity?: (stockItemId: UUID, qty: number) => void;
  onUpdateUnitPrice?: (stockItemId: UUID, price: number) => void;
  onRemoveItem?: (stockItemId: UUID) => void;
}

const ROW_HEIGHT = 48;

const alignClass: Record<ColumnAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function CellText({
  children,
  align = "left",
  mono = false,
  bold = false,
  muted = false,
  numberOfLines = 1,
}: {
  children: React.ReactNode;
  align?: ColumnAlign;
  mono?: boolean;
  bold?: boolean;
  muted?: boolean;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      className={cn(
        "text-body",
        alignClass[align],
        mono && "text-mono",
        bold && "font-semibold",
        muted ? "text-muted-foreground" : "text-foreground"
      )}
    >
      {children}
    </Text>
  );
}

export function POItemsTable({
  items,
  className,
  editable = false,
  onUpdateQuantity,
  onUpdateUnitPrice,
  onRemoveItem,
}: POItemsTableProps) {
  const { t } = useI18n();
  const { isTablet, isWide } = useResponsive();
  const { quantity } = useFormatters();
  const canViewAmounts = useCanViewAmounts();

  const columns = useMemo<ItemTableColumn[]>(
    () => {
      const cols: ItemTableColumn[] = [
        { key: "name", label: t("stock.name"), width: 140, flex: 3 },
        { key: "sku", label: t("stock.sku"), width: 88, flex: 2 },
        { key: "unit", label: t("stock.unit"), width: 52, flex: 1, align: "center" },
        {
          key: "quantity",
          label: t("common.quantity"),
          width: 80,
          flex: 1.2,
          align: "right",
        },
        {
          key: "unitPrice",
          label: t("common.price"),
          width: 88,
          flex: 1.2,
          align: "right",
        },
        {
          key: "lineTotal",
          label: t("common.total"),
          width: 88,
          flex: 1.2,
          align: "right",
        },
      ];

      if (editable) {
        cols.push({
          key: "actions",
          label: "",
          width: 48,
          flex: 0.8,
          align: "center",
        });
      } else {
        cols.push({
          key: "received",
          label: t("receiving.receivedQty"),
          width: 72,
          flex: 1,
          align: "right",
        });
      }
      return cols;
    },
    [t, editable]
  );

  const columnStyle = (column: ItemTableColumn) =>
    isTablet
      ? { flex: column.flex ?? 1, minWidth: 0 }
      : { width: column.width, minWidth: column.width };

  const tableMinWidth = useMemo(() => {
    if (isWide) return undefined;
    return columns.reduce((sum, col) => sum + col.width, 0);
  }, [columns, isWide]);

  const renderCell = (item: PurchaseOrderItem, column: ItemTableColumn) => {
    const lineTotal =
      item.line_total ?? (item.quantity ?? 0) * (item.unit_price ?? 0);

    const stockItemId = item.stock_item;

    switch (column.key) {
      case "name":
        return <CellText bold>{item.stock_item_name || "—"}</CellText>;
      case "sku":
        return <CellText mono muted>{item.stock_item_sku || "—"}</CellText>;
      case "unit":
        return <CellText align="center" muted>{item.unit || "—"}</CellText>;
      case "quantity":
        if (editable && stockItemId) {
          return (
            <View className="flex-row justify-end items-center">
              <TextInput
                value={item.quantity != null ? String(item.quantity) : ""}
                onChangeText={(text) => {
                  const val = parseFloat(text);
                  onUpdateQuantity?.(stockItemId, isNaN(val) ? 0 : val);
                }}
                keyboardType="numeric"
                selectTextOnFocus
                className="w-16 h-8 border border-input rounded bg-background px-1 text-right text-body text-foreground"
              />
            </View>
          );
        }
        return (
          <CellText align="right" mono bold>
            {item.quantity != null ? quantity(item.quantity) : "—"}
          </CellText>
        );
      case "unitPrice":
        if (editable && stockItemId && canViewAmounts) {
          return (
            <View className="flex-row justify-end items-center">
              <TextInput
                value={item.unit_price != null ? String(item.unit_price) : ""}
                onChangeText={(text) => {
                  const val = parseFloat(text);
                  onUpdateUnitPrice?.(stockItemId, isNaN(val) ? 0 : val);
                }}
                keyboardType="numeric"
                selectTextOnFocus
                className="w-20 h-8 border border-input rounded bg-background px-1 text-right text-body text-foreground"
              />
            </View>
          );
        }
        return (
          <Amount
            value={item.unit_price ?? 0}
            minimumFractionDigits={2}
            maximumFractionDigits={2}
            className="text-body text-right"
          />
        );
      case "lineTotal":
        return (
          <Amount
            value={lineTotal}
            minimumFractionDigits={2}
            maximumFractionDigits={2}
            className="text-body text-right font-semibold"
          />
        );
      case "received":
        return (
          <CellText align="right" mono>
            {item.received_quantity != null && item.received_quantity > 0
              ? quantity(item.received_quantity)
              : "—"}
          </CellText>
        );
      case "actions":
        if (editable && stockItemId) {
          return (
            <Pressable
              onPress={() => onRemoveItem?.(stockItemId)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove item"
              className="p-1.5 rounded bg-destructive/10 active:bg-destructive/20 items-center justify-center self-center"
            >
              <Trash2 size={16} color="#DC2626" />
            </Pressable>
          );
        }
        return null;
      default:
        return null;
    }
  };

  const headerRow = (
    <View className="flex-row w-full border-b border-border bg-muted/40">
      {columns.map((column) => (
        <View
          key={column.key}
          style={columnStyle(column)}
          className="px-2 py-2.5 justify-center"
        >
          <Text
            numberOfLines={2}
            className={cn(
              "text-caption font-semibold uppercase text-muted-foreground",
              alignClass[column.align ?? "left"]
            )}
          >
            {column.label}
          </Text>
        </View>
      ))}
    </View>
  );

  const bodyRows =
    items.length === 0 ? (
      <View className="py-6 px-3">
        <Text className="text-caption text-muted-foreground text-center">
          {t("purchase.noItems")}
        </Text>
      </View>
    ) : (
      items.map((item, index) => (
        <View
          key={item.id ?? item.stock_item}
          className={cn(
            "flex-row w-full border-b border-border",
            index % 2 === 1 && "bg-muted/20"
          )}
          style={{ minHeight: ROW_HEIGHT }}
        >
          {columns.map((column) => (
            <View
              key={column.key}
              style={columnStyle(column)}
              className="px-2 py-2 justify-center"
            >
              {renderCell(item, column)}
            </View>
          ))}
        </View>
      ))
    );

  const table = (
    <View
      className={cn(
        "w-full rounded-lg border border-border bg-card overflow-hidden",
        className
      )}
      style={tableMinWidth ? { minWidth: tableMinWidth } : { width: "100%" }}
    >
      {headerRow}
      {bodyRows}
    </View>
  );

  if (isWide) {
    return <View className="w-full">{table}</View>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator className="w-full">
      {table}
    </ScrollView>
  );
}

