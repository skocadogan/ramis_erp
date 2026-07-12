// ============================================================
// Stock Man — Deficiency Reports Table
//
// Tabular deficiency list (TransfersTable ile aynı desen):
// sticky header, sanallaştırılmış satırlar, infinite scroll.
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
import { DeficiencyStatusBadge } from "@/components/deficiency/DeficiencyStatusBadge";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useResponsive } from "@/hooks/useResponsive";
import { getDeficiencyReportLineCount } from "@/utils/deficiencyReportLineCount";
import { cn } from "@/utils/cn";
import type { DeficiencyReport, DeficiencyStatus } from "@/types";

type ColumnAlign = "left" | "right" | "center";

type DeficiencyTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: ColumnAlign;
  flex?: number;
};

export interface DeficiencyReportsTableProps {
  reports: DeficiencyReport[];
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

function rowAccentClass(status: DeficiencyStatus): string | undefined {
  if (status === "CANCELLED") return "bg-destructive/5";
  if (status === "PENDING") return "bg-warning/5";
  if (status === "COMMITTED") return "bg-success/5";
  return undefined;
}

export function DeficiencyReportsTable({
  reports,
  onEndReached,
  isFetchingNextPage,
  contentContainerStyle,
}: DeficiencyReportsTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { isWide } = useResponsive();
  const { date } = useFormatters();

  const columns = useMemo<DeficiencyTableColumn[]>(
    () => [
      { key: "number", label: t("deficiency.table.reportNo"), width: 120, flex: 1 },
      { key: "station", label: t("deficiency.kitchenStation"), width: 128, flex: 1 },
      { key: "branch", label: t("branches.title"), width: 112, flex: 1 },
      { key: "status", label: t("common.status"), width: 120, align: "center" },
      { key: "date", label: t("common.date"), width: 96 },
      { key: "lines", label: t("deficiency.table.lines"), width: 72, align: "right" },
    ],
    [t]
  );

  const tableMinWidth = useMemo(() => {
    if (isWide) return undefined;
    return columns.reduce((sum, col) => sum + col.width, 0);
  }, [columns, isWide]);

  const onRowPress = useCallback(
    (report: DeficiencyReport) => {
      router.push(routes.deficiency.detail(report.id));
    },
    [router]
  );

  const renderCell = useCallback(
    (report: DeficiencyReport, column: DeficiencyTableColumn) => {
      switch (column.key) {
        case "number":
          return <CellText mono bold>{report.report_number}</CellText>;
        case "station":
          return (
            <CellText numberOfLines={2}>
              {report.kitchen_station_name ?? "—"}
            </CellText>
          );
        case "branch":
          return (
            <CellText muted numberOfLines={2}>
              {report.branch_name ?? report.target_warehouse_name ?? "—"}
            </CellText>
          );
        case "status":
          return <DeficiencyStatusBadge status={report.status} size="sm" />;
        case "date":
          return (
            <CellText muted>
              {report.created_at ? date(report.created_at) : "—"}
            </CellText>
          );
        case "lines":
          return (
            <CellText align="right" mono>
              {getDeficiencyReportLineCount(report)}
            </CellText>
          );
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
    ({ item, index }: { item: DeficiencyReport; index: number }) => {
      const accent = rowAccentClass(item.status);

      return (
        <Pressable
          onPress={() => onRowPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.report_number}, ${item.kitchen_station_name}`}
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

  const keyExtractor = useCallback((item: DeficiencyReport) => item.id, []);

  const tableBody = (
    <View
      className="flex-1 rounded-lg border border-border bg-card overflow-hidden"
      style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
    >
      {headerRow}
      <TableList
        data={reports}
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

