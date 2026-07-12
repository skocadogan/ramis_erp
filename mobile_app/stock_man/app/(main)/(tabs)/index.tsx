// ============================================================
// Stock Man — Dashboard (P1 + P5)
//
// Live KPIs (low stock, expiring lots, etc.), quick actions,
// and a recent-activity feed. Reads from the React Query
// hooks the data-layer agent owns and renders through the
// shared `KpiCard` / `QuickActions` / `StockLevelCard`
// components.
//
// P5 additions:
//   - <LowStockBanner /> surfaces real-time low-stock alerts
//     pushed by the backend over WebSocket.
//   - <SyncProgressModal /> is shown when the offline mutation
//     queue is non-empty.
//
// Behaviour:
//   - Greeting + active branch in the header (no branch → empty
//     state that nudges the user to pick one).
//   - Pull-to-refresh invalidates the four key queries.
//   - Secondary KPIs (pending PO / in-transit transfers / pending
//     receivings) come from `useWarehouseSummary()` — web parity.
//   - Recent activity pulls the 5 latest stock-movements and
//     shows them as a compact list.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import {
  AlertTriangle,
  ClipboardList,
  CloudOff,
  Hourglass,
  PackageX,
  ScanLine,
  TrendingDown,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Header } from "@/components/ui/Header";
import { Badge } from "@/components/ui/Badge";
import { KpiCard, type KpiVariant } from "@/components/dashboard/KpiCard";
import { ExpiryKpiCard } from "@/components/dashboard/ExpiryKpiCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { LowStockBanner } from "@/components/dashboard/LowStockBanner";
import { DeficiencyCreatedBanner } from "@/components/deficiency/DeficiencyCreatedBanner";
import { SyncProgressModal } from "@/components/offline/SyncProgressModal";
import { BranchSelectorBar } from "@/components/branch/BranchSelectorBar";
import { BranchRequiredPrompt } from "@/components/branch/BranchRequiredPrompt";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import { useBranchStore } from "@/store/useBranchStore";
import { useResponsive } from "@/hooks/useResponsive";
import { useFormatters } from "@/hooks/useFormatters";
import {
  useStockItemsSummary,
  useStockMovements,
} from "@/hooks/useStockItems";
import { useExpirySummary } from "@/hooks/useExpiry";
import { useWarehouseSummary } from "@/hooks/useWarehouses";
import { useDeficiencyReports } from "@/hooks/useDeficiencyReports";
import { useOfflineQueue, useWSPushStore } from "@/data/p5";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { cn } from "@/utils/cn";
import {
  getStockMovementTypeAbbr,
  getStockMovementTypeLabel,
  stockMovementQuantityPrefix,
  stockMovementTypeBadgeClasses,
} from "@/utils/stockMovementDisplay";
import type { StockMovement } from "@/types";

export default function DashboardScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const availableBranches = useBranchStore((s) => s.availableBranches);
  const { isTablet, isLandscape, width } = useResponsive();
  const { dateTime } = useFormatters();
  const queryClient = useQueryClient();

  const SECONDARY_KPI_STALE = 60_000;

  const stockSummary = useStockItemsSummary();
  const expirySummary = useExpirySummary();
  const movements = useStockMovements({ page_size: 5 });
  const warehouseSummary = useWarehouseSummary();
  const deficiencyQuery = useDeficiencyReports(
    { status: "PENDING" },
    { staleTime: SECONDARY_KPI_STALE }
  );

  // ── P5: offline queue + WS push ─────────────────────────────
  const { pendingCount } = useOfflineQueue();
  const lowAlertsCount = useWSPushStore((s) => s.lowAlerts.length);
  const [syncOpen, setSyncOpen] = useState(false);

  const activeBranch = useMemo(
    () => availableBranches.find((b) => b.id === activeBranchId),
    [availableBranches, activeBranchId]
  );

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["stock-items"] });
    void queryClient.invalidateQueries({ queryKey: ["expiry-warnings"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
    void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
  }, [queryClient]);

  const summary = stockSummary.data;
  const expiry = expirySummary.data;
  const recent = useMemo(() => movements.data?.results ?? [], [movements.data?.results]);
  const recentRows = useMemo(
    () =>
      recent.map((m) => ({
        id: m.id,
        movement: m,
        relativeDate: dateTime(m.created_at),
      })),
    [recent, dateTime]
  );

  // ── Empty state: no branch selected yet ────────────────────
  if (!activeBranchId) {
    return (
      <BranchRequiredPrompt
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        icon={TrendingDown}
      />
    );
  }

  const lowStock = summary?.low ?? 0;
  const expiryWithin3 = expiry?.within_3_days ?? 0;
  const expiryWithin7 = expiry?.within_7_days ?? 0;
  const expiryExpired = expiry?.expired ?? 0;
  const pendingPO = warehouseSummary.data?.pending_orders ?? 0;
  const openTransfers = warehouseSummary.data?.active_transfers ?? 0;
  const openReceivings = warehouseSummary.data?.pending_receivings ?? 0;
  const deficiencyCount = deficiencyQuery.data?.results?.length ?? 0;
  const todayMovements = recent.length;

  const greetingName = user?.full_name ?? user?.username ?? "";

  const kpiColumns = isLandscape || isTablet ? 3 : 2;
  const kpiGap = 10;
  const kpiCardWidth =
    (width - 32 - kpiGap * (kpiColumns - 1)) / kpiColumns;

  const kpiItems: {
    key: string;
    label: string;
    value: number;
    icon: typeof AlertTriangle;
    variant: KpiVariant;
    onPress?: () => void;
    hint?: string;
  }[] = [
    {
      key: "lowStock",
      label: t("dashboard.kpis.lowStock"),
      value: lowStock,
      icon: AlertTriangle,
      variant: lowStock > 0 ? "warning" : "default",
      onPress: () => router.push("/(main)/(tabs)/stock"),
      hint: t("stock.lowStockBadge"),
    },
    {
      key: "pendingPO",
      label: t("dashboard.kpis.pendingPO"),
      value: pendingPO,
      icon: Hourglass,
      variant: pendingPO > 0 ? "info" : "default",
      onPress: () => router.push("/(main)/(tabs)/purchase"),
    },
    {
      key: "openTransfers",
      label: t("dashboard.kpis.openTransfers"),
      value: openTransfers,
      icon: ClipboardList,
      variant: openTransfers > 0 ? "info" : "default",
      onPress: () => router.push("/(main)/(tabs)/transfers"),
    },
    {
      key: "openReceivings",
      label: t("dashboard.kpis.openReceivings"),
      value: openReceivings,
      icon: PackageX,
      variant: openReceivings > 0 ? "warning" : "default",
    },
    {
      key: "deficiency",
      label: t("dashboard.kpis.deficiency"),
      value: deficiencyCount,
      icon: TrendingDown,
      variant: "destructive",
      onPress: () => router.push("/(main)/(tabs)/deficiency" as any),
    },
  ];

  const lowStockKpi = kpiItems[0]!;
  const otherKpis = kpiItems.slice(1);

  return (
    <Screen padded={false} bottomSafe>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={
              stockSummary.isFetching ||
              expirySummary.isFetching ||
              warehouseSummary.isFetching ||
              movements.isFetching
            }
            onRefresh={onRefresh}
            tintColor="#1E40AF"
          />
        }
      >
        <View className="px-4 pt-2 flex-row items-center justify-between">
          <View className="flex-1 min-w-0 pr-2">
            <Header
              title={t("dashboard.title")}
              subtitle={
                greetingName
                  ? `${t("auth.welcomeBack")}, ${greetingName}`
                  : t("dashboard.subtitle")
              }
            />
          </View>
          <View className="flex-row items-center">
            <Pressable
              onPress={() => router.push("/(main)/scanner" as any)}
              accessibilityRole="button"
              accessibilityLabel="dashboard-scan"
              className="h-10 w-10 mr-1.5 items-center justify-center rounded-full bg-primary/10 active:opacity-80"
            >
              <ScanLine size={18} color="#1E40AF" />
            </Pressable>
            <Pressable
              onPress={() => setSyncOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="dashboard-sync"
              className="h-10 w-10 items-center justify-center rounded-full bg-warning/10 active:opacity-80 relative"
            >
              <CloudOff size={18} color="#F59E0B" />
              {pendingCount > 0 ? (
                <View className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-warning items-center justify-center">
                  <Text className="text-[10px] font-bold text-foreground">
                    {pendingCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {(lowAlertsCount > 0 || pendingCount > 0) ? (
          <View className="px-4 mt-2 flex-row flex-wrap items-center gap-2">
            {lowAlertsCount > 0 ? (
              <Badge
                variant="destructive"
                size="sm"
                icon={AlertTriangle}
                label={`${lowAlertsCount} ${t("dashboard.kpis.lowStock")}`}
              />
            ) : null}
            {pendingCount > 0 ? (
              <Badge
                variant="warning"
                size="sm"
                icon={CloudOff}
                label={`${pendingCount} ${t("settings.sync")}`}
              />
            ) : null}
          </View>
        ) : null}

        <View className="px-4 mt-2">
          <BranchSelectorBar />
          {activeBranch ? (
            <Text className="mt-1 text-caption text-muted-foreground">
              {t("branches.current")}: {activeBranch.name}
            </Text>
          ) : null}
        </View>

         {/* Quick actions */}
         <View className="px-4 mt-4 mb-4">
        
          <QuickActions />
        </View>
        

        <View className="px-4 mt-0 flex-row flex-wrap" style={{ gap: kpiGap }}>
         
          <View style={{ width: kpiCardWidth }}>
            <KpiCard
              label={lowStockKpi.label}
              value={lowStockKpi.value}
              icon={lowStockKpi.icon}
              variant={lowStockKpi.variant}
              onPress={lowStockKpi.onPress}
              hint={lowStockKpi.hint}
            />
          </View>
          <View style={{ width: kpiCardWidth }}>
            <ExpiryKpiCard
              within3Days={expiryWithin3}
              within7Days={expiryWithin7}
              expired={expiryExpired}
              onPress={() => router.push("/(main)/expiry" as any)}
            />
          </View>
          {otherKpis.map((kpi) => (
            <View key={kpi.key} style={{ width: kpiCardWidth }}>
              <KpiCard
                label={kpi.label}
                value={kpi.value}
                icon={kpi.icon}
                variant={kpi.variant}
                onPress={kpi.onPress}
                hint={kpi.hint}
              />
            </View>
          ))}
        </View>

       

        {/* Recent activity */}
        <View className="px-4 mt-2">
          <Text className="text-h3 text-foreground mb-1">
            {t("dashboard.recentActivity")}
          </Text>
          {stockSummary.isPending || movements.isPending ? (
            <Loading />
          ) : recent.length === 0 ? (
            <Card>
              <EmptyState
                icon={ClipboardList}
                title={t("dashboard.noActivity")}
              />
            </Card>
          ) : (
            <Card variant="outlined" className="p-0">
              {recentRows.map((row, idx) => (
                <MovementRow
                  key={row.id}
                  movement={row.movement}
                  isLast={idx === recentRows.length - 1}
                  relativeDate={row.relativeDate}
                />
              ))}
            </Card>
          )}
          <Text className="mt-1 text-caption text-muted-foreground text-right">
            {t("dashboard.kpis.todayMovements")}: {todayMovements}
          </Text>
        </View>
      </ScrollView>

      {/* P5: real-time deficiency + low-stock banners */}
      <DeficiencyCreatedBanner />
      <LowStockBanner />
      {/* P5: pending-mutation queue progress. */}
      <SyncProgressModal visible={syncOpen} onClose={() => setSyncOpen(false)} />
    </Screen>
  );
}

interface MovementRowProps {
  movement: StockMovement;
  isLast: boolean;
  relativeDate: string;
}

function MovementRow({ movement, isLast, relativeDate }: MovementRowProps) {
  const { t } = useI18n();
  const badge = stockMovementTypeBadgeClasses(movement.movement_type);
  const typeLabel = getStockMovementTypeLabel(movement.movement_type, t);
  const prefix = stockMovementQuantityPrefix(
    movement.movement_type,
    movement.quantity,
    movement.reference,
    movement.signed_quantity,
  );

  return (
    <View
      className={cn(
        "flex-row items-center px-3 py-2",
        !isLast && "border-b border-border"
      )}
    >
      <View
        className={cn(
          "h-8 w-8 items-center justify-center rounded-full mr-3",
          badge.container
        )}
      >
        <Text className={cn("text-[10px] font-bold", badge.text)}>
          {getStockMovementTypeAbbr(movement.movement_type, t)}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-body text-foreground" numberOfLines={1}>
          {movement.stock_item_name ?? movement.stock_item}
        </Text>
        <Text className="text-caption text-muted-foreground" numberOfLines={1}>
          {typeLabel} · {movement.warehouse_name ?? "—"} · {relativeDate}
        </Text>
      </View>
      <Text className={cn("text-body text-mono font-bold", badge.qty)}>
        {prefix}
        {movement.quantity} {movement.unit}
      </Text>
      <Text className="sr-only">
        {t("stock.lastMovement")}: {typeLabel}
      </Text>
    </View>
  );
}
