// ============================================================
// Stock Man — Goods Receiving Items Table (read-only)
//
// Mal kabul / tesellüm detay modalında kalem dökümü.
// POItemsTable ile aynı tablo layout deseni.
// ============================================================

import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { Amount } from "@/components/ui/Amount";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/utils/cn";
import type { GoodsReceiving } from "@/types";

export type ReceivingItem = GoodsReceiving["items"][number];

type ColumnAlign = "left" | "right" | "center";

type ItemTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: ColumnAlign;
  flex?: number;
};

export interface ReceivingItemsTableProps {
  items: ReceivingItem[];
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
  bold = false,
  muted = false,
  success = false,
  danger = false,
  numberOfLines = 1,
}: {
  children: React.ReactNode;
  align?: ColumnAlign;
  bold?: boolean;
  muted?: boolean;
  success?: boolean;
  danger?: boolean;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      className={cn(
        "text-body",
        alignClass[align],
        bold && "font-semibold",
        success && "text-success",
        danger && "text-destructive",
        muted ? "text-muted-foreground" : !success && !danger && "text-foreground"
      )}
    >
      {children}
    </Text>
  );
}

export function ReceivingItemsTable({ items, className }: ReceivingItemsTableProps) {
  const { t } = useI18n();
  const { isTablet, isWide } = useResponsive();
  const { qtyWithUnit } = useFormatters();

  const columns = useMemo<ItemTableColumn[]>(
    () => [
      { key: "name", label: t("receiving.items"), width: 140, flex: 3 },
      {
        key: "expected",
        label: t("receiving.expectedQty"),
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
      {
        key: "rejected",
        label: t("receiving.rejectedQty"),
        width: 80,
        flex: 1,
        align: "right",
      },
      {
        key: "unitPrice",
        label: t("common.price"),
        width: 88,
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

  const renderCell = (item: ReceivingItem, column: ItemTableColumn) => {
    switch (column.key) {
      case "name":
        return (
          <CellText bold numberOfLines={2}>
            {item.stock_item_name || "—"}
          </CellText>
        );
      case "expected":
        return (
          <CellText align="right">
            {qtyWithUnit(item.expected_quantity, item.unit)}
          </CellText>
        );
      case "received":
        return (
          <CellText align="right" success>
            {qtyWithUnit(item.received_quantity, item.unit)}
          </CellText>
        );
      case "rejected":
        return (
          <CellText
            align="right"
            danger={(item.rejected_quantity ?? 0) > 0}
          >
            {qtyWithUnit(item.rejected_quantity ?? 0, item.unit)}
          </CellText>
        );
      case "unitPrice":
        return (
          <Amount
            value={item.unit_price ?? 0}
            minimumFractionDigits={2}
            maximumFractionDigits={2}
            className="text-body text-right"
          />
        );
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
          key={item.id ?? `${item.stock_item}-${index}`}
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

