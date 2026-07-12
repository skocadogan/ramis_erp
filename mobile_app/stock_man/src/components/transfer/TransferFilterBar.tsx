// ============================================================
// Stock Man — Transfer Filter Bar
//
// Sticky filter strip for the WarehouseTransfer list:
//   - horizontal scroll of status `Chip`s
//   - warehouse picker `Chip` (matches EITHER source or target)
//   - search `Input` row below
//
// All state is lifted — this component is a pure controlled
// view. The parent owns the filter object and updates the
// React Query key on every change.
//
// Mirrors POFilterBar's UX for visual consistency.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, ChevronDown, Search, Warehouse, X } from "lucide-react-native";
import { Chip } from "@/components/ui/Chip";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { TransferStatus, UUID, Warehouse as WarehouseT } from "@/types";
import type { TransferFilters } from "@/services/transferService";

import { transferStatusLabelKey } from "@/utils/transferStatusLabel";

export interface TransferFilterBarProps {
  filters: TransferFilters;
  onChange: (next: TransferFilters) => void;
  warehouses?: WarehouseT[];
  className?: string;
}

const STATUSES: (TransferStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "PENDING",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELLED",
];

export function TransferFilterBar({ filters, onChange, warehouses, className }: TransferFilterBarProps) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeStatus = (filters.status as TransferStatus | "ALL" | undefined) ?? "ALL";

  const onSelectStatus = useCallback(
    (s: TransferStatus | "ALL") => {
      onChange({ ...filters, status: s === "ALL" ? undefined : s });
    },
    [filters, onChange]
  );

  // The "warehouse filter" matches EITHER source or target.
  // We surface the source/target depending on which is set
  // so the user can see which side their selection is on.
  const selectedWarehouse = useMemo(() => {
    const id = filters.source_warehouse_id ?? filters.target_warehouse_id;
    return warehouses?.find((w) => w.id === id) ?? null;
  }, [warehouses, filters.source_warehouse_id, filters.target_warehouse_id]);

  const onSelectWarehouse = useCallback(
    (id: UUID | null) => {
      // Apply the selection to BOTH source_warehouse_id and
      // target_warehouse_id so the OR filter matches the row.
      onChange({
        ...filters,
        source_warehouse_id: id ?? undefined,
        target_warehouse_id: id ?? undefined,
      });
      setPickerOpen(false);
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
        {STATUSES.map((s) => (
          <Chip
            key={s}
            label={
              s === "ALL"
                ? t("common.all")
                : t(
                    `transfer.statusLabels.${transferStatusLabelKey(s)}` as any
                  )
            }
            selected={activeStatus === s}
            onPress={() => onSelectStatus(s)}
            size="sm"
            variant={activeStatus === s ? "primary" : "default"}
          />
        ))}

        {warehouses && warehouses.length > 0 ? (
          <Chip
            label={selectedWarehouse ? selectedWarehouse.name : t("purchase.warehouse")}
            selected={!!selectedWarehouse}
            onPress={() => setPickerOpen(true)}
            size="sm"
            variant={selectedWarehouse ? "primary" : "default"}
            leftIcon={Warehouse}
            rightIcon={ChevronDown}
          />
        ) : null}
      </ScrollView>

      <View className="px-4 mt-2">
        <View className="flex-row items-center min-h-[48px] rounded-xl border border-input bg-background px-3">
          <Search size={18} color="#64748B" />
          <TextInput
            value={filters.search ?? ""}
            onChangeText={(text) => onChange({ ...filters, search: text || undefined })}
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

      {/* Warehouse picker modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          onPress={() => setPickerOpen(false)}
          className="flex-1 justify-end bg-black/60"
          accessibilityLabel="warehouse-picker-dismiss"
        >
          <Pressable
            onPress={() => {}}
            className="bg-card border-t border-border rounded-t-2xl max-h-[70%]"
          >
            <View className="flex-row items-center px-4 py-3 border-b border-border">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
                <Warehouse size={20} color="#1E40AF" />
              </View>
              <Text className="flex-1 text-h3 text-foreground">
                {t("purchase.warehouse")}
              </Text>
              <Pressable
                onPress={() => setPickerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
                hitSlop={8}
              >
                <X size={20} color="#64748B" />
              </Pressable>
            </View>

            <Pressable
              onPress={() => onSelectWarehouse(null)}
              accessibilityRole="button"
              className={cn(
                "flex-row items-center px-4 py-3 border-b border-border active:opacity-80",
                !selectedWarehouse && "bg-primary/10"
              )}
            >
              <Text
                className={cn(
                  "flex-1 text-body font-semibold",
                  !selectedWarehouse ? "text-primary" : "text-foreground"
                )}
              >
                {t("common.all")}
              </Text>
              {!selectedWarehouse ? <Check size={20} color="#1E40AF" /> : null}
            </Pressable>

            <ScrollView keyboardShouldPersistTaps="handled">
              {warehouses?.map((w) => {
                const selected = w.id === selectedWarehouse?.id;
                return (
                  <Pressable
                    key={w.id}
                    onPress={() => onSelectWarehouse(w.id)}
                    accessibilityRole="button"
                    className={cn(
                      "flex-row items-center px-4 py-3 border-b border-border active:opacity-80",
                      selected && "bg-primary/10"
                    )}
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-muted mr-3">
                      <Warehouse size={18} color="#64748B" />
                    </View>
                    <View className="flex-1">
                      <Text
                        className={cn(
                          "text-body font-semibold",
                          selected ? "text-primary" : "text-foreground"
                        )}
                        numberOfLines={1}
                      >
                        {w.name}
                      </Text>
                      {w.code ? (
                        <Text
                          className="text-caption text-muted-foreground"
                          numberOfLines={1}
                        >
                          {w.code}
                        </Text>
                      ) : null}
                    </View>
                    {selected ? <Check size={20} color="#1E40AF" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

