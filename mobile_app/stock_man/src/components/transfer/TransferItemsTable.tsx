// ============================================================
// Stock Man — Transfer Items Table (detail view)
//
// Read-only tabular list of transfer line items.
// ============================================================

import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/utils/cn";
import type { WarehouseTransferItem } from "@/types";

type ColumnAlign = "left" | "right" | "center";

type ItemTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: ColumnAlign;
  flex?: number;
};

export interface TransferItemsTableProps {
  items: WarehouseTransferItem[];
  className?: string;
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

function renderCell(
  item: WarehouseTransferItem,
  column: ItemTableColumn,
  quantity: (v: number | string) => string
) {
  switch (column.key) {
    case "name":
      return <CellText bold>{item.stock_item_name || "—"}</CellText>;
    case "sku":
      return <CellText mono muted>{item.stock_item_sku || "—"}</CellText>;
    case "unit":
      return <CellText align="center" muted>{item.unit || "—"}</CellText>;
    case "quantity":
      return (
        <CellText align="right" mono bold>
          {item.quantity != null ? quantity(item.quantity) : "—"}
        </CellText>
      );
    case "received":
      return (
        <CellText align="right" mono>
          {item.received_quantity != null && item.received_quantity > 0
            ? quantity(item.received_quantity)
            : "—"}
        </CellText>
      );
    default:
      return null;
  }
}

export function TransferItemsTable({ items, className }: TransferItemsTableProps) {
  const { t } = useI18n();
  const { isTablet, isWide } = useResponsive();
  const { quantity } = useFormatters();

  const columns = useMemo<ItemTableColumn[]>(
    () => [
      { key: "name", label: t("stock.name"), width: 160, flex: 3 },
      { key: "sku", label: t("stock.sku"), width: 96, flex: 2 },
      { key: "unit", label: t("stock.unit"), width: 56, flex: 1, align: "center" },
      {
        key: "quantity",
        label: t("common.quantity"),
        width: 80,
        flex: 1,
        align: "right",
      },
      {
        key: "received",
        label: t("receiving.receivedQty"),
        width: 80,
        flex: 1,
        align: "right",
      },
    ],
    [t]
  );

  const columnStyle = (column: ItemTableColumn) =>
    isTablet
      ? { flex: column.flex ?? 1, minWidth: 0 }
      : { width: column.width, minWidth: column.width };

  const tableMinWidth = useMemo(() => {
    if (isWide) return undefined;
    return columns.reduce((sum, col) => sum + col.width, 0);
  }, [columns, isWide]);

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
              {renderCell(item, column, quantity)}
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

