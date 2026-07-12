// ============================================================
// Stock Man — Product Search
//
// Search by product name / SKU or scan a barcode, then open
// the stock detail screen for the selected item.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Stack, useRouter } from "expo-router";
import { ChevronRight, Package, ScanLine, Search, X } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { BarcodeScannerDialog } from "@/components/scanner/BarcodeScannerDialog";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useStockItems } from "@/hooks/useStockItems";
import { useStockItemLookup } from "@/hooks/useStockItemLookup";
import { useBranchStore } from "@/store/useBranchStore";
import { useToast } from "@/components/ui/Toast";
import { extractResults } from "@/types/api";
import type { StockItem } from "@/types";

const MIN_SEARCH_LEN = 2;

export default function StockSearchScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { qtyWithUnit } = useFormatters();
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);

  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const debouncedSearch = useDebouncedValue(search, 300);
  const lookup = useStockItemLookup();

  const canQuery = debouncedSearch.trim().length >= MIN_SEARCH_LEN;

  const listQuery = useStockItems(
    {
      warehouse_id: activeWarehouseId ?? undefined,
      search: debouncedSearch.trim() || undefined,
      page_size: 50,
    },
    { enabled: canQuery }
  );

  const items = useMemo(
    () => extractResults(listQuery.data) ?? [],
    [listQuery.data]
  );

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(main)/(tabs)" as any);
  }, [router]);

  const openStockDetail = useCallback(
    (item: StockItem) => {
      router.push(`/(main)/stock/${item.id}` as any);
    },
    [router]
  );

  const resolveQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      const result = await lookup.mutateAsync(trimmed);
      if (result.kind === "exact") {
        openStockDetail(result.item);
        return;
      }
      if (result.kind === "multiple") {
        setSearch(trimmed);
        return;
      }
      toast.error(t("scanner.notFound", { code: trimmed }));
    },
    [lookup, openStockDetail, t, toast]
  );

  const handleSearchSubmit = useCallback(() => {
    void resolveQuery(search);
  }, [resolveQuery, search]);

  const handleScan = useCallback(
    (code: string) => {
      setScannerActive(false);
      setScannerOpen(false);
      void resolveQuery(code).finally(() => {
        setScannerActive(true);
      });
    },
    [resolveQuery]
  );

  const renderItem = useCallback(
    ({ item }: { item: StockItem }) => (
      <Pressable
        onPress={() => openStockDetail(item)}
        accessibilityRole="button"
        accessibilityLabel={item.name}
        className="flex-row items-center px-4 py-3 border-b border-border active:bg-muted/50"
      >
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mr-3">
          <Package size={20} color="#1E40AF" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-body font-semibold text-foreground" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-caption text-mono text-muted-foreground" numberOfLines={1}>
            {item.sku}
            {item.current_quantity != null
              ? ` · ${qtyWithUnit(item.current_quantity, item.unit)}`
              : ""}
          </Text>
        </View>
        {item.is_low_stock ? (
          <Badge variant="warning" size="sm" label={t("stock.lowStockBadge")} />
        ) : null}
        <View className="ml-2">
          <ChevronRight size={18} color="#94A3B8" />
        </View>
      </Pressable>
    ),
    [openStockDetail, qtyWithUnit, t]
  );

  const listEmpty = useMemo(() => {
    if (!canQuery) {
      return (
        <EmptyState
          icon={Search}
          title={t("stock.productSearch")}
          description={t("stock.productSearchEmptyHint")}
        />
      );
    }
    if (listQuery.isPending) {
      return (
        <View className="py-12 items-center">
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      );
    }
    return (
      <EmptyState
        icon={Package}
        title={t("common.noData")}
        description={t("stock.search")}
      />
    );
  }, [canQuery, listQuery.isPending, t]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen padded={false}>
        <View className="px-4 pt-2">
          <Header
            title={t("stock.productSearch")}
            subtitle={t("stock.productSearchHint")}
            back
            onBackPress={onBack}
          />
        </View>

        <View className="px-4 py-3 border-b border-border">
          <View className="flex-row items-center gap-2">
            <View className="flex-1 flex-row items-center min-h-[48px] rounded-xl border border-input bg-background px-3">
              <Search size={18} color="#64748B" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={handleSearchSubmit}
                placeholder={t("stock.search")}
                placeholderTextColor="#94A3B8"
                className="flex-1 ml-2 text-body text-foreground py-2"
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                autoFocus
                accessibilityLabel={t("common.search")}
              />
              {search.length > 0 ? (
                <Pressable
                  onPress={() => setSearch("")}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.clear")}
                  className="p-1 rounded-md active:bg-muted"
                  hitSlop={8}
                >
                  <X size={16} color="#64748B" />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                setScannerActive(true);
                setScannerOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("stock.scanBarcode")}
              className="h-12 w-12 items-center justify-center rounded-xl bg-primary active:bg-primary/90"
            >
              <ScanLine size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <View className="flex-1">
          <FlashList
            data={canQuery ? items : []}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 32 }}
            ListEmptyComponent={listEmpty}
            keyboardShouldPersistTaps="handled"
          />
        </View>

        {lookup.isPending ? (
          <View className="absolute inset-0 items-center justify-center bg-black/20">
            <Card className="px-6 py-4">
              <ActivityIndicator size="large" color="#1E40AF" />
            </Card>
          </View>
        ) : null}
      </Screen>

      <BarcodeScannerDialog
        visible={scannerOpen}
        onRequestClose={() => setScannerOpen(false)}
        onScan={handleScan}
        active={scannerActive}
        title={t("stock.scanBarcode")}
      />
    </>
  );
}
