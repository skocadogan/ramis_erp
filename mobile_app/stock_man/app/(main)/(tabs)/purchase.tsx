// ============================================================
// Stock Man — Purchase Order list (P2)
//
// P1 placeholder replaced with the full PO list screen.
//   - Header: title + "Yeni" (→ /purchase/new) + "Öneriler"
//     (→ /purchase/recommend) action buttons
//   - Sticky POFilterBar (status chips + warehouse picker + search)
//   - PurchaseOrdersTable (tabular list)
//   - Empty state, pull-to-refresh
//
// Uses:
//   - usePurchaseOrders (query, list)
//   - useWarehouses    (filter bar)
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { routes } from "@/navigation/routes";
import { Plus, Sparkles } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Chip } from "@/components/ui/Chip";
import { PurchaseOrdersTable } from "@/components/purchase/PurchaseOrdersTable";
import { POFilterBar } from "@/components/purchase/POFilterBar";
import { BranchRequiredPrompt } from "@/components/branch/BranchRequiredPrompt";
import { useI18n } from "@/i18n";
import { useInfinitePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useBranchStore } from "@/store/useBranchStore";
import { extractResults } from "@/types/api";
import type { PurchaseOrderFilters } from "@/services/purchaseOrderService";

export default function PurchaseListScreen() {
  const { t } = useI18n();
  const router = useRouter();

  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);

  // Seed the warehouse filter with the active warehouse on first
  // render so the list isn't empty when the user lands on the
  // tab. The filter stays under the user's control afterwards.
  const [filters, setFilters] = useState<PurchaseOrderFilters>(() => ({
    page: 1,
    page_size: 50,
    warehouse_id: activeWarehouseId ?? undefined,
  }));

  const query = useInfinitePurchaseOrders(filters);
  const warehousesQuery = useWarehouses();
  const warehouses = useMemo(
    () => warehousesQuery.data ?? [],
    [warehousesQuery.data]
  );

  const orders = useMemo(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => extractResults(page) ?? []);
  }, [query.data]);

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  const isRefreshing = query.isFetching && !query.isFetchingNextPage;
  const showTable = !query.isPending && orders.length > 0;

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const onAdd = useCallback(() => {
    router.push(routes.purchase.new);
  }, [router]);

  const onRecommend = useCallback(() => {
    router.push(routes.purchase.recommend);
  }, [router]);

  // ─── Branch gate ───────────────────────────────────────────
  if (!activeBranchId) {
    return (
      <BranchRequiredPrompt
        title={t("purchase.title")}
        subtitle={t("purchase.list")}
        icon={Plus}
      />
    );
  }

  // ─── Render ────────────────────────────────────────────────
  return (
    <Screen
      padded={false}
      scroll={!showTable}
      refreshControl={
        !showTable
          ? {
              refreshing: isRefreshing,
              onRefresh,
            }
          : undefined
      }
    >
      <View className="px-4 pt-2">
        <Header
          title={t("purchase.title")}
          subtitle={t("purchase.list")}
          right={
            <View className="flex-row items-center gap-1.5">
              <Pressable
                onPress={onRecommend}
                accessibilityRole="button"
                accessibilityLabel={t("purchase.suggestFromDeficiency")}
                className="h-10 px-3 flex-row items-center rounded-full bg-warning/15 active:bg-warning/25"
                hitSlop={8}
              >
                <Sparkles size={16} color="#F59E0B" />
                <Text className="ml-1 text-caption font-semibold text-warning">
                  {t("purchase.suggestFromDeficiency")}
                </Text>
              </Pressable>
              <Pressable
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel={t("purchase.new")}
                className="h-10 w-10 items-center justify-center rounded-full bg-primary active:bg-primary/90"
                hitSlop={8}
              >
                <Plus size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          }
        />
      </View>

      <View className="pt-2">
        <POFilterBar
          filters={filters}
          onChange={setFilters}
          warehouses={warehouses}
        />
      </View>

      <View className="flex-row items-center justify-between px-4 pt-1 pb-2">
        <Text className="text-caption text-muted-foreground">
          {isRefreshing ? t("common.loading") : `${orders.length} ${t("purchase.title").toLowerCase()}`}
        </Text>
        {(filters.search ||
          filters.status ||
          filters.warehouse_id ||
          filters.supplier_id) ? (
          <Chip
            label={t("common.clear")}
            onPress={() =>
              setFilters({ page: 1, page_size: 50, warehouse_id: activeWarehouseId ?? undefined })
            }
            size="sm"
            variant="default"
          />
        ) : null}
      </View>

      <View className="flex-1">
        {query.isPending ? (
          <Loading />
        ) : orders.length === 0 ? (
          <View className="px-4">
            <Card>
              <EmptyState
                icon={Plus}
                title={t("common.noData")}
                description={t("purchase.list")}
                actionLabel={t("purchase.new")}
                onAction={onAdd}
              />
            </Card>
          </View>
        ) : (
          <PurchaseOrdersTable
            orders={orders}
            onEndReached={loadMore}
            isFetchingNextPage={query.isFetchingNextPage}
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        )}
      </View>
    </Screen>
  );
}
