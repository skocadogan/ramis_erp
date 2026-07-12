// ============================================================
// Stock Man — Branch Selector Bar
// ============================================================

import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, MapPin, Warehouse } from "lucide-react-native";
import { useBranchStore } from "@/store/useBranchStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useI18n } from "@/i18n";
import { BranchPicker } from "./BranchPicker";
import { WarehousePicker } from "@/components/transfer/WarehousePicker";
import { cn } from "@/utils/cn";

export function BranchSelectorBar() {
  const { t } = useI18n();
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [warehousePickerOpen, setWarehousePickerOpen] = useState(false);
  const user = useAuthStore((s) => s.user);

  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);
  const availableBranches = useBranchStore((s) => s.availableBranches);
  const availableWarehouses = useBranchStore((s) => s.availableWarehouses);
  const fetchWarehouses = useBranchStore((s) => s.fetchWarehouses);
  const setActiveWarehouse = useBranchStore((s) => s.setActiveWarehouse);

  const activeBranch = availableBranches.find((b) => b.id === activeBranchId);
  const displayBranch = useMemo(() => {
    if (activeBranch) return activeBranch;
    if (!activeBranchId) return undefined;
    const fromUser = user?.available_branches?.find((b) => b.id === activeBranchId);
    return fromUser
      ? { id: fromUser.id, name: fromUser.name, code: "" }
      : undefined;
  }, [activeBranch, activeBranchId, user]);

  const activeWarehouse = availableWarehouses.find(
    (w) => w.id === activeWarehouseId
  );

  useEffect(() => {
    if (activeBranchId) {
      void fetchWarehouses(activeBranchId);
    }
  }, [activeBranchId, fetchWarehouses]);

  const noBranch = !activeBranchId;
  const noWarehouse = !!activeBranchId && !activeWarehouse;

  return (
    <>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => setBranchPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            noBranch
              ? t("branches.select")
              : `${t("branches.current")}: ${displayBranch?.name ?? ""}`
          }
          className={cn(
            "flex-1 flex-row items-center px-3 py-2 rounded-xl border active:opacity-80",
            noBranch
              ? "bg-warning/10 border-warning/30"
              : "bg-muted border-border"
          )}
        >
          <View
            className={cn(
              "h-7 w-7 items-center justify-center rounded-full mr-2",
              noBranch ? "bg-warning/20" : "bg-primary/10"
            )}
          >
            <MapPin size={16} color={noBranch ? "#F59E0B" : "#1E40AF"} />
          </View>
          <Text
            className={cn(
              "flex-1 text-body font-semibold",
              noBranch ? "text-warning" : "text-foreground"
            )}
            numberOfLines={1}
          >
            {noBranch ? t("branches.select") : displayBranch?.name ?? "—"}
          </Text>
          <ChevronDown size={18} color={noBranch ? "#F59E0B" : "#64748B"} />
        </Pressable>

        <Pressable
          onPress={() => {
            if (!activeBranchId) {
              setBranchPickerOpen(true);
              return;
            }
            setWarehousePickerOpen(true);
          }}
          disabled={!activeBranchId}
          accessibilityRole="button"
          accessibilityLabel={
            noWarehouse
              ? t("purchase.selectWarehouse")
              : activeWarehouse?.name ?? t("purchase.warehouse")
          }
          className={cn(
            "flex-1 flex-row items-center px-3 py-2 rounded-xl border active:opacity-80",
            !activeBranchId && "opacity-50",
            noWarehouse
              ? "bg-warning/10 border-warning/30"
              : "bg-muted border-border"
          )}
        >
          <View className="h-7 w-7 items-center justify-center rounded-full mr-2 bg-primary/10">
            <Warehouse size={16} color="#1E40AF" />
          </View>
          <Text
            className={cn(
              "flex-1 text-body font-semibold",
              noWarehouse ? "text-warning" : "text-foreground"
            )}
            numberOfLines={1}
          >
            {noWarehouse
              ? t("purchase.selectWarehouse")
              : activeWarehouse?.name ?? "—"}
          </Text>
          <ChevronDown size={18} color={noWarehouse ? "#F59E0B" : "#64748B"} />
        </Pressable>
      </View>

      <BranchPicker
        visible={branchPickerOpen}
        onClose={() => setBranchPickerOpen(false)}
      />
      <WarehousePicker
        visible={warehousePickerOpen}
        title={t("purchase.selectWarehouse")}
        onSelect={(warehouse) => {
          void setActiveWarehouse(warehouse.id);
          setWarehousePickerOpen(false);
        }}
        onClose={() => setWarehousePickerOpen(false)}
      />
    </>
  );
}

