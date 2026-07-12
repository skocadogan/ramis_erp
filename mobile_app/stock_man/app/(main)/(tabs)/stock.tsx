// ============================================================
// Stock Man — Stock list (P1)
//
// Primary "Stok" tab. Two-pane on tablets (filters left, list
// right) and a single stacked column on phones. The list uses
// FlashList for virtualised rendering; the filter bar is
// sticky and re-issues queries through the React Query cache.
//
// Add button in the header is currently a placeholder — it
// navigates to `/stock/new` which doesn't exist yet; the
// press is silently allowed and will be a no-op until the
// create flow is added in P2.
// ============================================================

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus, Search } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StockFiltersBar, type StockStatusFilter } from "@/components/stock/StockFiltersBar";
import { StockCategoryTree } from "@/components/stock/StockCategoryTree";
import { StockItemsTable } from "@/components/stock/StockItemsTable";
import { BranchSelectorBar } from "@/components/branch/BranchSelectorBar";
import { BranchRequiredPrompt } from "@/components/branch/BranchRequiredPrompt";
import { BarcodeScannerDialog } from "@/components/scanner/BarcodeScannerDialog";
import { useI18n } from "@/i18n";
import { useResponsive } from "@/hooks/useResponsive";
import { useInfiniteStockItems, useStockCategories, type StockItemFilters } from "@/hooks/useStockItems";
import { useBranchStore } from "@/store/useBranchStore";
import { extractResults } from "@/types/api";
import { useBarcodeLookup } from "@/data/p5";

export default function StockScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { isTablet } = useResponsive();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);

  const [filters, setFilters] = useState<StockItemFilters>({
    page: 1,
    page_size: 50,
  } as StockItemFilters);
  const [status, setStatus] = useState<StockStatusFilter>("all");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const scannerLookupRef = useRef(0);

  const lookup = useBarcodeLookup();

  const effectiveFilters = useMemo<StockItemFilters>(
    () => ({
      ...filters,
      warehouse_id: activeWarehouseId ?? undefined,
    }),
    [filters, activeWarehouseId]
  );

  const list = useInfiniteStockItems(effectiveFilters);
  const categoriesQuery = useStockCategories();
  const categories = useMemo(
    () => extractResults(categoriesQuery.data) ?? [],
    [categoriesQuery.data]
  );

  const results = useMemo(() => {
    if (!list.data) return [];
    return list.data.pages.flatMap((page) => extractResults(page) ?? []);
  }, [list.data]);

  const loadMore = useCallback(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) {
      void list.fetchNextPage();
    }
  }, [list]);

  const onRefresh = useCallback(() => {
    void list.refetch();
  }, [list]);

  const onAdd = useCallback(() => {
    router.push("/(main)/stock/new");
  }, [router]);

  const handleOpenScanner = useCallback(() => {
    setScannerOpen(true);
    setScannerActive(true);
    setScannerMessage(null);
  }, []);

  const handleCloseScanner = useCallback(() => {
    scannerLookupRef.current += 1;
    setScannerOpen(false);
    setScannerMessage(null);
  }, []);

  const handleBarcodeScanned = useCallback(
    (code: string, _type: string) => {
      const generation = ++scannerLookupRef.current;
      setScannerActive(false);

      lookup.mutateAsync(code).then(
        (res) => {
          if (generation !== scannerLookupRef.current) return;
          if (res.kind === "stock_item" && res.item?.name) {
            setFilters((prev) => ({ ...prev, search: res.item.name, page: 1 }));
            setScannerOpen(false);
          } else if (res.kind === "multiple" && res.results?.length) {
            const firstItem = res.results[0];
            if (firstItem && "name" in firstItem && firstItem.name) {
              setFilters((prev) => ({ ...prev, search: firstItem.name, page: 1 }));
              setScannerOpen(false);
            } else {
              setScannerMessage(t("scanner.notFound", { code }) ?? `Ürün bulunamadı: ${code}`);
            }
          } else {
            setScannerMessage(t("scanner.notFound", { code }) ?? `Ürün bulunamadı: ${code}`);
          }
        },
        () => {
          if (generation !== scannerLookupRef.current) return;
          setScannerMessage(t("scanner.notFound", { code }) ?? `Ürün bulunamadı: ${code}`);
        }
      );
    },
    [lookup, t]
  );

  const handleScanAgain = useCallback(() => {
    setScannerActive(true);
    setScannerMessage(null);
  }, []);

  // Empty-state for users without a branch selected
  if (!activeBranchId) {
    return (
      <BranchRequiredPrompt
        title={t("stock.title")}
        subtitle={t("stock.list")}
        icon={Search}
      />
    );
  }

  if (!activeWarehouseId) {
    return (
      <Screen padded>
        <Header title={t("stock.title")} subtitle={t("stock.list")} />
        <View className="mt-4">
          <BranchSelectorBar />
          <Card className="mt-3">
            <EmptyState
              icon={Search}
              title={t("purchase.selectWarehouse")}
              description={t("branches.selectHelper")}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  // Filters panel content (shared between sidebar and stacked layouts)
  const filtersPanel = (
    <View className="p-3">
      <BranchSelectorBar />
      <View className="mt-3">
        <StockFiltersBar
          filters={filters}
          onChange={setFilters}
          status={status}
          onStatusChange={setStatus}
          onBarcodeScan={handleOpenScanner}
        />
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-caption text-muted-foreground">
          {list.isFetching
            ? t("common.loading")
            : `${results.length} ${t("stock.title").toLowerCase()}`}
        </Text>
        {(filters.search || filters.category_id || status !== "all") && (
          <Chip
            label={t("common.clear")}
            onPress={() => {
              setFilters({ page: 1, page_size: 50 } as StockItemFilters);
              setStatus("all");
            }}
            size="sm"
            variant="default"
          />
        )}
      </View>
      <StockCategoryTree
        categories={categories}
        selectedId={filters.category_id ?? null}
        onSelect={(id) =>
          setFilters((prev) => ({
            ...prev,
            category_id: id ?? undefined,
            page: 1,
          }))
        }
        maxHeight={isTablet ? 320 : 200}
      />
    </View>
  );

  const listContent = (
    <View className="flex-1">
      {list.isPending ? (
        <Loading />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("common.noData")}
          description={t("stock.search")}
        />
      ) : (
        <StockItemsTable
          items={results}
          onEndReached={loadMore}
          isFetchingNextPage={list.isFetchingNextPage}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );

  return (
    <>
    <Screen
      padded={false}
      refreshControl={{
        refreshing: list.isFetching && !list.isFetchingNextPage,
        onRefresh: onRefresh,
      }}
    >
      <View className="px-4 pt-2">
        <Header
          title={t("stock.title")}
          subtitle={t("stock.list")}
          right={
            <Pressable
              onPress={onAdd}
              accessibilityRole="button"
              accessibilityLabel={t("stock.add")}
              className="h-10 w-10 items-center justify-center rounded-full bg-primary active:bg-primary/90"
              hitSlop={8}
            >
              <Plus size={20} color="#FFFFFF" />
            </Pressable>
          }
        />
      </View>

      {isTablet ? (
        <View className="flex-1 flex-row">
          <View className="w-[30%] border-r border-border bg-card">
            {filtersPanel}
          </View>
          <View className="flex-1">{listContent}</View>
        </View>
      ) : (
        <View className="flex-1">
          <View className="px-4 pt-2">{filtersPanel}</View>
          {listContent}
        </View>
      )}
    </Screen>

      <BarcodeScannerDialog
        visible={scannerOpen}
        onRequestClose={handleCloseScanner}
        onScan={handleBarcodeScanned}
        active={scannerActive}
        title={t("scanner.title")}
        footer={
          scannerMessage ? (
            <View className="px-4 py-4">
              <View className="items-center mb-4">
                <Text className="text-destructive text-body font-bold mb-1 text-center">
                  {scannerMessage}
                </Text>
                <Text className="text-muted-foreground text-caption text-center">
                  {t("scanner.tryAgain") ?? "Yeniden taramayı deneyin"}
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={handleScanAgain}
                  className="flex-1 bg-primary h-11 rounded-xl items-center justify-center active:bg-primary/90"
                >
                  <Text className="text-white font-bold">
                    {t("scanner.scanAgain") ?? "Yeniden Tara"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleCloseScanner}
                  className="flex-1 bg-secondary border border-border h-11 rounded-xl items-center justify-center active:bg-muted"
                >
                  <Text className="text-foreground font-bold">
                    {t("common.close")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null
        }
      />
    </>
  );
}
