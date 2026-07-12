// ============================================================
// Stock Man — Deficiency Report Detail
//
// Layout: purchase/[id].tsx ile aynı — üst timeline, tablet'te
// sol meta (3) + sağ kalemler tablosu (7), mobilde tek sütun.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Check,
  ChefHat,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  FileText,
  PackageCheck,
  PackageX,
  ShoppingCart,
  Truck,
  User,
  Warehouse as WarehouseIcon,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { HorizontalStatusTimeline } from "@/components/ui/HorizontalStatusTimeline";
import { InfoRow } from "@/components/ui/InfoRow";
import { Loading } from "@/components/ui/Loading";
import { TransferStatusBadge } from "@/components/transfer/TransferStatusBadge";
import { DeficiencyItemsTable } from "@/components/deficiency/DeficiencyItemsTable";
import { DeficiencyActionBar } from "@/components/deficiency/DeficiencyActionBar";
import { DeficiencyItemActionsPanel } from "@/components/deficiency/DeficiencyItemActionsPanel";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useResponsive } from "@/hooks/useResponsive";
import { usePermission } from "@/hooks/usePermission";
import {
  useDeficiencyReport,
  useDeficiencyStockAvailability,
} from "@/hooks/useDeficiencyReports";
import { useToast } from "@/components/ui/Toast";
import { getActiveDeficiencyTransfers } from "@/utils/deficiencyTransfers";
import type { DeficiencyAvailabilityRow, DeficiencyStatus, TransferStatus, UUID } from "@/types";

const STATUS_FLOW: DeficiencyStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "ORDERED",
  "PARTIALLY_COMMITTED",
  "COMMITTED",
];

function stepIndex(status: DeficiencyStatus): number {
  if (status === "CANCELLED") return -1;
  return STATUS_FLOW.indexOf(status);
}

export default function DeficiencyDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { isTablet } = useResponsive();
  const params = useLocalSearchParams<{ id: string }>();
  const id = (params.id ?? "") as UUID;
  const qc = useQueryClient();
  const canManage = usePermission("warehouse.manage_deficiency_report");

  const { dateTime, qtyWithUnit } = useFormatters();

  const query = useDeficiencyReport(id || undefined);
  const availabilityQuery = useDeficiencyStockAvailability(id || undefined);
  const dr = query.data;

  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["deficiency-reports", id] });
  }, [qc, id]);

  const onActionComplete = useCallback(
    (
      action:
        | "approve"
        | "cancel"
        | "delete"
        | "create_po"
        | "create_transfer"
        | "auto_fulfill",
      payload?: { purchase_order_id?: string; transfer_id?: string }
    ) => {
      if (action === "delete") {
        toast.success(t("common.success"));
        router.back();
        return;
      }
      if (action === "create_po" && payload?.purchase_order_id) {
        toast.success(t("deficiency.actions.createPO"));
        router.replace(`/(main)/purchase/${payload.purchase_order_id}` as any);
        return;
      }
      if (action === "create_transfer" && payload?.transfer_id) {
        toast.success(t("deficiency.actions.createTransfer"));
        router.replace(`/(main)/transfer/${payload.transfer_id}` as any);
        return;
      }
      const labelMap: Record<string, string> = {
        approve: t("deficiency.actions.approve"),
        cancel: t("deficiency.actions.cancel"),
        auto_fulfill: t("deficiency.actions.autoFulfill"),
      };
      toast.success(labelMap[action] ?? t("common.success"));
    },
    [router, toast, t]
  );

  const currentStep = dr ? stepIndex(dr.status) : -1;
  const createdAt = useMemo(
    () => (dr ? dateTime(dr.created_at) : "—"),
    [dr, dateTime]
  );
  const activeTransfers = useMemo(
    () => getActiveDeficiencyTransfers(dr ? { transfers: dr.transfers } : { transfers: [] }),
    [dr]
  );

  if (query.isPending) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <Loading fullScreen label={t("common.loading")} />
      </Screen>
    );
  }

  if (query.isError || !dr) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="px-4 pt-2">
          <Header
            title={t("deficiency.detail")}
            back
            inline
            onBackPress={() => router.back()}
          />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <PackageX size={40} color="#DC2626" />
          <Text className="text-h3 text-foreground mt-3 text-center">
            {t("errors.notFound")}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 px-5 py-3 rounded-xl bg-primary"
          >
            <Text className="text-primary-foreground font-semibold">
              {t("common.back")}
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const availability = (availabilityQuery.data ?? []) as DeficiencyAvailabilityRow[];

  const statusSection = (
    <Card className="mb-3">
      {dr.status !== "CANCELLED" ? (
        <>
          <Text className="text-caption text-muted-foreground mb-3">
            {t("common.status")}
          </Text>
          <HorizontalStatusTimeline
            flow={STATUS_FLOW}
            current={currentStep}
            getLabel={(status) => t(`deficiency.statusLabels.${DEFICIENCY_STATUS_LABEL_MAP[status]}` as any)}
          />
        </>
      ) : (
        <View className="border-l-4 border-l-destructive pl-3">
          <View className="flex-row items-center">
            <Badge
              variant="destructive"
              size="sm"
              label={t("deficiency.statusLabels.cancelled")}
              dot
            />
            <Text className="ml-2 text-caption text-muted-foreground">
              {t("common.status")}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );

  const drInfoSection = (
    <Card className="mb-3">
      <View className="flex-row items-start mb-3">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-warning/10 mr-3">
          <ChefHat size={20} color="#F59E0B" />
        </View>
        <Text className="flex-1 text-h3 text-foreground">{t("deficiency.detail")}</Text>
      </View>

      <View className="mb-3">
        <Text className="text-caption text-muted-foreground">
          {t("deficiency.kitchenStation")}
        </Text>
        <Text className="text-body font-semibold text-foreground" numberOfLines={2}>
          {dr.kitchen_station_name ?? "—"}
        </Text>
        {dr.branch_name ? (
          <Text className="text-caption text-muted-foreground mt-1" numberOfLines={1}>
            {dr.branch_name}
          </Text>
        ) : null}
        {dr.target_warehouse_name ? (
          <View className="flex-row items-center mt-1">
            <WarehouseIcon size={12} color="#64748B" />
            <Text className="ml-1 text-caption text-muted-foreground" numberOfLines={2}>
              {dr.target_warehouse_name}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="pt-3 border-t border-border flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-caption text-muted-foreground">
            {t("deficiency.warehouse")}
          </Text>
          <Text className="text-body font-semibold text-foreground mt-0.5" numberOfLines={2}>
            {dr.target_warehouse_name ?? "—"}
          </Text>
        </View>
        <View>
          <Text className="text-caption text-muted-foreground text-right">
            {t("deficiency.items")}
          </Text>
          <Text className="text-h3 text-foreground font-bold text-right mt-0.5">
            {dr.items?.length ?? 0}
          </Text>
        </View>
      </View>
    </Card>
  );

  const datesSection = (
    <Card className="mb-3">
      <View className="flex-row items-center mb-2">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <CalendarDays size={18} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground">{t("common.date")}</Text>
      </View>
      <InfoRow label={t("common.createdAt")} value={createdAt} />
      {dr.created_by_name ? (
        <InfoRow label={t("auth.username")} value={dr.created_by_name} icon={User} />
      ) : null}
      {dr.approved_by_name ? (
        <InfoRow
          label={t("deficiency.actions.approve")}
          value={dr.approved_by_name}
          icon={Check}
          isLast
        />
      ) : null}
    </Card>
  );

  const itemActionsSection = (
    <DeficiencyItemActionsPanel
      report={dr}
      availability={availability}
      isAvailabilityLoading={availabilityQuery.isPending}
      canManage={canManage}
      onComplete={onRefresh}
    />
  );

  const actionsSection = (
    <DeficiencyActionBar dr={dr} onActionComplete={onActionComplete} />
  );

  const notesSection = dr.notes ? (
    <Card className="mb-3">
      <View className="flex-row items-center mb-2">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <FileText size={18} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground">{t("purchase.notes")}</Text>
      </View>
      <Text className="text-body text-foreground leading-5">{dr.notes}</Text>
    </Card>
  ) : null;

  const availabilitySection = (
    <Card className="mb-3">
      <Pressable
        onPress={() => setAvailabilityOpen((v) => !v)}
        accessibilityRole="button"
        className="flex-row items-center"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <Building2 size={18} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground">
          {t("deficiency.stockAvailability")}
        </Text>
        {availabilityOpen ? (
          <ChevronUp size={18} color="#64748B" />
        ) : (
          <ChevronDown size={18} color="#64748B" />
        )}
      </Pressable>
      {availabilityOpen ? (
        <View className="mt-3 pt-3 border-t border-border">
          {availabilityQuery.isPending ? (
            <Loading label={t("common.loading")} />
          ) : availability.length === 0 ? (
            <Text className="text-caption text-muted-foreground text-center py-3">
              {t("deficiency.noSuggestions")}
            </Text>
          ) : (
            availability.map((row) => {
              const localItem = dr.items.find((di) => di.id === row.item_id);
              const unit = localItem?.unit ?? "";
              return (
                <View
                  key={row.item_id}
                  className="mb-3 pb-3 border-b border-border last:border-b-0"
                >
                  <Text className="text-body font-semibold text-foreground" numberOfLines={1}>
                    {row.stock_item_name ?? localItem?.stock_item_name ?? row.stock_item_id}
                  </Text>
                  <View className="flex-row items-center justify-between py-1">
                    <Text className="text-caption text-muted-foreground">
                      {t("deficiency.currentStock")}
                    </Text>
                    <Text className="text-caption font-semibold text-foreground">
                      {qtyWithUnit(row.total_available, unit)} /{" "}
                      {qtyWithUnit(row.required_quantity, unit)}
                    </Text>
                  </View>
                  {(row.warehouses ?? []).map((wh) => (
                    <View
                      key={wh.warehouse_id}
                      className="flex-row items-center justify-between py-0.5 pl-2"
                    >
                      <Text
                        className="text-caption text-muted-foreground flex-1"
                        numberOfLines={1}
                      >
                        {wh.warehouse_name}
                      </Text>
                      <Text className="text-caption text-foreground">
                        {qtyWithUnit(wh.available_quantity, unit)}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </View>
      ) : null}
    </Card>
  );

  const transfersSection =
    activeTransfers.length > 0 ? (
      <Card className="mb-3">
        <View className="flex-row items-center mb-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-muted mr-3">
            <Truck size={18} color="#64748B" />
          </View>
          <View className="flex-1">
            <Text className="text-caption text-muted-foreground">{t("transfer.title")}</Text>
            <Text className="text-body text-foreground">
              {activeTransfers.length} {t("transfer.title").toLowerCase()}
            </Text>
          </View>
          <PackageCheck size={16} color="#059669" />
        </View>
        {activeTransfers.map((tx) => (
          <Pressable
            key={tx.id}
            onPress={() => router.push(`/(main)/transfer/${tx.id}` as any)}
            accessibilityRole="button"
            className="flex-row items-center py-2 border-t border-border active:opacity-80"
          >
            <Text className="flex-1 text-body font-mono font-semibold text-foreground" numberOfLines={1}>
              {tx.transfer_number}
            </Text>
            <TransferStatusBadge status={tx.status as TransferStatus} size="sm" />
            <ChevronRight size={16} color="#64748B" />
          </Pressable>
        ))}
      </Card>
    ) : null;

  const poSection =
    typeof dr.purchase_orders_count === "number" && dr.purchase_orders_count > 0 ? (
      <Card className="mb-3">
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-muted mr-3">
            <ShoppingCart size={18} color="#64748B" />
          </View>
          <View className="flex-1">
            <Text className="text-caption text-muted-foreground">{t("purchase.title")}</Text>
            <Text className="text-body text-foreground">
              {dr.purchase_orders_count} {t("purchase.title").toLowerCase()}
            </Text>
          </View>
          <PackageCheck size={16} color="#059669" />
        </View>
      </Card>
    ) : null;

  const leftColumnContent = (
    <>
      {drInfoSection}
      {datesSection}
      {itemActionsSection}
      {actionsSection}
      {notesSection}
      {availabilitySection}
      {transfersSection}
      {poSection}
    </>
  );

  const itemsSection = (
    <Card className="w-full">
      <View className="flex-row items-center mb-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <ClipboardList size={18} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground" numberOfLines={1}>
          {t("deficiency.items")}
        </Text>
        <Text className="text-caption text-muted-foreground ml-2">
          {dr.items?.length ?? 0}
        </Text>
      </View>
      <DeficiencyItemsTable items={dr.items ?? []} />
    </Card>
  );

  const refreshControl = (
    <RefreshControl
      refreshing={query.isFetching && !query.isPending}
      onRefresh={onRefresh}
      tintColor="#1E40AF"
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="px-4 pt-2">
          <Header
            title={dr.report_number}
            subtitle={t("deficiency.detail")}
            back
            inline
            onBackPress={() => router.back()}
          />
        </View>

        {isTablet ? (
          <View className="flex-1 px-4 pb-4">
            <View className="pt-4">{statusSection}</View>
            <View className="flex-1 flex-row pt-3" style={{ gap: 8 }}>
              <View style={{ flex: 3, minWidth: 0 }}>
                <ScrollView
                  className="flex-1"
                  contentContainerStyle={{ paddingBottom: 24 }}
                  refreshControl={refreshControl}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  {leftColumnContent}
                </ScrollView>
              </View>
              <View style={{ flex: 7, minWidth: 0 }}>
                <ScrollView
                  className="flex-1"
                  contentContainerStyle={{ paddingBottom: 24 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  {itemsSection}
                </ScrollView>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            refreshControl={refreshControl}
          >
            {statusSection}
            {leftColumnContent}
            <View className="mt-1">{itemsSection}</View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}



const DEFICIENCY_STATUS_LABEL_MAP: Record<string, string> = {
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  ORDERED: "ordered",
  PARTIALLY_COMMITTED: "partiallyCommitted",
  COMMITTED: "committed",
  CANCELLED: "cancelled",
};
