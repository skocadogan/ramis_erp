// ============================================================
// Stock Man — Purchase Orders Table
//
// Tabular PO list with sticky header, row press → detail,
// and horizontal scroll on narrow screens.
// ============================================================

import React, { useCallback, useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { routes } from "@/navigation/routes";
import { Amount } from "@/components/ui/Amount";
import { Loading } from "@/components/ui/Loading";
import { TableList } from "@/components/ui/TableList";
import { POStatusBadge } from "@/components/purchase/POStatusBadge";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/utils/cn";
import type { POStatus, PurchaseOrder } from "@/types";

type ColumnAlign = "left" | "right" | "center";

type POTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: ColumnAlign;
  flex?: number;
};

export interface PurchaseOrdersTableProps {
  orders: PurchaseOrder[];
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
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

function rowAccentClass(status: POStatus): string | undefined {
  if (status === "CANCELLED") return "bg-destructive/5";
  if (status === "RECEIVED") return "bg-success/5";
  if (status === "PARTIALLY_RECEIVED") return "bg-warning/5";
  return undefined;
}

export function PurchaseOrdersTable({
  orders,
  onEndReached,
  isFetchingNextPage,
  refreshing = false,
  onRefresh,
  contentContainerStyle,
}: PurchaseOrdersTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { isWide } = useResponsive();
  const { date } = useFormatters();

  const columns = useMemo<POTableColumn[]>(
    () => [
      { key: "number", label: t("purchase.poNumber"), width: 120, flex: 1 },
      { key: "supplier", label: t("purchase.supplier"), width: 128, flex: 1 },
      { key: "warehouse", label: t("purchase.warehouse"), width: 112, flex: 1 },
      { key: "orderDate", label: t("purchase.orderDate"), width: 96 },
      { key: "items", label: t("purchase.items"), width: 72, align: "right" },
      {
        key: "total",
        label: t("purchase.totalAmount"),
        width: 108,
        align: "right",
      },
      { key: "status", label: t("common.status"), width: 120, align: "center" },
    ],
    [t]
  );

  const tableMinWidth = useMemo(() => {
    if (isWide) return undefined;
    return columns.reduce((sum, col) => sum + col.width, 0);
  }, [columns, isWide]);

  const onRowPress = useCallback(
    (po: PurchaseOrder) => {
      router.push(routes.purchase.detail(po.id));
    },
    [router]
  );

  const renderCell = useCallback(
    (po: PurchaseOrder, column: POTableColumn) => {
      const itemCount = po.items?.length ?? 0;

      switch (column.key) {
        case "number":
          return <CellText mono bold>{po.order_number}</CellText>;
        case "supplier":
          return (
            <CellText numberOfLines={2}>{po.supplier_name || "—"}</CellText>
          );
        case "warehouse":
          return (
            <CellText muted numberOfLines={2}>
              {po.warehouse_name || "—"}
            </CellText>
          );
        case "orderDate":
          return (
            <CellText muted>
              {po.order_date ? date(po.order_date) : "—"}
            </CellText>
          );
        case "items":
          return (
            <CellText align="right" mono>
              {itemCount}
            </CellText>
          );
        case "total":
          return (
            <Amount
              value={po.total_amount ?? 0}
              minimumFractionDigits={2}
              maximumFractionDigits={2}
              className="text-body text-right"
            />
          );
        case "status":
          return <POStatusBadge status={po.status} size="sm" />;
        default:
          return null;
      }
    },
    [date]
  );

  const headerRow = (
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
  );

  const renderRow = useCallback(
    ({ item, index }: { item: PurchaseOrder; index: number }) => {
      const accent = rowAccentClass(item.status);

      return (
        <Pressable
          onPress={() => onRowPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.order_number}, ${item.supplier_name}`}
          className={cn(
            "flex-row border-b border-border active:bg-muted/50",
            index % 2 === 1 && "bg-muted/20",
            accent
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

  const keyExtractor = useCallback((po: PurchaseOrder) => po.id, []);

  const tableBody = (
    <View
      className="flex-1 rounded-lg border border-border bg-card overflow-hidden"
      style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
    >
      {headerRow}
      <TableList
        data={orders}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        nestedScrollEnabled
        contentContainerStyle={contentContainerStyle}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E40AF" />
          ) : undefined
        }
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

