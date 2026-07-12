// ============================================================
// Stock Man — Return / Cancel Table
//
// TransfersTable / DeficiencyReportsTable ile aynı layout:
// flex-1 dikey alan, dar ekranda yatay kaydırma.
// ============================================================

import React, { useCallback, useMemo } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { Loading } from "@/components/ui/Loading";
import { TableList } from "@/components/ui/TableList";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useFormatCurrency } from "@/lib/format/currency";
import { useResponsive } from "@/hooks/useResponsive";
import {
  movementLineTotal,
  parseMovementMoney,
  returnCancelReasonLabelKey,
} from "@/utils/returnCancelReason";
import { cn } from "@/utils/cn";
import type { StockMovement } from "@/types";

type ColumnAlign = "left" | "right" | "center";

type ReturnCancelTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: ColumnAlign;
  flex?: number;
};

export interface ReturnCancelTableProps {
  rows: StockMovement[];
  canManage: boolean;
  onSelect?: (row: StockMovement) => void;
  onDelete?: (row: StockMovement) => void;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

const ROW_HEIGHT = 52;

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
  danger = false,
  numberOfLines = 1,
}: {
  children: React.ReactNode;
  align?: ColumnAlign;
  mono?: boolean;
  bold?: boolean;
  muted?: boolean;
  danger?: boolean;
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
        danger && "text-destructive",
        muted ? "text-muted-foreground" : !danger && "text-foreground"
      )}
    >
      {children}
    </Text>
  );
}

export function ReturnCancelTable({
  rows,
  canManage,
  onSelect,
  onDelete,
  onEndReached,
  isFetchingNextPage,
  contentContainerStyle,
}: ReturnCancelTableProps) {
  const { t } = useI18n();
  const { isTablet, isWide } = useResponsive();
  const { dateTime, qtyWithUnit } = useFormatters();
  const formatAmount = useFormatCurrency();

  const columns = useMemo<ReturnCancelTableColumn[]>(() => {
    const base: ReturnCancelTableColumn[] = [
      { key: "date", label: t("returnCancel.colDateTime"), width: isTablet ? 140 : 120 },
      { key: "type", label: t("returnCancel.colType"), width: 72 },
      {
        key: "product",
        label: t("returnCancel.colProduct"),
        width: isTablet ? 160 : 130,
        flex: isTablet ? 1.4 : undefined,
      },
      {
        key: "warehouse",
        label: t("returnCancel.colWarehouse"),
        width: isTablet ? 120 : 100,
        flex: isTablet ? 1 : undefined,
      },
      { key: "qty", label: t("returnCancel.colQuantity"), width: 90, align: "right" },
      { key: "unitCost", label: t("returnCancel.colUnitCost"), width: 108, align: "right" },
      { key: "total", label: t("returnCancel.colTotal"), width: 108, align: "right" },
      {
        key: "reason",
        label: t("returnCancel.colReason"),
        width: isTablet ? 120 : 100,
        flex: isTablet ? 1 : undefined,
      },
      {
        key: "notes",
        label: t("returnCancel.colNotes"),
        width: isTablet ? 120 : 100,
        flex: isTablet ? 1 : undefined,
      },
      {
        key: "supplier",
        label: t("returnCancel.colSupplier"),
        width: isTablet ? 110 : 90,
        flex: isTablet ? 0.9 : undefined,
      },
    ];
    if (canManage) {
      base.push({
        key: "actions",
        label: t("returnCancel.colActions"),
        width: 48,
        align: "center",
      });
    }
    return base;
  }, [canManage, isTablet, t]);

  const tableMinWidth = useMemo(() => {
    if (isWide) return undefined;
    return columns.reduce((sum, col) => sum + col.width, 0);
  }, [columns, isWide]);

  const columnStyle = useCallback(
    (column: ReturnCancelTableColumn) => ({
      width: isWide && column.flex ? undefined : column.width,
      flex: isWide ? column.flex ?? 0 : undefined,
      minWidth: column.flex ? column.width : undefined,
    }),
    [isWide]
  );

  const renderCell = useCallback(
    (row: StockMovement, column: ReturnCancelTableColumn) => {
      const isReturn = row.movement_type === "RETURN";
      const reasonKey = returnCancelReasonLabelKey(row.reference);
      const reasonText = reasonKey
        ? t(reasonKey)
        : row.notes || row.reference || "—";
      const unitCost = parseMovementMoney(row.unit_price);
      const lineTotal = movementLineTotal(row);

      switch (column.key) {
        case "date":
          return (
            <CellText mono muted numberOfLines={1}>
              {dateTime(row.created_at)}
            </CellText>
          );
        case "type":
          return (
            <View
              className={cn(
                "self-start rounded-md px-2 py-0.5",
                isReturn
                  ? "bg-blue-100 dark:bg-blue-950/40"
                  : "bg-amber-100 dark:bg-amber-950/40"
              )}
            >
              <Text
                className={cn(
                  "text-caption font-semibold",
                  isReturn
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-amber-800 dark:text-amber-200"
                )}
              >
                {isReturn
                  ? t("returnCancel.movementTypeReturn")
                  : t("returnCancel.movementTypeCancel")}
              </Text>
            </View>
          );
        case "product":
          return (
            <CellText bold numberOfLines={2}>
              {row.stock_item_name ?? "—"}
            </CellText>
          );
        case "warehouse":
          return (
            <CellText muted numberOfLines={2}>
              {row.warehouse_name ?? "—"}
            </CellText>
          );
        case "qty":
          return (
            <CellText align="right" danger bold>
              {qtyWithUnit(row.quantity, row.unit)}
            </CellText>
          );
        case "unitCost":
          return (
            <CellText align="right" mono numberOfLines={1}>
              {formatAmount(unitCost)}
            </CellText>
          );
        case "total":
          return (
            <CellText align="right" mono bold numberOfLines={1}>
              {formatAmount(lineTotal)}
            </CellText>
          );
        case "reason":
          return (
            <CellText muted numberOfLines={2}>
              {reasonText}
            </CellText>
          );
        case "notes":
          return (
            <CellText muted numberOfLines={2}>
              {row.notes || "—"}
            </CellText>
          );
        case "supplier":
          return (
            <CellText muted numberOfLines={1}>
              {row.supplier_name || "—"}
            </CellText>
          );
        case "actions":
          return (
            <Pressable
              onPress={() => onDelete?.(row)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("returnCancel.delete")}
              className="h-9 w-9 items-center justify-center rounded-md active:bg-destructive/10"
            >
              <Trash2 size={16} color="#DC2626" />
            </Pressable>
          );
        default:
          return null;
      }
    },
    [dateTime, formatAmount, onDelete, qtyWithUnit, t]
  );

  const headerRow = (
    <View className="flex-row border-b border-border bg-muted/40">
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

  const renderRow = useCallback(
    ({ item, index }: { item: StockMovement; index: number }) => (
      <Pressable
        onPress={() => onSelect?.(item)}
        accessibilityRole="button"
        accessibilityLabel={t("returnCancel.viewDetail")}
        className={cn(
          "flex-row border-b border-border bg-card active:opacity-80",
          index % 2 === 1 && "bg-muted/20"
        )}
        style={{ minHeight: ROW_HEIGHT }}
      >
        {columns.map((column) => (
          <View
            key={column.key}
            style={columnStyle(column)}
            className={cn(
              "px-2 py-2 justify-center",
              column.align === "right" && "items-end",
              column.align === "center" && "items-center"
            )}
          >
            {renderCell(item, column)}
          </View>
        ))}
      </Pressable>
    ),
    [columnStyle, columns, onSelect, renderCell, t]
  );

  const keyExtractor = useCallback((item: StockMovement) => item.id, []);

  const tableBody = (
    <View
      className="flex-1 rounded-lg border border-border bg-card overflow-hidden"
      style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
    >
      {headerRow}
      <TableList
        data={rows}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        nestedScrollEnabled
        contentContainerStyle={contentContainerStyle}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4 items-center border-t border-border">
              <Loading />
              <Text className="text-caption text-muted-foreground text-center mt-2">
                {t("returnCancel.loadingMore")}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );

  if (isWide) {
    return <View className="flex-1 px-2">{tableBody}</View>;
  }

  return (
    <View className="flex-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ flexGrow: 1 }}
        className="flex-1"
      >
        <View className="flex-1 px-2" style={{ minWidth: tableMinWidth }}>
          {tableBody}
        </View>
      </ScrollView>
    </View>
  );
}

