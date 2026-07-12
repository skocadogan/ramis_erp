// ============================================================
// Stock Man — Stock Items Table
//
// Tabular stock list with sticky header, row press → detail,
// and horizontal scroll on narrow screens.
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
import { useRouter } from "expo-router";
import { routes } from "@/navigation/routes";
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/Loading";
import { TableList } from "@/components/ui/TableList";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/utils/cn";
import type { StockItem } from "@/types";

type ColumnAlign = "left" | "right" | "center";

type StockTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: ColumnAlign;
  flex?: number;
};

export interface StockItemsTableProps {
  items: StockItem[];
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Renders above the column header inside the virtualized list. */
  listHeaderComponent?: React.ReactNode;
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

export function StockItemsTable({
  items,
  onEndReached,
  isFetchingNextPage,
  contentContainerStyle,
  listHeaderComponent,
}: StockItemsTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { isWide } = useResponsive();
  const { quantity } = useFormatters();

  const columns = useMemo<StockTableColumn[]>(
    () => [
      { key: "name", label: t("stock.name"), width: 168, flex: 2 },
      { key: "sku", label: t("stock.sku"), width: 96 },
      { key: "category", label: t("stock.category"), width: 120 },
      { key: "unit", label: t("stock.unit"), width: 56, align: "center" },
      {
        key: "quantity",
        label: t("stock.currentQuantity"),
        width: 88,
        align: "right",
      },
      {
        key: "minimum",
        label: t("stock.minimumQuantity"),
        width: 80,
        align: "right",
      },
      { key: "status", label: t("common.status"), width: 96, align: "center" },
    ],
    [t]
  );

  const tableMinWidth = useMemo(() => {
    if (isWide) return undefined;
    return columns.reduce((sum, col) => sum + col.width, 0);
  }, [columns, isWide]);

  const onRowPress = useCallback(
    (item: StockItem) => {
      router.push(routes.stock.detail(item.id));
    },
    [router]
  );

  const renderStatus = useCallback(
    (item: StockItem) => {
      const outOfStock = (item.current_quantity ?? 0) <= 0;
      if (outOfStock) {
        return (
          <Badge variant="destructive" size="sm" label={t("stock.outOfStock")} />
        );
      }
      if (item.is_low_stock) {
        return (
          <Badge variant="warning" size="sm" label={t("stock.lowStockBadge")} />
        );
      }
      return <CellText align="center" muted>—</CellText>;
    },
    [t]
  );

  const renderCell = useCallback(
    (item: StockItem, column: StockTableColumn) => {
      const minQty = item.effective_minimum ?? item.minimum_quantity ?? 0;

      switch (column.key) {
        case "name":
          return <CellText bold>{item.name}</CellText>;
        case "sku":
          return <CellText mono muted>{item.sku || "—"}</CellText>;
        case "category":
          return (
            <CellText muted numberOfLines={2}>
              {item.category_name || "—"}
            </CellText>
          );
        case "unit":
          return <CellText align="center" muted>{item.unit || "—"}</CellText>;
        case "quantity":
          return (
            <CellText align="right" mono bold>
              {item.current_quantity != null ? quantity(item.current_quantity) : "—"}
            </CellText>
          );
        case "minimum":
          return (
            <CellText align="right" mono muted>
              {minQty > 0 ? quantity(minQty) : "—"}
            </CellText>
          );
        case "status":
          return renderStatus(item);
        default:
          return null;
      }
    },
    [quantity, renderStatus]
  );

  const headerRow = useMemo(
    () => (
      <View className="flex-row border-b border-border bg-muted/40">
        {columns.map((column) => (
          <View
            key={column.key}
            style={{
              width: isWide && column.flex ? undefined : column.width,
              flex: isWide ? column.flex ?? 0 : undefined,
              minWidth: column.flex ? column.width : undefined,
            }}
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
    ),
    [columns, isWide]
  );

  const renderRow = useCallback(
    ({ item, index }: { item: StockItem; index: number }) => {
      const isLow = !!item.is_low_stock;
      const outOfStock = (item.current_quantity ?? 0) <= 0;

      return (
        <Pressable
          onPress={() => onRowPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.sku}`}
          className={cn(
            "flex-row border-b border-border active:bg-muted/50",
            index % 2 === 1 && "bg-muted/20",
            isLow && "bg-warning/5",
            outOfStock && "bg-destructive/5"
          )}
          style={{ minHeight: ROW_HEIGHT }}
        >
          {columns.map((column) => (
            <View
              key={column.key}
              style={{
                width: isWide && column.flex ? undefined : column.width,
                flex: isWide ? column.flex ?? 0 : undefined,
                minWidth: column.flex ? column.width : undefined,
              }}
              className="px-2 py-2 justify-center"
            >
              {renderCell(item, column)}
            </View>
          ))}
        </Pressable>
      );
    },
    [columns, isWide, onRowPress, renderCell]
  );

  const keyExtractor = useCallback((item: StockItem) => item.id, []);

  const tableListHeader = useMemo(
    () =>
      listHeaderComponent ? (
        <View>
          {listHeaderComponent}
          {headerRow}
        </View>
      ) : (
        headerRow
      ),
    [listHeaderComponent, headerRow]
  );

  const tableBody = (
    <View
      className="flex-1 rounded-lg border border-border bg-card overflow-hidden"
      style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
    >
      {listHeaderComponent ? null : headerRow}
      <TableList
        data={items}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        nestedScrollEnabled
        contentContainerStyle={contentContainerStyle}
        ListHeaderComponent={listHeaderComponent ? tableListHeader : undefined}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4 items-center border-t border-border">
              <Loading />
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

