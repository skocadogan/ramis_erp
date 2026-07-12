// ============================================================
// Stock Man — Return / Cancel Filter Bar
//
// Controlled filter strip: movement type, reason, supplier,
// warehouse, date range, search.
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
import { DatePicker } from "@/components/ui/DatePicker";
import { useI18n } from "@/i18n";
import {
  isValidIsoDate,
  parseIsoDate,
  toIsoDate,
} from "@/lib/format/date";
import { cn } from "@/utils/cn";
import type {
  ReturnCancelFilters,
  ReturnCancelMovementType,
  ReturnCancelReasonCode,
} from "@/services/returnCancelService";
import type { Supplier, UUID, Warehouse as WarehouseT } from "@/types";

export type ReturnCancelFiltersWithDates = ReturnCancelFilters & {
  startDate: string;
  endDate: string;
};

export interface ReturnCancelFilterBarProps {
  filters: ReturnCancelFiltersWithDates;
  onChange: (next: ReturnCancelFiltersWithDates) => void;
  warehouses?: WarehouseT[];
  suppliers?: Supplier[];
  reasonCodes?: ReturnCancelReasonCode[];
  className?: string;
}

const MOVEMENT_TYPES: ReturnCancelMovementType[] = ["ALL", "RETURN", "CANCEL"];

export function ReturnCancelFilterBar({
  filters,
  onChange,
  warehouses,
  suppliers,
  reasonCodes = [],
  className,
}: ReturnCancelFilterBarProps) {
  const { t } = useI18n();
  const [warehousePickerOpen, setWarehousePickerOpen] = useState(false);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [reasonPickerOpen, setReasonPickerOpen] = useState(false);

  const activeType = filters.movement_type ?? "ALL";

  const selectedWarehouse = useMemo(
    () => warehouses?.find((w) => w.id === filters.warehouse_id) ?? null,
    [warehouses, filters.warehouse_id]
  );

  const selectedSupplier = useMemo(
    () => suppliers?.find((s) => s.id === filters.supplier_id) ?? null,
    [suppliers, filters.supplier_id]
  );

  const selectedReason = useMemo(
    () => reasonCodes.find((r) => r.code === filters.reason_code) ?? null,
    [reasonCodes, filters.reason_code]
  );

  const onSelectType = useCallback(
    (type: ReturnCancelMovementType) => {
      onChange({
        ...filters,
        movement_type: type === "ALL" ? undefined : type,
      });
    },
    [filters, onChange]
  );

  const movementTypeLabel = (type: ReturnCancelMovementType) => {
    if (type === "ALL") return t("returnCancel.movementTypeAll");
    if (type === "RETURN") return t("returnCancel.movementTypeReturn");
    return t("returnCancel.movementTypeCancel");
  };

  return (
    <View className={cn("pb-2", className)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {MOVEMENT_TYPES.map((type) => (
          <Chip
            key={type}
            label={movementTypeLabel(type)}
            selected={activeType === type}
            onPress={() => onSelectType(type)}
            variant="primary"
          />
        ))}
        <Chip
          label={
            selectedWarehouse
              ? selectedWarehouse.name
              : t("returnCancel.formWarehouse")
          }
          selected={!!selectedWarehouse}
          onPress={() => setWarehousePickerOpen(true)}
          leftIcon={Warehouse}
          variant="default"
        />
        <Chip
          label={
            selectedReason
              ? selectedReason.label
              : t("returnCancel.reasonAll")
          }
          selected={!!selectedReason}
          onPress={() => setReasonPickerOpen(true)}
          variant="default"
        />
        <Chip
          label={
            selectedSupplier
              ? selectedSupplier.name
              : t("returnCancel.supplierAll")
          }
          selected={!!selectedSupplier}
          onPress={() => setSupplierPickerOpen(true)}
          variant="default"
        />
      </ScrollView>

      <View className="px-4 mt-2 flex-row gap-2">
        <View className="flex-1">
          <DatePicker
            label={t("returnCancel.startDate")}
            value={parseIsoDate(filters.startDate)}
            maximumDate={parseIsoDate(filters.endDate)}
            onChange={(d) => {
              const iso = toIsoDate(d);
              if (!isValidIsoDate(iso)) return;
              onChange({ ...filters, startDate: iso });
            }}
          />
        </View>
        <View className="flex-1">
          <DatePicker
            label={t("returnCancel.endDate")}
            value={parseIsoDate(filters.endDate)}
            minimumDate={parseIsoDate(filters.startDate)}
            onChange={(d) => {
              const iso = toIsoDate(d);
              if (!isValidIsoDate(iso)) return;
              onChange({ ...filters, endDate: iso });
            }}
          />
        </View>
      </View>

      <View className="px-4 mt-2">
        <View className="flex-row items-center rounded-lg border border-border bg-card px-3 h-11">
          <Search size={16} color="#94A3B8" />
          <TextInput
            value={filters.search ?? ""}
            onChangeText={(search) => onChange({ ...filters, search })}
            placeholder={t("returnCancel.searchPlaceholder")}
            placeholderTextColor="#94A3B8"
            className="flex-1 ml-2 text-body text-foreground"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {filters.search ? (
            <Pressable
              onPress={() => onChange({ ...filters, search: "" })}
              hitSlop={8}
              accessibilityRole="button"
            >
              <X size={16} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <PickerModal
        visible={warehousePickerOpen}
        title={t("returnCancel.formWarehouse")}
        onClose={() => setWarehousePickerOpen(false)}
        options={[
          { id: "", label: t("common.all") },
          ...(warehouses?.map((w) => ({ id: w.id, label: w.name })) ?? []),
        ]}
        selectedId={filters.warehouse_id ?? ""}
        onSelect={(id) => {
          onChange({ ...filters, warehouse_id: id || undefined });
          setWarehousePickerOpen(false);
        }}
      />

      <PickerModal
        visible={supplierPickerOpen}
        title={t("returnCancel.formSupplier")}
        onClose={() => setSupplierPickerOpen(false)}
        options={[
          { id: "", label: t("returnCancel.supplierAll") },
          ...(suppliers?.map((s) => ({ id: s.id, label: s.name })) ?? []),
        ]}
        selectedId={filters.supplier_id ?? ""}
        onSelect={(id) => {
          onChange({ ...filters, supplier_id: (id || undefined) as UUID | undefined });
          setSupplierPickerOpen(false);
        }}
      />

      <PickerModal
        visible={reasonPickerOpen}
        title={t("returnCancel.formReason")}
        onClose={() => setReasonPickerOpen(false)}
        options={[
          { id: "", label: t("returnCancel.reasonAll") },
          ...reasonCodes.map((r) => ({ id: r.code, label: r.label })),
        ]}
        selectedId={filters.reason_code ?? ""}
        onSelect={(id) => {
          onChange({ ...filters, reason_code: id || undefined });
          setReasonPickerOpen(false);
        }}
      />
    </View>
  );
}

function PickerModal({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable onPress={() => {}} className="bg-card rounded-t-2xl max-h-[70%]">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <Text className="text-h3 text-foreground">{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <ChevronDown size={20} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map((opt) => {
              const selected = opt.id === selectedId;
              return (
                <Pressable
                  key={opt.id || "__all__"}
                  onPress={() => onSelect(opt.id)}
                  className={cn(
                    "flex-row items-center px-4 py-3.5 border-b border-border",
                    selected && "bg-primary/5"
                  )}
                >
                  <Text
                    className={cn(
                      "flex-1 text-body",
                      selected ? "text-primary font-semibold" : "text-foreground"
                    )}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                  {selected ? <Check size={18} color="#1E40AF" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
