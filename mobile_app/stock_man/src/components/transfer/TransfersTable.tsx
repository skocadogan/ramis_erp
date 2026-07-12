// ============================================================
// Stock Man — Transfers Table
//
// Tabular transfer list with sticky header, row press → detail,
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
import { Loading } from "@/components/ui/Loading";
import { TableList } from "@/components/ui/TableList";
import { TransferStatusBadge } from "@/components/transfer/TransferStatusBadge";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/utils/cn";
import type { TransferStatus, WarehouseTransfer } from "@/types";

type ColumnAlign = "left" | "right" | "center";

type TransferTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: ColumnAlign;
  flex?: number;
};

export interface TransfersTableProps {
  transfers: WarehouseTransfer[];
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

function rowAccentClass(status: TransferStatus): string | undefined {
  if (status === "CANCELLED") return "bg-destructive/5";
  if (status === "IN_TRANSIT") return "bg-warning/5";
  if (status === "COMPLETED") return "bg-success/5";
  return undefined;
}

export function TransfersTable({
  transfers,
  onEndReached,
  isFetchingNextPage,
  contentContainerStyle,
}: TransfersTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { isWide } = useResponsive();
  const { date } = useFormatters();

  const columns = useMemo<TransferTableColumn[]>(
    () => [
      { key: "number", label: t("transfer.number"), width: 120, flex: 1.2 },
      {
        key: "source",
        label: t("transfer.sourceWarehouse"),
        width: 140,
        flex: 1.4,
      },
      {
        key: "target",
        label: t("transfer.targetWarehouse"),
        width: 140,
        flex: 1.4,
      },
      {
        key: "items",
        label: t("transfer.items"),
        width: 80,
        align: "right",
      },
      { key: "date", label: t("common.date"), width: 108 },
      { key: "requestedBy", label: t("transfer.requestedBy"), width: 120, flex: 1 },
      { key: "status", label: t("common.status"), width: 128, align: "center" },
    ],
    [t]
  );

  const tableMinWidth = useMemo(() => {
    if (isWide) return undefined;
    return columns.reduce((sum, col) => sum + col.width, 0);
  }, [columns, isWide]);

  const columnStyle = useCallback(
    (column: TransferTableColumn) => {
      if (!isWide) {
        return { width: column.width, minWidth: column.width };
      }
      if (column.flex) {
        return { flex: column.flex, minWidth: column.width };
      }
      return { width: column.width, flexShrink: 0 };
    },
    [isWide]
  );

  const cellClass = useCallback(
    (column: TransferTableColumn) =>
      cn(
        "px-2 justify-center",
        column.align === "right" && "items-end",
        column.align === "center" && "items-center"
      ),
    []
  );

  const onRowPress = useCallback(
    (transfer: WarehouseTransfer) => {
      router.push(routes.transfer.detail(transfer.id));
    },
    [router]
  );

  const renderCell = useCallback(
    (transfer: WarehouseTransfer, column: TransferTableColumn) => {
      const itemCount = transfer.items?.length ?? 0;

      switch (column.key) {
        case "number":
          return <CellText mono bold>{transfer.transfer_number}</CellText>;
        case "source":
          return (
            <CellText numberOfLines={2}>
              {transfer.source_warehouse_name || "—"}
            </CellText>
          );
        case "target":
          return (
            <CellText numberOfLines={2}>
              {transfer.target_warehouse_name || "—"}
            </CellText>
          );
        case "items":
          return (
            <CellText align="right" mono>
              {itemCount}
            </CellText>
          );
        case "date":
          return (
            <CellText muted>
              {transfer.transfer_date ? date(transfer.transfer_date) : "—"}
            </CellText>
          );
        case "requestedBy":
          return (
            <CellText muted numberOfLines={2}>
              {transfer.requested_by_name || "—"}
            </CellText>
          );
        case "status":
          return <TransferStatusBadge status={transfer.status} size="sm" />;
        default:
          return null;
      }
    },
    [date]
  );

  const headerRow = (
    <View className="flex-row w-full border-b border-border bg-muted/40">
      {columns.map((column) => (
        <View
          key={column.key}
          style={columnStyle(column)}
          className={cn(cellClass(column), "py-2.5")}
        >
          <Text
            numberOfLines={1}
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
    ({ item, index }: { item: WarehouseTransfer; index: number }) => {
      const accent = rowAccentClass(item.status);

      return (
        <Pressable
          onPress={() => onRowPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.transfer_number}, ${item.source_warehouse_name} → ${item.target_warehouse_name}`}
          className={cn(
            "flex-row w-full border-b border-border active:bg-muted/50",
            index % 2 === 1 && "bg-muted/20",
            accent
          )}
          style={{ minHeight: ROW_HEIGHT }}
        >
          {columns.map((column) => (
            <View
              key={column.key}
              style={columnStyle(column)}
              className={cn(cellClass(column), "py-2")}
            >
              {renderCell(item, column)}
            </View>
          ))}
        </Pressable>
      );
    },
    [cellClass, columnStyle, columns, onRowPress, renderCell]
  );

  const keyExtractor = useCallback((item: WarehouseTransfer) => item.id, []);

  const tableBody = (
    <View
      className="flex-1 w-full rounded-lg border border-border bg-card overflow-hidden"
      style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
    >
      {headerRow}
      <TableList
        data={transfers}
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

