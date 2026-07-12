import React, { useEffect, useCallback, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Alert, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import ProductionStatusModal from "../../src/components/ProductionStatusModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../src/store/useAuthStore";
import { usePosStore } from "../../src/store/usePosStore";
import { useShallow } from "zustand/react/shallow";
import { effectiveBranchId } from "../../src/utils/branchScope";
import { fetchActiveShift, fetchDashboardStats } from "../../src/api/waiterApi";
import { useI18n } from "../../src/i18n";
import { useWaiterPosPushStore } from "../../src/store/useWaiterPosPushStore";
import { useBackendHealthStore } from "../../src/store/useBackendHealthStore";
import {
  DashboardPosTerminalRequiredView,
  DashboardNetworkErrorView,
  DashboardShiftClosedView,
  DashboardHeader,
  DashboardStatsCard,
  DashboardMenuGrid,
  DashboardActionList,
} from "../../src/components/dashboard";

export default function DashboardScreen() {
  const healthStatus = useBackendHealthStore((s) => s.status) as string;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const pulseLoopRef = React.useRef<ReturnType<typeof Animated.loop> | null>(null);

  useEffect(() => {
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;

    if (healthStatus === "down") {
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoopRef.current.start();
    } else {
      pulseAnim.setValue(1);
    }

    return () => {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
    };
  }, [healthStatus, pulseAnim]);

  const { user, logout } = useAuthStore(useShallow((s) => ({ user: s.user, logout: s.logout })));
  const router = useRouter();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { terminalId, posTerminalUuid, activeBranchId, setActiveBranchId } = usePosStore(
    useShallow((s) => ({
      terminalId: s.terminalId,
      posTerminalUuid: s.posTerminalUuid,
      activeBranchId: s.activeBranchId,
      setActiveBranchId: s.setActiveBranchId,
    }))
  );

  const branchId = effectiveBranchId(user?.branchId, activeBranchId);
  const [terminalListTick, setTerminalListTick] = useState(0);
  const [productionStatusVisible, setProductionStatusVisible] = React.useState(false);

  const shiftQuery = useQuery({
    queryKey: ["shift", "active", branchId, posTerminalUuid] as const,
    queryFn: () => fetchActiveShift(branchId!, posTerminalUuid),
    enabled: !!branchId && !!posTerminalUuid,
  });

  const shiftOpen = shiftQuery.data?.status === "OPEN";

  const statsQuery = useQuery({
    queryKey: ["dashboard", "stats", branchId] as const,
    queryFn: () => fetchDashboardStats(branchId!),
    enabled: !!branchId && !!posTerminalUuid && shiftOpen,
  });

  useEffect(() => {
    if (user?.branchId && !activeBranchId) {
      setActiveBranchId(user.branchId);
    }
  }, [user?.branchId, activeBranchId, setActiveBranchId]);

  const stats = statsQuery.data ?? { tables: 0, ready: 0, delivered: 0 };
  const readyItemsCount = useWaiterPosPushStore((s) => s.readyItemsCount);
  const deliveredCount = useWaiterPosPushStore((s) => s.deliveredCount);

  const initDashboard = useCallback(() => {
    if (!branchId) return;
    void queryClient.invalidateQueries({ queryKey: ["shift"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", "stats", branchId] });
    setTerminalListTick((n) => n + 1);
  }, [branchId, queryClient]);

  useFocusEffect(
    useCallback(() => {
      const data = queryClient.getQueryData(["shift", "active", branchId, posTerminalUuid]) as
        | { status?: string }
        | undefined;
      if (branchId && posTerminalUuid && data?.status !== "OPEN") {
        setTerminalListTick((n) => n + 1);
      }
    }, [queryClient, branchId, posTerminalUuid])
  );

  const branchLabel =
    user?.branchName?.trim() ||
    t("dashboard.branchFallback", { id: branchId ? String(branchId).slice(0, 8) : "—" });

  const handleLogoutPress = () => {
    Alert.alert(t("settings.logoutConfirmTitle"), t("settings.logoutConfirmDesc"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.logoutConfirmBtn"),
        style: "destructive",
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  if (!branchId) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-muted-foreground text-center">{t("common.noData")}</Text>
      </View>
    );
  }

  if (!posTerminalUuid) {
    return (
      <DashboardPosTerminalRequiredView
        t={t}
        onSelectTerminal={() => router.push("/(main)/terminal-select")}
        onSettings={() => router.push("/(main)/settings")}
        onLogout={handleLogoutPress}
      />
    );
  }

  if (shiftQuery.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="small" color="#1E2A4A" />
      </View>
    );
  }

  const shiftOpenResolved = shiftQuery.data?.status === "OPEN";

  function isApiError(error: unknown): error is { response?: unknown; status?: number } {
    return (
      typeof error === "object" && error !== null && ("response" in error || "status" in error)
    );
  }

  const isNetworkError =
    healthStatus === "down" ||
    (shiftQuery.isError &&
      (!shiftQuery.error || !isApiError(shiftQuery.error) || !shiftQuery.error.response));

  if (isNetworkError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <DashboardNetworkErrorView
          t={t}
          branchLabel={branchLabel}
          onSettings={() => router.push("/(main)/settings")}
          onLogout={handleLogoutPress}
          onRetry={initDashboard}
        />
      </SafeAreaView>
    );
  }

  if (!shiftOpenResolved || shiftQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <DashboardShiftClosedView
          t={t}
          branchLabel={branchLabel}
          branchId={branchId}
          terminalListTick={terminalListTick}
          onSettings={() => router.push("/(main)/settings")}
          onLogout={handleLogoutPress}
          onCheckAgain={initDashboard}
          onTerminalPersisted={() => {
            void queryClient.invalidateQueries({ queryKey: ["shift"] });
          }}
        />
      </SafeAreaView>
    );
  }

  if (statsQuery.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="small" color="#1E2A4A" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <DashboardHeader
        t={t}
        user={user}
        healthStatus={healthStatus as import("../../src/store/useBackendHealthStore").HealthStatus}
        pulseAnim={pulseAnim}
        onCheckHealth={() => {
          void useBackendHealthStore.getState().checkHealth();
        }}
        onLogout={handleLogoutPress}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-5 pb-10"
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <DashboardStatsCard
          t={t}
          branchLabel={branchLabel}
          tables={stats.tables}
          ready={readyItemsCount}
          delivered={deliveredCount}
        />

        <DashboardMenuGrid
          t={t}
          onQrScan={() => router.push("/(main)/qr-scanner")}
          onTables={() => router.push("/(main)/tables")}
          onOrders={() => router.push("/(main)/orders")}
          onProductionStatus={() => setProductionStatusVisible(true)}
        />

        <DashboardActionList
          t={t}
          terminalId={terminalId || ""}
          onChangeTerminal={() => router.push("/(main)/terminal-select")}
          onSettings={() => router.push("/(main)/settings")}
        />
      </ScrollView>

      <ProductionStatusModal
        visible={productionStatusVisible}
        onClose={() => setProductionStatusVisible(false)}
        branchId={branchId || ""}
      />
    </SafeAreaView>
  );
}
