// ============================================================
// Stock Man — Deficiency Report Filter Bar
//
// Sticky filter strip for the deficiency list. Composes:
//   - horizontal scroll of status `Chip`s (Tümü + 7 statuses)
//   - search `Input` row below
//
// All state is lifted — this component is a pure controlled
// view. The parent owns the filter object and updates the
// React Query key on every change.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { ChefHat, Search, X } from "lucide-react-native";
import { Chip } from "@/components/ui/Chip";
import { KitchenStationPicker } from "@/components/deficiency/KitchenStationPicker";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { DeficiencyStatus, KitchenStation } from "@/types";
import type { DeficiencyFilters } from "@/services/deficiencyReportService";

export interface DeficiencyFilterBarProps {
  filters: DeficiencyFiltersWithSearch;
  onChange: (next: DeficiencyFiltersWithSearch) => void;
  kitchenStations?: KitchenStation[];
  className?: string;
}

/**
 * Local extension of the service's `DeficiencyFilters` to
 * include a free-text `search` field for the filter bar.
 * The backend's serializer ignores unknown query params,
 * so this is client-side only for now (mirrors the
 * `PurchaseOrderFilters` pattern in `purchaseOrderService`).
 */
export type DeficiencyFiltersWithSearch = DeficiencyFilters & {
  search?: string;
};

const STATUSES: (DeficiencyStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "PENDING",
  "APPROVED",
  "ORDERED",
  "PARTIALLY_COMMITTED",
  "COMMITTED",
  "CANCELLED",
];

export function DeficiencyFilterBar({
  filters,
  onChange,
  kitchenStations = [],
  className,
}: DeficiencyFilterBarProps) {
  const { t } = useI18n();
  const [stationPickerOpen, setStationPickerOpen] = useState(false);

  const activeStatus =
    (filters.status as DeficiencyStatus | "ALL" | undefined) ?? "ALL";

  const selectedStation = useMemo(
    () =>
      kitchenStations.find((s) => s.id === filters.kitchen_station_id) ?? null,
    [kitchenStations, filters.kitchen_station_id]
  );

  const onSelectStatus = useCallback(
    (s: DeficiencyStatus | "ALL") => {
      onChange({ ...filters, status: s === "ALL" ? undefined : s });
    },
    [filters, onChange]
  );

  return (
    <View className={cn("pb-2", className)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {STATUSES.map((s) => {
          const labelKey =
            s === "ALL"
              ? "common.all"
              : s === "PARTIALLY_COMMITTED"
                ? "deficiency.statusLabels.partiallyCommitted"
                : s === "DRAFT"
                  ? "deficiency.statusLabels.draft"
                  : s === "PENDING"
                    ? "deficiency.statusLabels.pending"
                    : s === "APPROVED"
                      ? "deficiency.statusLabels.approved"
                      : s === "ORDERED"
                        ? "deficiency.statusLabels.ordered"
                        : s === "COMMITTED"
                          ? "deficiency.statusLabels.committed"
                          : "deficiency.statusLabels.cancelled";
          return (
            <Chip
              key={s}
              label={t(labelKey)}
              selected={activeStatus === s}
              onPress={() => onSelectStatus(s)}
              size="sm"
              variant={activeStatus === s ? "primary" : "default"}
            />
          );
        })}
        <Chip
          label={
            selectedStation
              ? selectedStation.name
              : t("deficiency.allKitchenStations")
          }
          selected={!!selectedStation}
          onPress={() => setStationPickerOpen(true)}
          leftIcon={ChefHat}
          variant="default"
          size="sm"
        />
      </ScrollView>

      <KitchenStationPicker
        visible={stationPickerOpen}
        value={filters.kitchen_station_id ?? null}
        allowClear
        onClear={() => onChange({ ...filters, kitchen_station_id: undefined })}
        onSelect={(station) => {
          onChange({ ...filters, kitchen_station_id: station.id });
          setStationPickerOpen(false);
        }}
        onClose={() => setStationPickerOpen(false)}
      />

      <View className="px-4 mt-2">
        <View className="flex-row items-center min-h-[48px] rounded-xl border border-input bg-background px-3">
          <Search size={18} color="#64748B" />
          <TextInput
            value={filters.search ?? ""}
            onChangeText={(text) =>
              onChange({ ...filters, search: text || undefined })
            }
            placeholder={t("common.searchPlaceholder")}
            placeholderTextColor="#94A3B8"
            className="flex-1 ml-2 text-body text-foreground py-2"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={t("common.search")}
          />
          {filters.search ? (
            <Pressable
              onPress={() => onChange({ ...filters, search: undefined })}
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
    </View>
  );
}

