// ============================================================
// Stock Man — Stock Filters Bar
//
// Status chips + product search input.
// Category filtering lives in `StockCategoryTree`.
// ============================================================

import React, { useCallback } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { ScanLine, Search, X } from "lucide-react-native";
import { Chip } from "@/components/ui/Chip";
import { useI18n } from "@/i18n";
import type { StockItemFilters } from "@/hooks/useStockItems";

export type StockStatusFilter =
  | "all"
  | "low"
  | "critical"
  | "normal"
  | "warning";

export interface StockFiltersBarProps {
  filters: StockItemFilters;
  onChange: (f: StockItemFilters) => void;
  status?: StockStatusFilter;
  onStatusChange?: (s: StockStatusFilter) => void;
  onBarcodeScan?: () => void;
}

const STATUS_ORDER: { value: StockStatusFilter; i18nKey: string }[] = [
  { value: "all", i18nKey: "common.all" },
  { value: "low", i18nKey: "stock.lowStockBadge" },
  { value: "critical", i18nKey: "common.warning" },
  { value: "normal", i18nKey: "common.success" },
];

export function StockFiltersBar({
  filters,
  onChange,
  status = "all",
  onStatusChange,
  onBarcodeScan,
}: StockFiltersBarProps) {
  const { t } = useI18n();

  const applyStatus = useCallback(
    (s: StockStatusFilter) => {
      onStatusChange?.(s);
      const next: StockItemFilters = { ...filters };
      delete next.is_low_stock;
      delete next.stock_status;
      if (s === "low") next.is_low_stock = true;
      if (s === "critical") next.stock_status = "critical";
      if (s === "warning") next.stock_status = "warning";
      if (s === "normal") next.stock_status = "normal";
      onChange(next);
    },
    [filters, onChange, onStatusChange]
  );

  const [prevSearch, setPrevSearch] = React.useState(filters.search);
  const [localSearch, setLocalSearch] = React.useState(filters.search ?? "");

  if (filters.search !== prevSearch) {
    setPrevSearch(filters.search);
    setLocalSearch(filters.search ?? "");
  }

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.search ?? "") !== localSearch) {
        onChange({ ...filters, search: localSearch || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, onChange, filters]);

  const onClearSearch = useCallback(() => {
    setLocalSearch("");
    onChange({ ...filters, search: undefined });
  }, [filters, onChange]);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}
        keyboardShouldPersistTaps="handled"
      >
        {STATUS_ORDER.map((s) => (
          <View key={s.value} className="mr-2">
            <Chip
              label={t(s.i18nKey)}
              selected={status === s.value}
              onPress={() => applyStatus(s.value)}
              variant={
                s.value === "critical"
                  ? "destructive"
                  : s.value === "low"
                  ? "warning"
                  : "default"
              }
            />
          </View>
        ))}
      </ScrollView>

      <View className="mt-2 flex-row items-center min-h-[48px] rounded-xl border border-input bg-background px-3">
        <Search size={18} color="#64748B" />
        <TextInput
          value={localSearch}
          onChangeText={setLocalSearch}
          placeholder={t("stock.search")}
          placeholderTextColor="#94A3B8"
          accessibilityLabel={t("common.search")}
          className="flex-1 ml-2 text-body text-foreground py-2"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {onBarcodeScan ? (
          <Pressable
            onPress={onBarcodeScan}
            accessibilityRole="button"
            accessibilityLabel={t("stock.scanBarcode")}
            className="p-1.5 rounded-md active:bg-muted mr-1"
            hitSlop={8}
          >
            <ScanLine size={18} color="#1E40AF" />
          </Pressable>
        ) : null}
        {localSearch ? (
          <Pressable
            onPress={onClearSearch}
            accessibilityRole="button"
            accessibilityLabel={t("common.clear")}
            className="p-1 rounded-md active:bg-muted"
            hitSlop={8}
          >
            <X size={16} color="#64748B" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

