// ============================================================
// Stock Man — Deficiency Reports List
//
// Transfer listesi ile aynı layout: filtre çubuğu + sanallaştırılmış
// tablo + infinite scroll + pull-to-refresh.
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
import {
  DeficiencyFilterBar,
  type DeficiencyFiltersWithSearch,
} from "@/components/deficiency/DeficiencyFilterBar";
import { DeficiencyReportsTable } from "@/components/deficiency/DeficiencyReportsTable";
import { DeficiencyCreatedBanner } from "@/components/deficiency/DeficiencyCreatedBanner";
import { BranchRequiredPrompt } from "@/components/branch/BranchRequiredPrompt";
import { useI18n } from "@/i18n";
import { useInfiniteDeficiencyReports } from "@/hooks/useDeficiencyReports";
import { useKitchenStations } from "@/hooks/useKitchenStations";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useBranchStore } from "@/store/useBranchStore";
import { usePermission } from "@/hooks/usePermission";
import { extractResults } from "@/types/api";
import type { DeficiencyReport } from "@/types";

export default function DeficiencyListScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const canView = usePermission("warehouse.view_deficiency_report");
  const canManage = usePermission("warehouse.manage_deficiency_report");

  const [filters, setFilters] = useState<DeficiencyFiltersWithSearch>(() => ({
    page: 1,
    page_size: 50,
  }));

  const debouncedSearch = useDebouncedValue(filters.search ?? "", 300);
  const stationsQuery = useKitchenStations();
  const kitchenStations = useMemo(
    () => stationsQuery.data ?? [],
    [stationsQuery.data]
  );

  const query = useInfiniteDeficiencyReports({
    status: filters.status,
    kitchen_station_id: filters.kitchen_station_id,
    page_size: filters.page_size ?? 50,
  });

  const allReports = useMemo(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => extractResults(page) ?? []);
  }, [query.data]);

  const reports = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return allReports;
    return allReports.filter(
      (r) =>
        r.report_number.toLowerCase().includes(q) ||
        (r.kitchen_station_name ?? "").toLowerCase().includes(q)
    );
  }, [allReports, debouncedSearch]);

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const onAdd = useCallback(() => {
    router.push("/(main)/deficiency/new" as any);
  }, [router]);

  if (!activeBranchId) {
    return (
      <BranchRequiredPrompt
        title={t("deficiency.title")}
        subtitle={t("deficiency.list")}
        icon={Plus}
      />
    );
  }

  if (!canView) {
    return (
      <Screen padded>
        <Header title={t("deficiency.title")} subtitle={t("deficiency.list")} />
        <Card className="mt-4">
          <Text className="text-body text-muted-foreground text-center py-6">
            {t("errors.forbidden")}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      refreshControl={{
        refreshing: query.isFetching && !query.isFetchingNextPage,
        onRefresh: onRefresh,
      }}
    >
      <DeficiencyCreatedBanner style={{ top: 56 }} />

      <View className="px-4 pt-2">
        <Header
          title={t("deficiency.title")}
          subtitle={t("deficiency.list")}
          right={
            canManage ? (
              <Pressable
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel={t("deficiency.new")}
                className="h-10 w-10 items-center justify-center rounded-full bg-primary active:bg-primary/90"
                hitSlop={8}
              >
                <Plus size={20} color="#FFFFFF" />
              </Pressable>
            ) : undefined
          }
        />
      </View>

      <View className="pt-2">
        <DeficiencyFilterBar
          filters={filters}
          onChange={setFilters}
          kitchenStations={kitchenStations}
        />
      </View>

      <View className="flex-row items-center justify-between px-4 pt-1 pb-2">
        <Text className="text-caption text-muted-foreground">
          {query.isFetching && !query.isFetchingNextPage
            ? t("common.loading")
            : `${reports.length} ${t("deficiency.title").toLowerCase()}`}
        </Text>
        {filters.search || filters.status || filters.kitchen_station_id ? (
          <Chip
            label={t("common.clear")}
            onPress={() => setFilters({ page: 1, page_size: 50 })}
            size="sm"
            variant="default"
          />
        ) : null}
      </View>

      <View className="flex-1">
        {query.isPending ? (
          <Loading />
        ) : reports.length === 0 ? (
          <View className="px-4">
            <Card>
              <EmptyState
                icon={Plus}
                title={t("common.noData")}
                description={t("deficiency.list")}
                actionLabel={canManage ? t("deficiency.new") : undefined}
                onAction={canManage ? onAdd : undefined}
              />
            </Card>
          </View>
        ) : (
          <DeficiencyReportsTable
            reports={reports as DeficiencyReport[]}
            onEndReached={loadMore}
            isFetchingNextPage={query.isFetchingNextPage}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        )}
      </View>
    </Screen>
  );
}
