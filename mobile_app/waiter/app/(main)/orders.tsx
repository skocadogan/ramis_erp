import React, { useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { FlashList } from "@shopify/flash-list";
const FlashListAny = FlashList as any;
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, ClipboardList, Table as TableIcon, Clock } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../src/store/useAuthStore";
import { usePosStore } from "../../src/store/usePosStore";
import { effectiveBranchId } from "../../src/utils/branchScope";
import { fetchMyOrders } from "../../src/api/waiterApi";
import { useI18n } from "../../src/i18n";
import {
  getOrderItemStatusLabel,
  getOrderItemStatusTextClass,
  isOrderItemCancelled,
} from "../../src/utils/orderItemDisplay";

export default function MyOrdersScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const activeBranchId = usePosStore((s) => s.activeBranchId);
  const queryClient = useQueryClient();
  const branchId = effectiveBranchId(user?.branchId, activeBranchId);

  const {
    data: orders = [],
    isPending,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["orders", "main", "waiter", branchId],
    queryFn: () => fetchMyOrders(branchId!),
    enabled: !!branchId,
  });

  const onRefresh = useCallback(() => {
    if (!branchId) return;
    void queryClient.invalidateQueries({ queryKey: ["orders", "main", "waiter", branchId] });
  }, [branchId, queryClient]);

  const groupedOrders = React.useMemo(() => {
    const groups: Record<string, any> = {};

    for (const orderRaw of orders) {
      const order = orderRaw as any;
      const tableId = order.table ? String(order.table) : null;

      if (tableId) {
        if (!groups[tableId]) {
          groups[tableId] = {
            id: order.id,
            table: order.table,
            table_name: order.table_name || "Masa",
            zone_name: order.zone_name,
            created_at: order.created_at,
            items: [...(order.items || [])],
            total_amount: parseFloat(String(order.total_amount ?? "0")),
          };
        } else {
          const group = groups[tableId];
          group.items.push(...(order.items || []));
          group.total_amount += parseFloat(String(order.total_amount ?? "0"));
          if (new Date(order.created_at) > new Date(group.created_at)) {
            group.created_at = order.created_at;
          }
        }
      } else {
        const uniqKey = `takeaway-${order.id}`;
        groups[uniqKey] = {
          ...order,
          total_amount: parseFloat(String(order.total_amount ?? "0")),
        };
      }
    }

    return Object.values(groups).sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [orders]);

  const renderOrder = useCallback(
    ({ item: order }: { item: Record<string, unknown> }) => {
      const items = (order.items as any[]) || [];
      const tableId = order.table as string;
      return (
        <Pressable
          onPress={() => router.push(`/(main)/table/${tableId}`)}
          className="active:opacity-80 bg-card border border-border rounded-2xl p-5 mb-4 shadow-sm"
        >
          <View className="flex-row justify-between items-start mb-4">
            <View className="flex-row items-center">
              <View className="w-10 h-10 bg-card rounded-full items-center justify-center mr-3">
                <TableIcon size={20} color="#1E2A4A" />
              </View>
              <View>
                <Text className="text-foreground font-bold text-base">
                  {(order.table_name as string) || "Masa"}
                </Text>
                <Text className="text-muted-foreground text-[10px] font-bold uppercase">
                  {order.zone_name as string}
                </Text>
              </View>
            </View>
            <View className="bg-card/60 px-3 py-1 rounded-full flex-row items-center">
              <Clock size={12} color="#1E2A4A" className="mr-1" />
              <Text className="text-primary text-[10px] font-bold">
                {new Date(order.created_at as string).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>

          <View className="border-t border-border pt-4">
            {items.slice(0, 3).map((line: any) => {
              const isCancelled = isOrderItemCancelled(line.status);
              return (
                <View
                  key={line.id}
                  className={`flex-row justify-between items-center mb-2 ${isCancelled ? "opacity-70" : ""}`}
                >
                  <View className="flex-1 mr-2">
                    <Text
                      className={`text-sm font-semibold ${
                        isCancelled ? "text-destructive line-through" : "text-foreground"
                      }`}
                      numberOfLines={1}
                    >
                      {line.product_name}
                      {line.unit_name ? ` (${line.unit_name})` : ""}
                    </Text>
                    {Array.isArray(line.modifiers) && line.modifiers.length > 0 ? (
                      <Text
                        className={`text-[11px] font-semibold mt-0.5 ${
                          isCancelled
                            ? "text-destructive/70 line-through"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        + {line.modifiers.map((m: any) => m.modifier_name).join(", ")}
                      </Text>
                    ) : null}
                    <Text
                      className={`text-[10px] font-black mt-0.5 ${getOrderItemStatusTextClass(line.status)}`}
                    >
                      {getOrderItemStatusLabel(line.status, t)}
                    </Text>
                  </View>
                  <Text
                    className={`font-bold text-sm ${isCancelled ? "text-destructive line-through" : "text-primary"}`}
                  >
                    x{line.quantity}
                  </Text>
                </View>
              );
            })}
            {items.length > 3 ? (
              <Text className="text-muted-foreground text-[10px] font-bold italic mt-1">
                {t("orders.moreItems", { count: items.length - 3 })}
              </Text>
            ) : null}
          </View>

          <View className="mt-4 flex-row justify-between items-center">
            <View className="flex-row gap-2">
              {items.some((i: any) => i.status === "READY") ? (
                <View className="bg-primary px-2 py-0.5 rounded-md">
                  <Text className="text-white text-[9px] font-bold">{t("orders.readyExists")}</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-foreground font-black text-lg">
              {parseFloat(String(order.total_amount ?? "0")).toFixed(2)}
            </Text>
          </View>
        </Pressable>
      );
    },
    [router, t]
  );

  if (!branchId) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-muted-foreground text-center">{t("common.noData")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 py-4 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="active:opacity-80 p-2">
          <ChevronLeft size={28} color="#1E2A4A" />
        </Pressable>
        <Text className="text-foreground text-2xl font-bold">{t("orders.title")}</Text>
        <View className="w-10" />
      </View>

      <FlashListAny
        style={{ flex: 1 }}
        data={groupedOrders as Record<string, unknown>[]}
        keyExtractor={(item: any) => String(item.id)}
        estimatedItemSize={110}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isPending}
            onRefresh={onRefresh}
            tintColor="#1E2A4A"
          />
        }
        ListEmptyComponent={
          isPending ? (
            <ActivityIndicator size="large" color="#1E2A4A" className="mt-20" />
          ) : isError ? (
            <Text className="text-muted-foreground text-center mt-20">{t("common.error")}</Text>
          ) : (
            <View className="items-center justify-center py-20">
              <View className="bg-muted w-20 h-20 rounded-full items-center justify-center mb-6">
                <ClipboardList size={32} color="#1E2A4A" />
              </View>
              <Text className="text-foreground text-xl font-bold mb-2">
                {t("orders.noActiveOrders")}
              </Text>
              <Text className="text-muted-foreground text-center px-10">
                {t("orders.noActiveOrdersDesc")}
              </Text>
            </View>
          )
        }
        renderItem={renderOrder}
        contentContainerStyle={{
          paddingBottom: 40,
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: 16,
        }}
      />
    </SafeAreaView>
  );
}
