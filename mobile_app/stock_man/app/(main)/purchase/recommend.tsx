// ============================================================
// Stock Man — Purchase Recommendations (P2)
//
// Suggestion engine UI. The user picks:
//   - warehouse (defaults to useBranchStore.activeWarehouseId)
//   - weeks ahead (4 / 8)
//   - only_positive (recommended: only show items where the
//     recommended qty is > 0)
//
// Tapping "Hesapla" calls
//   usePurchaseOrderSuggestions({ warehouse_id, weeks, only_positive })
// which hits `POST /warehouse/purchase-orders/suggest-preview/`.
//
// Each result row has a checkbox. The bottom "Seçili
// Önerilerden PO Oluştur" button uses
//   useCommitSuggestions(...) for multi-supplier batch creation.
// (The single-PO `useSuggestPurchaseOrder` path is left for
// the wizard's "Hızlı Sipariş" entry point in a future phase.)
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { routes } from "@/navigation/routes";
import {
  Lightbulb,
  Sparkles,
  Truck,
  Warehouse,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Amount } from "@/components/ui/Amount";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useBranchStore } from "@/store/useBranchStore";
import { useToast } from "@/components/ui/Toast";
import {
  useCommitSuggestions,
  usePurchaseOrderSuggestions,
} from "@/hooks/usePurchaseOrders";
import { cn } from "@/utils/cn";
import { extractApiError } from "@/utils/apiError";
import type {
  PurchaseOrderSuggestion,
  PurchaseOrderSuggestionRequest,
  UUID,
  Warehouse as WarehouseT,
} from "@/types";

// Lightweight Checkbox component (not in UI kit yet).
function CheckboxControl({
  checked,
  onToggle,
  accessibilityLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      className={cn(
        "h-6 w-6 items-center justify-center rounded-md border-2",
        checked ? "bg-primary border-primary" : "bg-background border-input"
      )}
    >
      {checked ? <Text className="text-white text-xs font-bold">✓</Text> : null}
    </Pressable>
  );
}

export default function PurchaseRecommendScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);
  const setActiveWarehouse = useBranchStore((s) => s.setActiveWarehouse);

  const warehousesQuery = useWarehouses();
  const warehouses: WarehouseT[] = warehousesQuery.data ?? [];

  const [warehouseId, setWarehouseId] = useState<UUID | null>(
    activeWarehouseId ?? null
  );
  const [weeks, setWeeks] = useState<4 | 8>(4);
  const [onlyPositive, setOnlyPositive] = useState(true);

  // Only fire the suggestions query once the user explicitly
  // hits "Hesapla" — track that in `requestState`.
  const [requestState, setRequestState] =
    useState<PurchaseOrderSuggestionRequest | null>(null);

  const suggestionsQuery = usePurchaseOrderSuggestions(
    requestState,
    !!warehouseId
  );

  const commit = useCommitSuggestions();

  // ─── Selected tracking (Record<UUID, boolean>) ─────────────
  // Set is not safe as React state in React Native (can deserialize as
  // undefined after rapid navigation / WS push). Use a plain object instead.
  const [selected, setSelected] = useState<Record<UUID, boolean>>({});

  const suggestions: PurchaseOrderSuggestion[] = useMemo(() => {
    const data = suggestionsQuery.data;
    if (!data) return [];
    if (Array.isArray(data)) return data;
    // Olası paginated fallback (hook'un select'i devredışıysa)
    const d = data as unknown as { results?: PurchaseOrderSuggestion[] };
    return Array.isArray(d?.results) ? d.results : [];
  }, [suggestionsQuery.data]);

  const onCompute = () => {
    if (!warehouseId) {
      toast.error(t("purchase.selectWarehouse"));
      return;
    }
    if (!activeBranchId) {
      toast.error(t("branches.select"));
      return;
    }
    setRequestState({
      warehouse_id: warehouseId,
      weeks,
      only_positive: onlyPositive,
      branch_id: activeBranchId,
    });
    setSelected({});
  };

  const onToggle = useCallback((id: UUID) => {
    setSelected((prev) => {
      if (prev[id]) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: true };
    });
  }, []);

  const selectedSize = Object.keys(selected).length;

  const onSelectAll = () => {
    if (selectedSize === suggestions.length) {
      setSelected({});
    } else {
      const next: Record<UUID, boolean> = {};
      suggestions.forEach((s) => { next[s.stock_item_id] = true; });
      setSelected(next);
    }
  };

  const onCommit = () => {
    if (!warehouseId) return;
    if (selectedSize === 0) {
      toast.error(t("common.noData"));
      return;
    }
    const chosen = suggestions.filter((s) => !!selected[s.stock_item_id]);
    // Build preferred_suppliers map (stock_item_id → supplier_id)
    const preferred: Record<UUID, UUID> = {};
    chosen.forEach((c) => {
      if (c.preferred_supplier_id) {
        preferred[c.stock_item_id] = c.preferred_supplier_id;
      }
    });

    commit.mutate(
      {
        warehouse_id: warehouseId,
        items: chosen.map((c) => ({
          stock_item_id: c.stock_item_id,
          quantity: c.recommended_quantity,
          recommended_quantity: c.recommended_quantity,
        })),
        preferred_suppliers:
          Object.keys(preferred).length > 0 ? preferred : undefined,
      },
      {
        onSuccess: (pos) => {
          toast.success(t("purchase.create"));
          if (pos.length === 1 && pos[0]) {
            router.replace(routes.purchase.detail(pos[0].id));
          } else {
            router.replace(routes.purchase.list);
          }
        },
        onError: (err: unknown) => {
          toast.error(extractApiError(err, t("errors.unknown")));
        },
      }
    );
  };

  // ─── Branch gate ───────────────────────────────────────────
  if (!activeBranchId) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <Header
          title={t("purchase.suggestFromDeficiency")}
          back
          onBackPress={() => router.back()}
        />
        <Card className="mt-4">
          <View className="p-6">
            <Text className="text-body text-foreground text-center">
              {t("branches.select")}
            </Text>
            <Text className="text-caption text-muted-foreground text-center mt-2">
              {t("branches.selectHelper")}
            </Text>
          </View>
        </Card>
      </Screen>
    );
  }

  const selectedTotal = suggestions
    .filter((s) => !!selected[s.stock_item_id])
    .reduce((sum, s) => sum + (s.estimated_cost ?? 0), 0);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="px-4 pt-2">
          <Header
            title={t("purchase.suggestFromDeficiency")}
            back
            inline
            onBackPress={() => router.back()}
          />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          refreshControl={
            RefreshControl ? (
              <RefreshControl
                refreshing={suggestionsQuery.isFetching}
                onRefresh={() => suggestionsQuery.refetch?.()}
                tintColor="#1E40AF"
              />
            ) : undefined
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* Warehouse selector */}
          <Card className="mb-3">
            <View className="flex-row items-center mb-2">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
                <Warehouse size={18} color="#1E40AF" />
              </View>
              <Text className="flex-1 text-h3 text-foreground">
                {t("purchase.warehouse")}
              </Text>
            </View>
            {warehouses.length === 0 ? (
              <Loading label={t("common.loading")} />
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {warehouses.map((w) => (
                  <Chip
                    key={w.id}
                    label={w.name}
                    selected={w.id === warehouseId}
                    onPress={() => {
                      setWarehouseId(w.id);
                      void setActiveWarehouse(w.id);
                    }}
                    variant={w.id === warehouseId ? "primary" : "default"}
                    leftIcon={Warehouse}
                    size="sm"
                  />
                ))}
              </View>
            )}
          </Card>

          {/* Parameters */}
          <Card className="mb-3">
            <View className="flex-row items-center mb-2">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
                <Sparkles size={18} color="#1E40AF" />
              </View>
              <Text className="flex-1 text-h3 text-foreground">
                {t("common.filter")}
              </Text>
            </View>
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-caption text-muted-foreground mr-1">
                {t("purchase.forecastPeriod")}:
              </Text>
              {([4, 8] as const).map((w) => (
                <Chip
                  key={w}
                  label={t("purchase.lastWeeks", { count: w })}
                  selected={weeks === w}
                  onPress={() => setWeeks(w)}
                  variant={weeks === w ? "primary" : "default"}
                  size="sm"
                />
              ))}
            </View>
            <View className="mt-3 flex-row items-center">
              <CheckboxControl
                checked={onlyPositive}
                onToggle={() => setOnlyPositive((v) => !v)}
                accessibilityLabel="onlyPositive"
              />
              <Text className="ml-2 text-body text-foreground">
                {t("purchase.onlyPositive")}
              </Text>
            </View>
            <Button
              variant="primary"
              onPress={onCompute}
              leftIcon={Lightbulb}
              className="mt-3"
              fullWidth
              loading={suggestionsQuery.isFetching}
            >
              {t("common.search")}
            </Button>
          </Card>

          {/* Results — Table */}
          {requestState ? (
            <View>
              {suggestionsQuery.isPending ? (
                <Loading label={t("common.loading")} />
              ) : suggestions.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Lightbulb}
                    title={t("common.noData")}
                    description={t("purchase.suggestFromDeficiency")}
                  />
                </Card>
              ) : (
                <ScrollView
                  horizontal={true}
                  showsHorizontalScrollIndicator={true}
                  className="w-full"
                  contentContainerStyle={{ flexGrow: 1, minWidth: "100%" }}
                >
                  <View
                    style={{ minWidth: 600, width: "100%" }}
                    className="rounded-xl overflow-hidden border border-border bg-card"
                  >
                    {/* Sticky header — checkbox + sütun adları */}
                    <View className="flex-row items-center bg-muted/60 border-b border-border">
                      {/* Checkbox hüresi */}
                      <View className="w-10 shrink-0 items-center justify-center py-2">
                        <Pressable
                          onPress={onSelectAll}
                          hitSlop={10}
                          accessibilityRole="button"
                        >
                          <View
                            className={cn(
                              "h-5 w-5 rounded border-2 items-center justify-center",
                              selectedSize === suggestions.length
                                ? "bg-primary border-primary"
                                : "bg-background border-input"
                            )}
                          >
                            {selectedSize === suggestions.length ? (
                              <Text className="text-white text-[10px] font-bold">✓</Text>
                            ) : null}
                          </View>
                        </Pressable>
                      </View>
                      {/* Ürün sütun başlığı — esnek */}
                      <Text
                        className="flex-1 py-2 pl-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                        numberOfLines={1}
                      >
                        {t("purchase.table.colProduct")}
                      </Text>
                      {/* Mevcut */}
                      <Text
                        className="w-[80px] shrink-0 py-2 pr-2 text-[10px] font-bold text-muted-foreground tracking-widertext-right"
                        numberOfLines={1}
                      >
                        {t("purchase.table.colCurrent")}
                      </Text>
                      {/* Haftalık ort. */}
                      <Text
                        className="w-[72px] shrink-0 py-2 pr-2 text-[10px] font-bold text-muted-foreground tracking-widertext-right"
                        numberOfLines={1}
                      >
                        {t("purchase.table.colWeeklyAvg")}
                      </Text>
                      {/* Önerilen */}
                      <Text
                        className="w-[76px] shrink-0 py-2 pr-3 text-[10px] font-bold text-primary tracking-widertext-right"
                        numberOfLines={1}
                      >
                        {t("purchase.table.colRecommended")}
                      </Text>
                    </View>

                    {/* Satırlar */}
                    {suggestions.map((s, idx) => (
                      <SuggestionRow
                        key={s.stock_item_id}
                        suggestion={s}
                        checked={!!selected[s.stock_item_id]}
                        onToggle={() => onToggle(s.stock_item_id)}
                        isLast={idx === suggestions.length - 1}
                      />
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          ) : null}
        </ScrollView>

        {/* Bottom commit bar — only shown once we have data */}
        {requestState && suggestions.length > 0 ? (
          <View className="border-t border-border bg-card px-4 py-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-caption text-muted-foreground">
                {selectedSize} / {suggestions.length} {t("purchase.items").toLowerCase()}
              </Text>
              <Amount
                value={selectedTotal}
                minimumFractionDigits={2}
                maximumFractionDigits={2}
                className="text-body"
              />
            </View>
            <Button
              variant="primary"
              onPress={onCommit}
              loading={commit.isPending}
              disabled={commit.isPending || selectedSize === 0}
              leftIcon={Truck}
              fullWidth
            >
              {t("purchase.createOrder")}
            </Button>
          </View>
        ) : null}
      </SafeAreaView>
    </>
  );
}

function SuggestionRow({
  suggestion,
  checked,
  onToggle,
  isLast,
}: {
  suggestion: PurchaseOrderSuggestion;
  checked: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  const { qtyWithUnit } = useFormatters();

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ selected: checked }}
      className={cn(
        "flex-row items-center px-2 py-2.5 active:bg-muted/40",
        checked ? "bg-primary/5" : "bg-card",
        !isLast && "border-b border-border"
      )}
    >
      {/* Checkbox hüresi — header'la aynı w-10 */}
      <View className="w-10 shrink-0 items-center justify-center">
        <View
          className={cn(
            "h-5 w-5 rounded border-2 items-center justify-center",
            checked ? "bg-primary border-primary" : "bg-background border-input"
          )}
        >
          {checked ? (
            <Text className="text-white text-[10px] font-bold">✓</Text>
          ) : null}
        </View>
      </View>

      {/* Ürün adı + SKU + tedarikçi — flex-1 */}
      <View className="flex-1 min-w-0 pl-1 py-0.5">
        <Text
          className={cn(
            "text-[13px] font-semibold",
            checked ? "text-primary" : "text-foreground"
          )}
          numberOfLines={1}
        >
          {suggestion.stock_item_name ?? "—"}
        </Text>
        {suggestion.stock_item_sku ? (
          <Text
            className="text-[10px] text-muted-foreground font-mono"
            numberOfLines={1}
          >
            {suggestion.stock_item_sku}
          </Text>
        ) : null}
        {suggestion.preferred_supplier_name ? (
          <View className="flex-row items-center">
            <Truck size={10} color="#94A3B8" />
            <Text
              className="ml-0.5 text-[10px] text-muted-foreground"
              numberOfLines={1}
            >
              {suggestion.preferred_supplier_name}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Mevcut — w-[80px], header ile eşleşiyor */}
      <Text
        className="w-[80px] shrink-0 pr-2 text-[12px] text-foreground text-right"
        numberOfLines={1}
      >
        {qtyWithUnit(suggestion.current_quantity, suggestion.unit ?? "")}
      </Text>

      {/* Haftalık ort. — w-[72px] */}
      <Text
        className="w-[72px] shrink-0 pr-2 text-[12px] text-muted-foreground text-right"
        numberOfLines={1}
      >
        {suggestion.weekly_avg && suggestion.weekly_avg > 0
          ? qtyWithUnit(suggestion.weekly_avg, suggestion.unit ?? "")
          : "—"}
      </Text>

      {/* Önerilen — w-[76px] */}
      <View className="w-[76px] shrink-0 pr-3 items-end">
        <Text className="text-[13px] font-bold text-primary" numberOfLines={1}>
          {suggestion.recommended_quantity}
        </Text>
        {suggestion.unit ? (
          <Text className="text-[10px] text-muted-foreground">{suggestion.unit}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
