// ============================================================
// Stock Man — Transfer list (P3)
//
// Full transfer list screen. P1's "coming soon" placeholder
// is replaced with:
//   - Header: title + "Yeni" (→ /transfer/new) action
//   - Sticky TransferFilterBar (status chips + warehouse picker
//     + search)
//   - TransfersTable (tabular list)
//   - Empty state, pull-to-refresh
//
// Uses:
//   - useTransfers   (query, list)
//   - useWarehouses  (filter bar)
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Chip } from "@/components/ui/Chip";
import { TransfersTable } from "@/components/transfer/TransfersTable";
import { TransferFilterBar } from "@/components/transfer/TransferFilterBar";
import { BranchRequiredPrompt } from "@/components/branch/BranchRequiredPrompt";
import { useI18n } from "@/i18n";
import { useInfiniteTransfers } from "@/hooks/useTransfers";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useBranchStore } from "@/store/useBranchStore";
import { extractResults } from "@/types/api";
import type { TransferFilters } from "@/services/transferService";

export default function TransferListScreen() {
  const { t } = useI18n();
  const router = useRouter();

  const activeBranchId = useBranchStore((s) => s.activeBranchId);

  // Seed the warehouse filter with the active warehouse on
  // first render so the list isn't empty when the user lands
  // on the tab. The filter stays under the user's control
  // afterwards.
  const [filters, setFilters] = useState<TransferFilters>(() => ({
    page: 1,
    page_size: 50,
  }));

  const query = useInfiniteTransfers(filters);
  const warehousesQuery = useWarehouses();
  const warehouses = useMemo(
    () => warehousesQuery.data ?? [],
    [warehousesQuery.data]
  );

  const transfers = useMemo(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => extractResults(page) ?? []);
  }, [query.data]);

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const onAdd = useCallback(() => {
    router.push("/(main)/transfer/new" as any);
  }, [router]);

  // ─── Branch gate ───────────────────────────────────────────
  if (!activeBranchId) {
    return (
      <BranchRequiredPrompt
        title={t("transfer.title")}
        subtitle={t("transfer.list")}
        icon={Plus}
      />
    );
  }

  // ─── Render ────────────────────────────────────────────────
  return (
    <Screen
      padded={false}
      refreshControl={{
        refreshing: query.isFetching && !query.isFetchingNextPage,
        onRefresh: onRefresh,
      }}
    >
      <View className="px-4 pt-2">
        <Header
          title={t("transfer.title")}
          subtitle={t("transfer.list")}
          right={
            <Pressable
              onPress={onAdd}
              accessibilityRole="button"
              accessibilityLabel={t("transfer.new")}
              className="h-10 w-10 items-center justify-center rounded-full bg-primary active:bg-primary/90"
              hitSlop={8}
            >
              <Plus size={20} color="#FFFFFF" />
            </Pressable>
          }
        />
      </View>

      <View className="pt-2">
        <TransferFilterBar
          filters={filters}
          onChange={setFilters}
          warehouses={warehouses}
        />
      </View>

      <View className="flex-row items-center justify-between px-4 pt-1 pb-2">
        <Text className="text-caption text-muted-foreground">
          {query.isFetching && !query.isFetchingNextPage
            ? t("common.loading")
            : `${transfers.length} ${t("transfer.title").toLowerCase()}`}
        </Text>
        {filters.search ||
        filters.status ||
        filters.source_warehouse_id ||
        filters.target_warehouse_id ? (
          <Chip
            label={t("common.clear")}
            onPress={() =>
              setFilters({ page: 1, page_size: 50 })
            }
            size="sm"
            variant="default"
          />
        ) : null}
      </View>

      <View className="flex-1">
        {query.isPending ? (
          <Loading />
        ) : transfers.length === 0 ? (
          <View className="px-4">
            <Card>
              <EmptyState
                icon={Plus}
                title={t("common.noData")}
                description={t("transfer.list")}
                actionLabel={t("transfer.new")}
                onAction={onAdd}
              />
            </Card>
          </View>
        ) : (
          <TransfersTable
            transfers={transfers}
            onEndReached={loadMore}
            isFetchingNextPage={query.isFetchingNextPage}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        )}
      </View>
    </Screen>
  );
}
