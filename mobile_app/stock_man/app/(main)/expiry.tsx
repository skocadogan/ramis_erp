// ============================================================
// Stock Man — Expiry Warnings
//
// SKT lot list with summary, filter chips, and per-row
// action sheet. The screen is reachable from the dashboard
// (SKT KPI) and from the "More" tab (SKT Uyarıları entry).
//
// Filter chips cover the 3 / 7 / expired windows. Tapping a
// row's "İşlemler" button opens the `ExpiryActionSheet` which
// posts the action through `useRecordExpiryAction`. Expired
// lots with `manage_return_cancel` show an auto iptal/iade
// button (web SKT Takibi parity).
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Stack } from "expo-router";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  ChevronRight,
  Inbox,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExpiryWarningRow } from "@/components/stock/ExpiryWarningRow";
import { ExpiryActionSheet } from "@/components/stock/ExpiryActionSheet";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n";
import { useNavigateBack } from "@/hooks/useNavigateBack";
import { useFormatters } from "@/hooks/useFormatters";
import { usePermission } from "@/hooks/usePermission";
import { useResponsive } from "@/hooks/useResponsive";
import {
  useAutoReturnCancelExpiredLot,
  useExpirySummary,
  useExpiryWarnings,
} from "@/hooks/useExpiry";
import { useDialogStore } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import { cn } from "@/utils/cn";
import type { ExpiryWarning } from "@/types";

type ExpiryFilter = "3" | "7" | "expired";

export default function ExpiryScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const { quantity: formatQuantity } = useFormatters();
  const { isTablet } = useResponsive();
  const canManageExpiryAction = usePermission("inventory.manage_expiry_action");
  const canManageReturnCancel = usePermission("inventory.manage_return_cancel");
  const autoReturnCancelMut = useAutoReturnCancelExpiredLot();

  const [filter, setFilter] = useState<ExpiryFilter>("7");
  const [activeWarning, setActiveWarning] = useState<ExpiryWarning | null>(
    null
  );

  const daysAhead = filter === "expired" ? undefined : (Number(filter) as 3 | 7);
  const warningsQuery = useExpiryWarnings(
    daysAhead ? { days_ahead: daysAhead } : undefined
  );
  const summaryQuery = useExpirySummary();

  const warnings = useMemo<ExpiryWarning[]>(
    () => warningsQuery.data ?? [],
    [warningsQuery.data]
  );

  const summary = summaryQuery.data;
  const visibleList = useMemo(() => {
    if (filter !== "expired") return warnings;
    return warnings.filter((w) => w.is_expired);
  }, [warnings, filter]);

  const onRefresh = useCallback(() => {
    void warningsQuery.refetch();
    void summaryQuery.refetch();
  }, [warningsQuery, summaryQuery]);

  const { goBack } = useNavigateBack("/(main)/(tabs)/more");

  const handleAutoReturnCancel = useCallback(
    (warning: ExpiryWarning) => {
      const quantityLabel = formatQuantity(warning.quantity);
      useDialogStore.getState().show({
        title: t("expiry.autoReturnCancelTitle"),
        description: t("expiry.autoReturnCancelDescription", {
          product: warning.stock_item_name,
          lot: warning.lot_number || "—",
          quantity: quantityLabel,
        }),
        iconVariant: "confirm",
        actions: [
          { label: t("common.cancel"), variant: "secondary" },
          {
            label: t("expiry.autoReturnCancelConfirm"),
            variant: "destructive",
            onPress: () => {
              autoReturnCancelMut.mutate(
                { lot_id: warning.id },
                {
                  onSuccess: () => {
                    toast.success(t("expiry.autoReturnCancelSuccess"));
                  },
                  onError: (err: unknown) => {
                    toast.error(
                      extractApiError(err, t("expiry.autoReturnCancelError"))
                    );
                  },
                }
              );
            },
          },
        ],
      });
    },
    [autoReturnCancelMut, formatQuantity, t, toast]
  );

  const renderItem = useCallback(
    ({ item }: { item: ExpiryWarning }) => (
      <ExpiryWarningRow
        warning={item}
        showActions={canManageExpiryAction}
        showAutoReturnCancel={canManageReturnCancel && item.is_expired}
        onActionPress={() => setActiveWarning(item)}
        onAutoReturnCancelPress={() => handleAutoReturnCancel(item)}
      />
    ),
    [canManageExpiryAction, canManageReturnCancel, handleAutoReturnCancel]
  );

  const keyExtractor = useCallback((w: ExpiryWarning) => w.id, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen padded={false}>
        <View className="px-4 pt-2">
          <Header
            title={t("expiry.title")}
            subtitle={t("expiry.summary.title")}
            back
            onBackPress={goBack}
          />
        </View>

        <View
          className={cn(
            "px-4 mt-3",
            isTablet ? "flex-row gap-3" : "flex-col gap-2.5"
          )}
        >
          <SummaryCard
            label={t("expiry.summary.within3Days")}
            value={summary?.within_3_days ?? 0}
            icon={CalendarClock}
            variant="warning"
            onPress={() => setFilter("3")}
            selected={filter === "3"}
            t={t}
          />
          <SummaryCard
            label={t("expiry.summary.within7Days")}
            value={summary?.within_7_days ?? 0}
            icon={Calendar}
            variant="info"
            onPress={() => setFilter("7")}
            selected={filter === "7"}
            t={t}
          />
          <SummaryCard
            label={t("expiry.summary.expired")}
            value={summary?.expired ?? 0}
            icon={AlertTriangle}
            variant="destructive"
            onPress={() => setFilter("expired")}
            selected={filter === "expired"}
            t={t}
          />
        </View>

        <View className="px-4 mt-3 flex-row items-center gap-2">
          <Chip
            label={`${t("expiry.summary.within3Days")}`}
            selected={filter === "3"}
            onPress={() => setFilter("3")}
            variant="warning"
            size="sm"
          />
          <Chip
            label={`${t("expiry.summary.within7Days")}`}
            selected={filter === "7"}
            onPress={() => setFilter("7")}
            variant="primary"
            size="sm"
          />
          <Chip
            label={t("expiry.summary.expired")}
            selected={filter === "expired"}
            onPress={() => setFilter("expired")}
            variant="destructive"
            size="sm"
          />
          <View className="flex-1" />
          <Text className="text-caption text-muted-foreground" numberOfLines={1}>
            {visibleList.length} {t("expiry.title").toLowerCase()}
          </Text>
        </View>

        <View className="flex-1 mt-3">
          {warningsQuery.isPending ? (
            <Loading />
          ) : visibleList.length === 0 ? (
            <View className="px-4">
              <Card>
                <EmptyState
                  icon={Inbox}
                  title={t("common.noData")}
                  description={t("expiry.title")}
                />
              </Card>
            </View>
          ) : (
            <FlashList
              data={visibleList}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              refreshControl={
                <RefreshControl
                  refreshing={warningsQuery.isFetching}
                  onRefresh={onRefresh}
                  tintColor="#1E40AF"
                />
              }
            />
          )}
        </View>
      </Screen>

      {activeWarning ? (
        <ExpiryActionSheet
          warning={activeWarning}
          onClose={() => setActiveWarning(null)}
        />
      ) : null}
    </>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  variant: "warning" | "info" | "destructive";
  selected: boolean;
  onPress: () => void;
  t: (key: string) => string;
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  variant,
  selected,
  onPress,
  t,
}: SummaryCardProps) {
  const palette = {
    warning: { tile: "bg-warning/15", text: "text-warning", icon: "#F59E0B" },
    info: { tile: "bg-info/15", text: "text-info", icon: "#0EA5E9" },
    destructive: {
      tile: "bg-destructive/15",
      text: "text-destructive",
      icon: "#DC2626",
    },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}: ${value}`}
      className={cn(
        "flex-1 min-w-[140px] rounded-xl border bg-card p-3 active:opacity-80",
        selected ? "border-primary" : "border-border"
      )}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 min-w-0">
          <Text
            className="text-caption text-muted-foreground font-semibold uppercase"
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            className={cn(
              "text-h1 text-mono font-bold mt-1",
              palette.text
            )}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
        <View
          className={cn(
            "h-10 w-10 items-center justify-center rounded-lg ml-2",
            palette.tile
          )}
        >
          <Icon size={20} color={palette.icon} />
        </View>
      </View>
      <View className="flex-row items-center justify-end mt-2">
        <Text className="text-caption text-primary font-semibold mr-1">
          {t_filter(selected, t)}
        </Text>
        <ChevronRight size={14} color="#1E40AF" />
      </View>
    </Pressable>
  );
}

// Localised "filter on / off" label.
function t_filter(selected: boolean, t: (key: string) => string): string {
  return selected ? t("common.selected") : t("common.filterNow");
}
