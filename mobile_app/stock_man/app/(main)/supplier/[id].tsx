// ============================================================
// Stock Man — Supplier Detail
//
// Single supplier deep dive. Renders:
//   - Header (back + name)
//   - Contact card (phone, email, address, notes)
//   - Performance card (receivings, lead time, rejection & on-time rates)
//   - Stock items table (virtualized, infinite scroll)
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Mail,
  MapPin,
  Package,
  Phone,
  Star,
  StickyNote,
  TrendingUp,
  Truck,
  User,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { SectionCard } from "@/components/ui/SectionCard";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { StockItemsTable } from "@/components/stock/StockItemsTable";
import { useI18n } from "@/i18n";
import { useSupplier, useSupplierPerformance } from "@/hooks/useSuppliers";
import {
  useInfiniteStockItems,
  type StockItemFilters,
} from "@/hooks/useStockItems";
import { useBranchStore } from "@/store/useBranchStore";
import { extractResults } from "@/types/api";
import { cn } from "@/utils/cn";
import type { Supplier, SupplierPerformance } from "@/types";

const PERF_PERIODS = [7, 30, 90] as const;

export default function SupplierDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params?.id;
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);

  const [perfDays, setPerfDays] = useState<number>(30);

  const supplierQuery = useSupplier(id);
  const perfQuery = useSupplierPerformance(id, perfDays);

  const itemFilters = useMemo<StockItemFilters>(
    () => ({
      supplier_id: id,
      warehouse_id: activeWarehouseId ?? undefined,
      page_size: 50,
    }),
    [id, activeWarehouseId]
  );

  const itemsQuery = useInfiniteStockItems(itemFilters, { enabled: !!id });

  const supplier = supplierQuery.data;
  const perf = perfQuery.data;

  const stockItems = useMemo(() => {
    if (!itemsQuery.data) return [];
    return itemsQuery.data.pages.flatMap((page) => extractResults(page) ?? []);
  }, [itemsQuery.data]);

  const loadMoreItems = useCallback(() => {
    if (itemsQuery.hasNextPage && !itemsQuery.isFetchingNextPage) {
      void itemsQuery.fetchNextPage();
    }
  }, [itemsQuery]);

  const supplierSummary = useMemo(
    () =>
      supplier
        ? renderSupplierSummary({
            supplier,
            perf,
            perfPending: perfQuery.isPending,
            perfDays,
            onPeriodChange: setPerfDays,
            t,
          })
        : null,
    [supplier, perf, perfQuery.isPending, perfDays, t]
  );

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(main)/supplier" as any);
  }, [router]);

  if (supplierQuery.isPending) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Screen padded>
          <Header title={t("supplier.detail")} back onBackPress={onBack} />
          <Loading fullScreen />
        </Screen>
      </>
    );
  }

  if (supplierQuery.isError || !supplier) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Screen padded>
          <Header title={t("supplier.detail")} back onBackPress={onBack} />
          <View className="mt-4">
            <Card>
              <EmptyState
                icon={AlertTriangle}
                title={t("errors.notFound")}
                description={t("common.retry")}
                actionLabel={t("common.retry")}
                onAction={() => void supplierQuery.refetch()}
              />
            </Card>
          </View>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen padded={false}>
        <View className="flex-1">
          <View className="px-4 pt-2">
            <Header
              title={supplier.name}
              subtitle={t("supplier.detail")}
              back
              onBackPress={onBack}
            />
          </View>

          <View className="flex-1 min-h-0">
            {itemsQuery.isPending ? (
              <Loading />
            ) : stockItems.length === 0 ? (
              <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              >
                {supplierSummary}
                <EmptyState
                  icon={Package}
                  title={t("common.noData")}
                  description={t("supplier.stockItems")}
                />
              </ScrollView>
            ) : (
              <StockItemsTable
                items={stockItems}
                onEndReached={loadMoreItems}
                isFetchingNextPage={itemsQuery.isFetchingNextPage}
                contentContainerStyle={{ paddingBottom: 32 }}
                listHeaderComponent={supplierSummary ?? undefined}
              />
            )}
          </View>
        </View>
      </Screen>
    </>
  );
}

function renderSupplierSummary(opts: {
  supplier: Supplier;
  perf: SupplierPerformance | undefined;
  perfPending: boolean;
  perfDays: number;
  onPeriodChange: (days: number) => void;
  t: (key: string) => string;
}) {
  const { supplier, perf, perfPending, perfDays, onPeriodChange, t } = opts;

  return (
    <View className="px-2 pb-3">
      <Card variant="elevated" className="mb-3">
        <View className="flex-row items-start">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mr-3">
            <Truck size={22} color="#1E40AF" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-h2 text-foreground" numberOfLines={2}>
              {supplier.name}
            </Text>
            {supplier.contact_person ? (
              <View className="mt-1 flex-row items-center">
                <User size={12} color="#64748B" />
                <Text className="ml-1.5 text-caption text-muted-foreground">
                  {supplier.contact_person}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Card>

      <ContactCard supplier={supplier} t={t} />

      <PerformanceCard
        perf={perf}
        perfPending={perfPending}
        perfDays={perfDays}
        onPeriodChange={onPeriodChange}
        t={t}
      />

      <View className="flex-row items-center mt-1 mb-2">
        <Package size={16} color="#1E40AF" />
        <Text className="ml-2 text-body font-semibold text-foreground">
          {t("supplier.stockItems")}
        </Text>
      </View>
    </View>
  );
}

function ContactCard({
  supplier,
  t,
}: {
  supplier: Supplier;
  t: (key: string) => string;
}) {
  const hasContact =
    !!supplier.contact_person ||
    !!supplier.phone ||
    !!supplier.email ||
    !!supplier.address ||
    !!supplier.notes;

  return (
    <SectionCard title={t("supplier.contact")} icon={Building2}>
      {!hasContact ? (
        <Text className="text-caption text-muted-foreground py-2">—</Text>
      ) : (
        <View>
          {supplier.contact_person ? (
            <LabeledRow
              icon={User}
              label={t("supplier.contactPerson")}
              value={supplier.contact_person}
            />
          ) : null}
          {supplier.phone ? (
            <Pressable
              onPress={() =>
                void Linking.openURL(
                  `tel:${supplier.phone!.replace(/\s+/g, "")}`
                )
              }
              accessibilityRole="button"
              accessibilityLabel={supplier.phone}
              className="active:opacity-80"
            >
              <LabeledRow
                icon={Phone}
                label={t("supplier.phone")}
                value={supplier.phone}
              />
            </Pressable>
          ) : null}
          {supplier.email ? (
            <Pressable
              onPress={() => void Linking.openURL(`mailto:${supplier.email}`)}
              accessibilityRole="button"
              accessibilityLabel={supplier.email}
              className="active:opacity-80"
            >
              <LabeledRow
                icon={Mail}
                label={t("supplier.email")}
                value={supplier.email}
              />
            </Pressable>
          ) : null}
          {supplier.address ? (
            <LabeledRow
              icon={MapPin}
              label={t("supplier.address")}
              value={supplier.address}
              multiline
            />
          ) : null}
          {supplier.notes ? (
            <LabeledRow
              icon={StickyNote}
              label={t("supplier.notes")}
              value={supplier.notes}
              multiline
            />
          ) : null}
        </View>
      )}
    </SectionCard>
  );
}

function PerformanceCard({
  perf,
  perfPending,
  perfDays,
  onPeriodChange,
  t,
}: {
  perf: SupplierPerformance | undefined;
  perfPending: boolean;
  perfDays: number;
  onPeriodChange: (days: number) => void;
  t: (key: string) => string;
}) {
  const periodLabel = (days: number) => {
    if (days === 7) return t("supplier.days7");
    if (days === 90) return t("supplier.days90");
    return t("supplier.days30");
  };

  return (
    <SectionCard title={t("supplier.performance")} icon={TrendingUp}>
      <View className="mb-3">
        <Text className="text-caption text-muted-foreground mb-2">
          {t("supplier.period")}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {PERF_PERIODS.map((days) => (
            <Chip
              key={days}
              label={periodLabel(days)}
              selected={perfDays === days}
              onPress={() => onPeriodChange(days)}
              variant="primary"
              size="sm"
            />
          ))}
        </View>
      </View>

      {perf ? (
        <View>
          <View className="flex-row flex-wrap gap-3">
            <Stat
              icon={ClipboardList}
              label={t("supplier.receivingsCount")}
              value={String(perf.receivings_count)}
            />
            <Stat
              icon={Truck}
              label={t("supplier.avgDeliveryDays")}
              value={
                perf.avg_lead_days != null
                  ? Number(perf.avg_lead_days).toFixed(1)
                  : "—"
              }
            />
          </View>
          <View className="mt-3 flex-row flex-wrap gap-3">
            <Stat
              icon={AlertTriangle}
              label={t("supplier.rejectRate")}
              value={`${Math.round((Number(perf.rejection_rate) || 0) * 100)}%`}
            />
            <Stat
              icon={Star}
              label={t("supplier.onTimeRate")}
              value={
                perf.on_time_rate != null
                  ? `${Math.round(Number(perf.on_time_rate) * 100)}%`
                  : "—"
              }
            />
          </View>
        </View>
      ) : (
        <View className="py-2">
          {perfPending ? (
            <Loading />
          ) : (
            <Text className="text-caption text-muted-foreground">—</Text>
          )}
        </View>
      )}
    </SectionCard>
  );
}



function LabeledRow({
  icon: Icon,
  label,
  value,
  multiline = false,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View className="flex-row items-start py-1.5">
      <View className="mt-0.5">
        <Icon size={14} color="#64748B" />
      </View>
      <View className="ml-2 flex-1 min-w-0">
        <Text className="text-caption text-muted-foreground">{label}</Text>
        <Text
          className={cn(
            "text-body text-foreground",
            !multiline && "text-mono"
          )}
          numberOfLines={multiline ? undefined : 1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-1 min-w-[120px] rounded-lg border border-border bg-background p-3">
      <View className="flex-row items-center mb-1">
        <Icon size={14} color="#64748B" />
        <Text
          className="ml-1.5 text-caption text-muted-foreground"
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Text
        className="text-h2 text-foreground text-mono font-bold"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
