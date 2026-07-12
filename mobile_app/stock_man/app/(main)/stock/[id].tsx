// ============================================================
// Stock Man — Stock Detail
//
// Deep dive for a single stock item. The screen renders:
//   - Hero card: name, SKU, barcode, category, allergens
//   - "Depo Bazında Stok"  — per-warehouse levels
//   - "Son Hareketler"      — 10 most recent movements
//   - "SKT Uyarıları"       — only rendered when the item
//                             has lots that show up in the
//                             expiry-warnings feed
//
// Tablet / landscape: tek sütun ScrollView (tüm kartlar görünür).
// Phone: aynı ScrollView yapısı.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  Barcode,
  History,
  Tag,
  Warehouse as WarehouseIcon,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { ExpiryWarningRow } from "@/components/stock/ExpiryWarningRow";
import { ExpiryActionSheet } from "@/components/stock/ExpiryActionSheet";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import {
  useStockItem,
  useStockItemWarehouseLevels,
  useStockMovements,
  useFefoReportDetail,
} from "@/hooks/useStockItems";
import { useExpiryWarnings } from "@/hooks/useExpiry";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/utils/cn";
import {
  getStockMovementTypeAbbr,
  getStockMovementTypeLabel,
  stockMovementQuantityPrefix,
  stockMovementTypeBadgeClasses,
} from "@/utils/stockMovementDisplay";
import type { ExpiryWarning, StockLot, StockMovement, WarehouseStockLevel } from "@/types";

export default function StockDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params?.id;

  const { qtyWithUnit } = useFormatters();

  const itemQuery = useStockItem(id);
  const levelsQuery = useStockItemWarehouseLevels(id);
  const movementsQuery = useStockMovements({ stock_item_id: id, page_size: 10 } as any);
  const expiryQuery = useExpiryWarnings();

  const [activeWarning, setActiveWarning] = useState<ExpiryWarning | null>(null);

  const item = itemQuery.data;
  const apiLevels = useMemo(() => levelsQuery.data ?? [], [levelsQuery.data]);
  const needLotFallback =
    !!id &&
    !!item &&
    levelsQuery.isSuccess &&
    apiLevels.length === 0 &&
    (Number(item.current_quantity) || 0) > 0;
  const fefoDetailQuery = useFefoReportDetail(id, undefined, { enabled: needLotFallback });
  const levels = useMemo(() => {
    if (apiLevels.length > 0) return apiLevels;
    if (!needLotFallback || !fefoDetailQuery.data) return [];
    return aggregateLotsByWarehouse(fefoDetailQuery.data.lots ?? []);
  }, [apiLevels, fefoDetailQuery.data, needLotFallback]);
  const levelsLoading =
    levelsQuery.isPending || (needLotFallback && fefoDetailQuery.isPending);
  const levelsError = levelsQuery.isError && !needLotFallback;
  const movements = useMemo<StockMovement[]>(
    () => movementsQuery.data?.results ?? [],
    [movementsQuery.data]
  );
  const expiryWarnings = useMemo<ExpiryWarning[]>(
    () =>
      (expiryQuery.data ?? []).filter(
        (w) => w.stock_item_id === id
      ),
    [expiryQuery.data, id]
  );

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(main)/(tabs)/stock");
  }, [router]);

  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["stock-items", null, id] });
    void qc.invalidateQueries({ queryKey: ["stock-items", null, id, "warehouse-levels"] });
    void qc.invalidateQueries({ queryKey: ["fefo-report-detail", id] });
    void qc.invalidateQueries({ queryKey: ["stock-movements"] });
    void qc.invalidateQueries({ queryKey: ["expiry-warnings"] });
  }, [qc, id]);

  const isFetching =
    itemQuery.isFetching ||
    levelsQuery.isFetching ||
    fefoDetailQuery.isFetching ||
    movementsQuery.isFetching ||
    expiryQuery.isFetching;

  if (itemQuery.isPending) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Screen padded>
          <Header
            title={t("stock.detail")}
            back
            onBackPress={onBack}
          />
          <Loading fullScreen />
        </Screen>
      </>
    );
  }

  if (itemQuery.isError || !item) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Screen padded>
          <Header title={t("stock.detail")} back onBackPress={onBack} />
          <View className="mt-4">
            <Card>
              <EmptyState
                icon={AlertTriangle}
                title={t("errors.notFound")}
                description={t("common.retry")}
                actionLabel={t("common.retry")}
                onAction={() => void itemQuery.refetch()}
              />
            </Card>
          </View>
        </Screen>
      </>
    );
  }

  const totalQty = (() => {
    const q = Number(item.current_quantity) || 0;
    if (q > 0) return q;
    return levels.reduce((sum, lv) => sum + (Number(lv.quantity) || 0), 0);
  })();
  const minQty = item.effective_minimum ?? item.minimum_quantity ?? 0;
  const isLow = !!item.is_low_stock;
  const warehouseCount = levels.length;

  const refreshControl = (
    <RefreshControl
      refreshing={isFetching && !itemQuery.isPending}
      onRefresh={onRefresh}
      tintColor="#1E40AF"
    />
  );

  // ── Hero card (shared between tablet split and phone) ───────
  const heroCard = (
    <Card variant="elevated" className="mb-3">
      <View className="flex-row items-start">
        <View
          className={cn(
            "h-12 w-12 items-center justify-center rounded-xl mr-3",
            isLow ? "bg-warning/15" : "bg-primary/10"
          )}
        >
          {isLow ? (
            <AlertTriangle size={22} color="#F59E0B" />
          ) : (
            <Tag size={22} color="#1E40AF" />
          )}
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-h2 text-foreground" numberOfLines={2}>
            {item.name}
          </Text>
          <Text className="text-caption text-mono text-muted-foreground">
            {item.sku}
          </Text>
        </View>
        {isLow ? (
          <Badge variant="warning" label={t("stock.lowStockBadge")} />
        ) : null}
      </View>

      <View className="mt-3 flex-row flex-wrap gap-2">
        {item.barcode ? (
          <View className="flex-row items-center bg-muted rounded-full px-2.5 py-1">
            <Barcode size={12} color="#64748B" />
            <Text className="ml-1 text-caption text-mono text-foreground">
              {item.barcode}
            </Text>
          </View>
        ) : null}
        {item.category_name ? (
          <Badge variant="default" label={item.category_name} />
        ) : null}
        {item.allergen_names?.map((a) => (
          <Badge key={a} variant="destructive" label={a} size="sm" />
        ))}
      </View>

      <View className="mt-4 flex-row items-end justify-between">
        <View>
          <Text className="text-caption text-muted-foreground">
            {t("stock.currentQuantity")}
          </Text>
          <Text className="text-h1 text-mono font-bold text-foreground">
            {qtyWithUnit(totalQty, item.unit)}
          </Text>
          {minQty > 0 ? (
            <Text className="text-caption text-muted-foreground mt-0.5">
              {t("stock.minimumQuantity")}:{" "}
              <Text className="text-mono">
                {qtyWithUnit(minQty, item.unit)}
              </Text>
            </Text>
          ) : null}
        </View>
        {warehouseCount > 0 ? (
          <View className="items-end">
            <Text className="text-caption text-muted-foreground">
              {t("stock.warehouseCount", { count: warehouseCount }) ?? `${warehouseCount} Depo`}
            </Text>
            <Text className="text-body text-mono font-bold text-foreground mt-0.5">
              {t("stock.total")}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );

  // ── Warehouse levels section ─────────────────────────────────
  const levelsSection = (
    <SectionCard title={t("stock.warehouseStock")} icon={WarehouseIcon}>
      {levelsLoading ? (
        <View className="py-4">
          <Loading />
        </View>
      ) : levelsError ? (
        <View className="py-2">
          <Text className="text-caption text-destructive mb-2">
            {t("errors.unknown")}
          </Text>
          <Text
            className="text-caption text-primary font-semibold"
            onPress={() => void levelsQuery.refetch()}
          >
            {t("common.retry")}
          </Text>
        </View>
      ) : levels.length === 0 ? (
        <Text className="text-caption text-muted-foreground py-2">
          {t("stock.noWarehouseData") ?? "Depo verisi bulunamadı"}
        </Text>
      ) : (
        <>
          {levels.map((lv, idx) => (
            <LevelRow
              key={`${lv.warehouse_id ?? lv.warehouse ?? idx}`}
              level={lv}
              unit={item.unit}
              isLast={idx === levels.length - 1}
            />
          ))}
          <View className="flex-row items-center justify-between pt-3 mt-1 border-t border-border">
            <Text className="text-body font-bold text-foreground">
              {t("stock.total")}
            </Text>
            <Text className="text-body text-mono font-bold text-primary">
              {qtyWithUnit(totalQty, item.unit)}
            </Text>
          </View>
        </>
      )}
    </SectionCard>
  );

  // ── Expiry warnings section ─────────────────────────────────
  const expirySection =
    expiryWarnings.length > 0 ? (
      <SectionCard title="SKT Uyarıları" icon={AlertTriangle}>
        {expiryWarnings.map((w) => (
          <ExpiryWarningRow
            key={w.id}
            warning={w}
            onActionPress={() => setActiveWarning(w)}
          />
        ))}
      </SectionCard>
    ) : null;

  // ── Recent movements section ─────────────────────────────────
  const movementsSection = (
    <SectionCard title={t("stock.recentMovements")} icon={History}>
      {movements.length === 0 ? (
        <Text className="text-caption text-muted-foreground py-2">—</Text>
      ) : (
        movements.map((m, idx) => (
          <MovementMiniRow
            key={m.id}
            movement={m}
            isLast={idx === movements.length - 1}
          />
        ))
      )}
    </SectionCard>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen padded={false}>
        <View className="px-4 pt-2">
          <Header
            title={item.name}
            subtitle={item.sku}
            back
            onBackPress={onBack}
          />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator
        >
          {heroCard}
          {levelsSection}
          {expirySection}
          {movementsSection}
        </ScrollView>
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

function aggregateLotsByWarehouse(lots: StockLot[]): WarehouseStockLevel[] {
  const byWarehouse = new Map<string, WarehouseStockLevel>();

  for (const lot of lots) {
    const warehouseId = String(lot.warehouse ?? "");
    if (!warehouseId) continue;

    const qty = Number(lot.quantity) || 0;
    const existing = byWarehouse.get(warehouseId);
    if (existing) {
      existing.quantity = Number(existing.quantity) + qty;
      continue;
    }

    byWarehouse.set(warehouseId, {
      warehouse: lot.warehouse,
      warehouse_id: lot.warehouse,
      warehouse_name: lot.warehouse_name,
      quantity: qty,
      minimum_quantity: 0,
      is_low_stock: false,
    });
  }

  return [...byWarehouse.values()].sort((a, b) =>
    (a.warehouse_name ?? "").localeCompare(b.warehouse_name ?? "", "tr")
  );
}

function LevelRow({
  level,
  unit,
  isLast,
}: {
  level: WarehouseStockLevel;
  unit: string;
  isLast: boolean;
}) {
  const { qtyWithUnit } = useFormatters();
  const qty = Number(level.quantity) || 0;
  const displayUnit = level.stock_item_unit ?? unit;
  return (
    <View
      className={cn(
        "flex-row items-center py-3",
        !isLast && "border-b border-border"
      )}
    >
      <View className="flex-1 min-w-0">
        <Text className="text-body font-semibold text-foreground" numberOfLines={1}>
          {level.warehouse_name ?? level.warehouse_code ?? level.warehouse}
        </Text>
        <Text className="text-caption text-muted-foreground">
          Min: {qtyWithUnit(level.minimum_quantity, displayUnit)}
          {level.is_low_stock ? " · Düşük Stok" : ""}
        </Text>
      </View>
      <View className="flex-row items-center">
        <Text
          className={cn(
            "text-body text-mono font-bold",
            level.is_low_stock ? "text-warning" : "text-foreground"
          )}
        >
          {qtyWithUnit(qty, displayUnit)}
        </Text>
        {level.is_low_stock ? (
          <AlertTriangle
            size={14}
            color="#F59E0B"
            style={{ marginLeft: 6 }}
          />
        ) : null}
      </View>
    </View>
  );
}

function MovementMiniRow({
  movement,
  isLast,
}: {
  movement: StockMovement;
  isLast: boolean;
}) {
  const { t } = useI18n();
  const { dateTime: fmt } = useFormatters();
  const badge = stockMovementTypeBadgeClasses(movement.movement_type);
  const prefix = stockMovementQuantityPrefix(
    movement.movement_type,
    movement.quantity,
    movement.reference,
    movement.signed_quantity,
  );
  return (
    <View
      className={cn(
        "flex-row items-center py-2",
        !isLast && "border-b border-border"
      )}
    >
      <View
        className={cn(
          "h-7 w-7 items-center justify-center rounded-full mr-3",
          badge.container
        )}
      >
        <Text className={cn("text-[10px] font-bold", badge.text)}>
          {getStockMovementTypeAbbr(movement.movement_type, t)}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-body text-foreground" numberOfLines={1}>
          {getStockMovementTypeLabel(movement.movement_type, t)}
        </Text>
        <Text className="text-caption text-muted-foreground" numberOfLines={1}>
          {movement.warehouse_name ?? "—"} · {fmt(movement.created_at)}
        </Text>
      </View>
      <Text className={cn("text-body text-mono font-bold", badge.qty)}>
        {prefix}
        {movement.quantity} {movement.unit}
      </Text>
    </View>
  );
}

// Keep refs to avoid noUnusedLocals
