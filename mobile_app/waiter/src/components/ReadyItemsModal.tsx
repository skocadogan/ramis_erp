import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, Modal, ActivityIndicator } from "react-native";
import { FlashList } from "@shopify/flash-list";
/** FlashList generic type mismatch — keep as any for Expo compatibility */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCheck } from "lucide-react-native";
import apiClient from "../api/client";
import { useI18n } from "../i18n";
import { useWaiterPosPushStore } from "../store/useWaiterPosPushStore";

interface ReadyItem {
  id: string;
  product_name: string;
  table_name: string;
  quantity: number;
  unit_name: string | null;
  updated_at: string;
}

type ReadyListRow =
  | { type: "header"; key: string; tableName: string }
  | { type: "item"; key: string; item: ReadyItem };

export default function ReadyItemsModal({
  visible,
  onClose,
  branchId,
  onRefresh,
}: {
  visible: boolean;
  onClose: () => void;
  branchId?: string;
  onRefresh?: () => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<ReadyItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const wsConnected = useWaiterPosPushStore((s) => s.wsConnected);
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;

  const fetchReadyItems = useCallback(async () => {
    if (!branchId) return;
    try {
      setIsLoading(true);
      const response = await apiClient.get("/orders/items/ready-for-waiter/", {
        params: { branch_id: branchId },
      });
      const data = Array.isArray(response.data) ? response.data : response.data.results || [];
      setItems(data);
    } catch (error) {
      console.error("Fetch ready items failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (!visible || !branchId) return;
    void fetchReadyItems();
    if (wsConnected) return;
    const interval = setInterval(() => void fetchReadyItems(), 90_000);
    return () => clearInterval(interval);
  }, [visible, branchId, fetchReadyItems, wsConnected]);

  const handleDeliver = useCallback(
    async (itemId: string) => {
      try {
        setItems((prev) => prev.filter((i: ReadyItem) => i.id !== itemId));
        await apiClient.post(`/orders/items/${itemId}/set_status/`, { status: "DELIVERED" });
        void useWaiterPosPushStore.getState().incrementDeliveredCount();
        onRefresh?.();
      } catch (error) {
        console.error("Deliver item failed:", error);
        void fetchReadyItems();
      }
    },
    [fetchReadyItems, onRefresh]
  );

  const listRows = useMemo(() => {
    const grouped: Record<string, ReadyItem[]> = {};
    for (const item of items) {
      if (!grouped[item.table_name]) grouped[item.table_name] = [];
      grouped[item.table_name].push(item);
    }
    const rows: ReadyListRow[] = [];
    for (const tableName of Object.keys(grouped)) {
      rows.push({ type: "header", key: `h-${tableName}`, tableName });
      for (const item of grouped[tableName]) {
        rows.push({ type: "item", key: item.id, item });
      }
    }
    return rows;
  }, [items]);

  const renderRow = useCallback(
    ({ item: row }: { item: ReadyListRow }) => {
      if (row.type === "header") {
        return (
          <Text className="text-primary font-bold text-sm mb-3 ml-1 uppercase tracking-widest">
            {t("tables.readyModalTablePrefix")} {row.tableName}
          </Text>
        );
      }
      const item = row.item;
      return (
        <View
          className="flex-row items-center justify-between bg-secondary p-5 rounded-[24px] mb-3"
          style={{ borderCurve: "continuous" }}
        >
          <View className="flex-1 mr-4">
            <Text className="text-foreground font-bold text-lg">
              {item.quantity}x {item.product_name}
            </Text>
            {item.unit_name ? (
              <Text className="text-primary text-xs font-bold">{item.unit_name}</Text>
            ) : null}
            <Text className="text-muted-foreground text-xs mt-1">
              {new Date(item.updated_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <Pressable
            onPress={() => handleDeliver(item.id)}
            className="active:scale-90 w-12 h-12 bg-primary rounded-full items-center justify-center shadow-md"
          >
            <CheckCheck size={24} color="#ffffff" />
          </Pressable>
        </View>
      );
    },
    [t, handleDeliver]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="bg-card rounded-t-[40px] p-6 h-[85%] border-t border-border shadow-2xl"
          style={{
            borderCurve: "continuous",
            paddingBottom: Math.max(bottomInset + 16, 24),
          }}
        >
          <View className="flex-row justify-between items-center mb-8">
            <Pressable onPress={onClose} className="active:opacity-85">
              <Text className="text-primary font-bold text-lg">{t("tables.readyModalClose")}</Text>
            </Pressable>
            <Text className="text-foreground text-2xl font-bold">
              {t("tables.readyModalTitle")}
            </Text>
            <View className="w-12" />
          </View>

          {isLoading && items.length === 0 ? (
            <ActivityIndicator size="large" color="#1E2A4A" className="my-12" />
          ) : items.length === 0 ? (
            <View className="py-20 items-center justify-center">
              <CheckCheck size={48} color="#8A8480" className="opacity-20 mb-4" />
              <Text className="text-muted-foreground text-center font-medium">
                {t("tables.noReadyItems")}
              </Text>
            </View>
          ) : (
            <FlashListAny
              data={listRows}
              keyExtractor={(row: ReadyListRow) => row.key}
              estimatedItemSize={80}
              renderItem={renderRow}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
