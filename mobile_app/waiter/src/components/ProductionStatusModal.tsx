import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Modal, Pressable, TextInput, ActivityIndicator } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, Search, AlertCircle, Package } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../i18n";
import { fetchProductionPlans, fetchProductAvailabilities } from "../api/waiterApi";
import type { ProductionPlan, ProductionPlanLine } from "../types/models";

interface StatusItem extends ProductionPlanLine {
  target: number;
  remaining: number | null;
  sold: number;
  status: "ok" | "warning" | "critical";
  soldPercent: number;
}

interface ProductionStatusModalProps {
  visible: boolean;
  onClose: () => void;
  branchId: string;
}

export default function ProductionStatusModal({
  visible,
  onClose,
  branchId,
}: ProductionStatusModalProps) {
  const { t } = useI18n();
  /** FlashList generic type mismatch — keep as any for Expo compatibility */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FlashListCast = FlashList as any;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0]; // yyyy-MM-dd
  });
  const [searchQuery, setSearchQuery] = useState("");

  const plansQuery = useQuery({
    queryKey: ["production-plans", branchId, selectedDate],
    queryFn: () => fetchProductionPlans(branchId, selectedDate),
    enabled: visible && !!branchId,
  });

  const availabilitiesQuery = useQuery({
    queryKey: ["product-availabilities", branchId, selectedDate],
    queryFn: () => fetchProductAvailabilities(branchId, selectedDate),
    enabled: visible && !!branchId,
  });

  const isLoading = plansQuery.isPending || availabilitiesQuery.isPending;

  const activePlan = useMemo<ProductionPlan | undefined>(() => {
    const plansList = plansQuery.data || [];
    return plansList.find((p) => p.status === "APPROVED") || plansList[0];
  }, [plansQuery.data]);

  const statusData = useMemo<StatusItem[]>(() => {
    if (!activePlan) return [];

    const lines = activePlan.lines || [];
    const availList = availabilitiesQuery.data || [];

    const mapped = lines.map((line) => {
      const avail = availList.find((a) => a.product === line.product);

      const target = parseFloat(String(line.target_quantity || 0));
      let remaining: number | null = null;
      let sold = 0;
      let status: "ok" | "warning" | "critical" = "ok";

      if (avail) {
        if (avail.mode === "LIMITED") {
          remaining = parseFloat(String(avail.remaining_portions || 0));
          sold = Math.max(0, target - remaining);
        } else if (avail.mode === "SOLD_OUT") {
          remaining = 0;
          sold = target;
        }
      }

      const soldPercent = target > 0 ? (sold / target) * 100 : 0;
      if (soldPercent >= 100) status = "critical";
      else if (soldPercent >= 80) status = "warning";

      return {
        ...line,
        target,
        remaining,
        sold,
        status,
        soldPercent,
      };
    });

    // Sort by product name
    return mapped.sort((a, b) => (a.product_name || "").localeCompare(b.product_name || ""));
  }, [activePlan, availabilitiesQuery.data]);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return statusData;
    const q = searchQuery.toLowerCase();
    return statusData.filter(
      (item) =>
        (item.product_name || "").toLowerCase().includes(q) ||
        (item.category_name || "").toLowerCase().includes(q)
    );
  }, [statusData, searchQuery]);

  const renderStatusItem = useCallback(
    ({ item }: { item: StatusItem }) => {
      const progressWidth = `${Math.min(100, item.soldPercent)}%`;

      return (
        <View className="bg-card border border-border rounded-3xl p-4 mb-3 shadow-sm">
          <View className="flex-row justify-between items-start mb-2">
            <View className="flex-1 mr-2">
              <Text className="text-foreground text-base font-bold" numberOfLines={1}>
                {item.product_name}
              </Text>
              <View className="flex-row items-center mt-1">
                <View className="bg-primary/10 px-2 py-0.5 rounded-lg mr-2">
                  <Text className="text-primary text-[10px] font-bold">
                    {item.category_name || "Genel"}
                  </Text>
                </View>
                {item.station_name && (
                  <Text className="text-muted-foreground text-[10px] font-medium">
                    {item.station_name}
                  </Text>
                )}
              </View>
            </View>

            <View className="items-end">
              <Text className="text-muted-foreground text-[10px] font-bold uppercase">
                {t("productionStatus.table.remaining")}
              </Text>
              <Text
                className={`text-base font-black mt-0.5 ${
                  item.remaining === 0
                    ? "text-destructive"
                    : item.remaining !== null && item.remaining <= 5
                      ? "text-amber-500"
                      : "text-emerald-500"
                }`}
              >
                {item.remaining !== null ? item.remaining : "∞"}
              </Text>
            </View>
          </View>

          {/* Target vs Sold info */}
          <View className="flex-row justify-between items-center mt-2 border-t border-border/60 pt-3">
            <View className="flex-row items-center">
              <Text className="text-muted-foreground text-xs">
                {t("productionStatus.table.target")}:{" "}
              </Text>
              <Text className="text-foreground text-xs font-bold">{item.target}</Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-muted-foreground text-xs">
                {t("productionStatus.table.sold")}:{" "}
              </Text>
              <Text className="text-primary text-xs font-bold">{item.sold}</Text>
            </View>
          </View>

          {/* Progress Bar */}
          {item.remaining !== null ? (
            <View className="flex-row items-center mt-3 gap-3">
              <View className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                <View
                  style={{ width: progressWidth as `${number}%` }}
                  className={`h-full rounded-full ${
                    item.status === "critical"
                      ? "bg-destructive"
                      : item.status === "warning"
                        ? "bg-amber-500"
                        : "bg-primary"
                  }`}
                />
              </View>
              <Text className="text-muted-foreground font-bold text-xs w-9 text-right">
                %{Math.round(item.soldPercent)}
              </Text>
            </View>
          ) : (
            <View className="mt-3 py-1 bg-secondary/50 rounded-xl items-center">
              <Text className="text-muted-foreground text-[10px] italic">
                {t("productionStatus.noLimit")}
              </Text>
            </View>
          )}
        </View>
      );
    },
    [t]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        {/* Header */}
        <View className="px-6 py-4 flex-row justify-between items-center border-b border-border/80">
          <View className="flex-1 mr-4">
            <Text className="text-foreground text-2xl font-bold">
              {t("productionStatus.title")}
            </Text>
            <Text className="text-muted-foreground text-xs mt-0.5">
              {selectedDate} • {activePlan?.branch_name || ""}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            className="w-10 h-10 bg-secondary rounded-full items-center justify-center active:opacity-80 shadow-sm"
          >
            <X size={20} color="#71717a" />
          </Pressable>
        </View>

        {/* Stats Grid & Filters */}
        <View className="px-6 py-4">
          <View className="flex-row justify-between mb-4 gap-3">
            {/* Stat Card 1: Toplam */}
            <View className="flex-1 bg-secondary/40 border border-border/50 p-3 rounded-2xl items-center justify-center">
              <View className="flex-row items-center mb-1">
                <Package size={14} color="#1E2A4A" className="mr-1" />
                <Text className="text-muted-foreground text-[10px] font-bold uppercase">
                  {t("productionStatus.table.product")}
                </Text>
              </View>
              <Text className="text-foreground text-lg font-black">{statusData.length}</Text>
            </View>

            {/* Stat Card 2: Kritik */}
            <View className="flex-1 bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl items-center justify-center">
              <View className="flex-row items-center mb-1">
                <AlertCircle size={14} color="#f59e0b" className="mr-1" />
                <Text className="text-amber-500 text-[10px] font-bold uppercase">
                  {t("productionStatus.critical")}
                </Text>
              </View>
              <Text className="text-amber-500 text-lg font-black">
                {statusData.filter((d) => d.status === "warning").length}
              </Text>
            </View>

            {/* Stat Card 3: Tükendi */}
            <View className="flex-1 bg-destructive/10 border border-destructive/20 p-3 rounded-2xl items-center justify-center">
              <View className="flex-row items-center mb-1">
                <AlertCircle size={14} color="#f43f5e" className="mr-1" />
                <Text className="text-destructive text-[10px] font-bold uppercase">
                  {t("productionStatus.soldOut")}
                </Text>
              </View>
              <Text className="text-destructive text-lg font-black">
                {statusData.filter((d) => d.status === "critical").length}
              </Text>
            </View>
          </View>

          {/* Search bar */}
          <View className="flex-row items-center bg-secondary border border-border rounded-2xl px-4 h-12">
            <Search size={18} color="#71717a" />
            <TextInput
              className="flex-1 ml-3 text-foreground text-sm"
              placeholder={t("productionStatus.search")}
              placeholderTextColor="#a1a1aa"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} className="p-1">
                <X size={16} color="#71717a" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Content list */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#1E2A4A" />
            <Text className="text-muted-foreground text-sm font-medium mt-4 animate-pulse">
              {t("productionStatus.loading")}
            </Text>
          </View>
        ) : !activePlan ? (
          <View className="flex-1 items-center justify-center px-8 text-center">
            <View className="w-16 h-16 bg-secondary/80 rounded-full items-center justify-center mb-4">
              <AlertCircle size={32} color="#a1a1aa" />
            </View>
            <Text className="text-foreground text-lg font-bold">
              {t("productionStatus.noPlanTitle")}
            </Text>
            <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
              {t("productionStatus.noPlanBody")}
            </Text>
          </View>
        ) : (
          <FlashListCast
            data={filteredData}
            keyExtractor={(item: StatusItem) => String(item.id)}
            estimatedItemSize={65}
            renderItem={renderStatusItem}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
            style={{ flex: 1 }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
