import React, { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
const FlashListAny = FlashList as any;
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Plus,
  Minus,
  ChevronLeft,
  Utensils
} from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import apiClient from "../../../../src/api/client";
import { finishTableCleaning, startTableCleaning } from "../../../../src/api/waiterApi";
import { useI18n } from "../../../../src/i18n";
import { useTableDetailRefreshStore } from "../../../../src/store/useTableDetailRefreshStore";
import { useWaiterPosPushStore } from "../../../../src/store/useWaiterPosPushStore";
import { useAuthStore } from "../../../../src/store/useAuthStore";
import { usePosStore } from "../../../../src/store/usePosStore";
import { effectiveBranchId } from "../../../../src/utils/branchScope";

// Alt bileşenlerin import edilmesi
import { TransferTableModal } from "../../../../src/components/TransferTableModal";
import { CancelOrderModal } from "../../../../src/components/CancelOrderModal";
import { CustomDialog } from "../../../../src/components/CustomDialog";
import {
  getOrderItemStatusLabel,
  getOrderItemStatusTextClass,
  isOrderItemCancelled,
  isOrderItemDelivered,
} from "../../../../src/utils/orderItemDisplay";
import {
  getEffectiveOrderItemQuantity,
  isKitchenResendPendingSibling,
} from "../../../../src/utils/orderItemQuantity";

const TABLE_DETAIL_REFRESH_DEBOUNCE_MS = 450;

type OrderCardProps = {
  order: any;
  cancelLabel: string;
  getItemStatusLabel: (status: string) => string;
  onCancelOrder: (orderId: string) => void;
  onUpdateItemQuantity: (itemId: string, currentQty: number, delta: number) => void;
};

const OrderCard = memo(function OrderCard({
  order,
  cancelLabel,
  getItemStatusLabel,
  onCancelOrder,
  onUpdateItemQuantity,
}: OrderCardProps) {
  const { t } = useI18n();
  const orderNotes = order.notes?.trim();

  return (
    <View className="mb-4 bg-card border border-border rounded-2xl p-5 shadow-sm">
      <View className="flex-row justify-between items-center mb-4 border-b border-border/50 pb-3.5">
        <View>
          <Text className="text-foreground font-black text-sm">#{order.order_number}</Text>
          <Text className="text-muted-foreground text-[10px] font-bold mt-0.5">
            {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
        <Pressable
          onPress={() => onCancelOrder(String(order.id))}
          className="active:scale-95 bg-destructive/10 px-3.5 py-1.5 rounded-xl border border-destructive/20 flex-row items-center"
        >
          <Text className="text-destructive text-xs font-black">{cancelLabel}</Text>
        </Pressable>
      </View>

      {orderNotes ? (
        <View className="mb-4 rounded-xl border border-amber-200/60 bg-amber-50/70 px-3.5 py-3">
          <Text className="text-amber-700 text-[10px] font-black uppercase tracking-wider mb-1">
            {t("order.notesLabel")}
          </Text>
          <Text className="text-amber-900 text-sm font-semibold leading-snug">{orderNotes}</Text>
        </View>
      ) : null}

      {Array.isArray(order.items)
        ? order.items
            .filter((item: any) => !isKitchenResendPendingSibling(item, order.items))
            .map((item: any) => {
            const itemNotes = item.notes?.trim();
            const isCancelled = isOrderItemCancelled(item.status);
            const isDelivered = isOrderItemDelivered(item.status);
            const displayQuantity = getEffectiveOrderItemQuantity(item, order.items);
            return (
            <View
              key={item.id}
              className={`flex-row justify-between items-center mb-4 last:mb-0 ${isCancelled ? "opacity-70" : ""}`}
            >
              <View className="flex-1 mr-4">
                <Text
                  className={`font-semibold text-sm ${
                    isCancelled
                      ? "text-destructive line-through"
                      : item.status === "DELIVERED"
                        ? "text-foreground opacity-40"
                        : "text-foreground"
                  }`}
                  numberOfLines={1}
                >
                  {item.product_name}{item.unit_name ? ` (${item.unit_name})` : ""}
                </Text>
                {Array.isArray(item.modifiers) && item.modifiers.length > 0 ? (
                  <Text
                    className={`text-[11px] font-semibold mt-0.5 ${
                      isCancelled
                        ? "text-destructive/70 line-through"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    + {item.modifiers.map((m: any) => m.modifier_name).join(", ")}
                  </Text>
                ) : null}
                <Text className={`text-[10px] font-black mt-0.5 ${getOrderItemStatusTextClass(item.status)}`}>
                  {getItemStatusLabel(item.status)}
                </Text>
                {itemNotes ? (
                  <Text className="text-amber-800/90 text-[10px] font-semibold mt-1" numberOfLines={3}>
                    {itemNotes}
                  </Text>
                ) : null}
              </View>

              {isCancelled ? (
                <View className="px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive/20">
                  <Text className="text-destructive text-[10px] font-black">
                    {t("tableDetail.status.cancelled")}
                  </Text>
                </View>
              ) : isDelivered ? (
                <Text className="text-foreground font-black text-sm opacity-40">{displayQuantity}</Text>
              ) : (
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => onUpdateItemQuantity(item.id, displayQuantity, -1)}
                    className="active:scale-90 w-8 h-8 rounded-xl border border-border bg-card items-center justify-center"
                  >
                    <Minus size={14} color="#1E2A4A" strokeWidth={2.5} />
                  </Pressable>
                  <Text className="text-foreground font-black text-sm mx-3">{displayQuantity}</Text>
                  <Pressable
                    onPress={() => onUpdateItemQuantity(item.id, displayQuantity, 1)}
                    className="active:scale-90 w-8 h-8 rounded-xl bg-primary items-center justify-center"
                  >
                    <Plus size={14} color="#ffffff" strokeWidth={2} />
                  </Pressable>
                </View>
              )}
            </View>
          );
          })
        : null}
    </View>
  );
});

export default function TableDetailScreen() {
  const rawParams = useLocalSearchParams<{ id?: string | string[] }>();
  const id = rawParams.id == null ? undefined : Array.isArray(rawParams.id) ? rawParams.id[0] : rawParams.id;
  const router = useRouter();
  const { t } = useI18n();
  const userBranchId = useAuthStore((s) => s.user?.branchId);
  const activeBranchId = usePosStore((s) => s.activeBranchId);
  const queryClient = useQueryClient();
  const branchId = effectiveBranchId(userBranchId, activeBranchId);
  const pendingRefreshTableId = useTableDetailRefreshStore((s) => s.pendingTableId);
  const clearPendingRefresh = useTableDetailRefreshStore((s) => s.clearPending);
  const [table, setTable] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasFetchedOnceRef = useRef(false);
  const [isTransferModalVisible, setIsTransferModalVisible] = useState(false);
  const [allTables, setAllTables] = useState<any[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [selectedReasonCode, setSelectedReasonCode] = useState("MISTAKE");
  const [reasonDescription, setReasonDescription] = useState("");
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isCleaningAction, setIsCleaningAction] = useState(false);
  const isTakeawayZone = Boolean(table?.zone_is_takeaway);
  const pushSkipRef = useRef(false);
  const tableRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dialog State
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: "info" | "success" | "error" | "warning" | "confirm";
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showDialog = useCallback((config: Omit<typeof dialogConfig, "visible">) => {
    setDialogConfig({ ...config, visible: true });
  }, []);

  const hideDialog = useCallback(() => {
    setDialogConfig((prev) => ({ ...prev, visible: false }));
  }, []);
  const fetchTableDetailRef = useRef<
    ((opts?: { afterSuccess?: () => void; silent?: boolean }) => Promise<void>) | undefined
  >(undefined);

  const fetchTableDetail = useCallback(async (opts?: { afterSuccess?: () => void; silent?: boolean }) => {
    if (!id) return;
    const isFirstLoad = !hasFetchedOnceRef.current;
    const isTakeawayOrder = id.startsWith("tw-ord__");
    const orderId = isTakeawayOrder ? id.substring(8) : null;
    try {
      if (isFirstLoad) {
        setIsBootstrapping(true);
      } else if (!opts?.silent) {
        setIsRefreshing(true);
      }

      let tableData;
      let ordersData;

      if (isTakeawayOrder && orderId) {
        tableData = {
          id: id,
          name: "Paket Sipariş",
          zone_name: "Paket Servis",
          status: "OCCUPIED"
        };
        const orderRes = await apiClient.get(`/orders/main/${orderId}/`);
        ordersData = [orderRes.data];
      } else {
        const [tableRes, ordersRes] = await Promise.all([
          apiClient.get(`/tables/${id}/`),
          apiClient.get("/orders/main/", {
            params: {
              branch_id: branchId ?? undefined,
              table_id: id,
              status: "PENDING,PREPARING,READY,DELIVERED"
            }
          })
        ]);
        tableData = tableRes.data;
        ordersData = Array.isArray(ordersRes.data) ? ordersRes.data : ordersRes.data.results || [];
      }

      setTable(tableData);
      setOrders(ordersData);
      opts?.afterSuccess?.();
    } catch (error) {
      console.error("Fetch table detail error:", error);
      showDialog({
        title: t("common.error"),
        message: t("common.noData"),
        type: "error",
        onConfirm: hideDialog,
      });
    } finally {
      hasFetchedOnceRef.current = true;
      setIsBootstrapping(false);
      setIsRefreshing(false);
    }
  }, [id, t, branchId]);

  fetchTableDetailRef.current = fetchTableDetail;

  useEffect(() => {
    pushSkipRef.current = true;
    if (!id) return;
    hasFetchedOnceRef.current = false;
    void fetchTableDetailRef.current?.();
  }, [id, branchId]);

  useEffect(() => {
    if (!id || pendingRefreshTableId !== id) return;
    void fetchTableDetailRef.current?.({ afterSuccess: () => clearPendingRefresh() });
  }, [pendingRefreshTableId, id, clearPendingRefresh]);

  const tableBump = useWaiterPosPushStore((s) => (id ? s.tableEpoch[String(id)] ?? 0 : 0));

  useEffect(() => {
    if (!id) return;
    if (pushSkipRef.current) {
      pushSkipRef.current = false;
      return;
    }
    if (tableRefreshTimerRef.current) {
      clearTimeout(tableRefreshTimerRef.current);
    }
    tableRefreshTimerRef.current = setTimeout(() => {
      tableRefreshTimerRef.current = null;
      void fetchTableDetailRef.current?.({ silent: true });
    }, TABLE_DETAIL_REFRESH_DEBOUNCE_MS);
    return () => {
      if (tableRefreshTimerRef.current) {
        clearTimeout(tableRefreshTimerRef.current);
        tableRefreshTimerRef.current = null;
      }
    };
  }, [tableBump, id]);

  const handleCancelItem = useCallback((itemId: string) => {
    showDialog({
      title: t("tableDetail.cancelConfirmTitle"),
      message: t("tableDetail.cancelConfirmDesc"),
      type: "confirm",
      confirmLabel: t("tableDetail.cancelConfirmBtn"),
      cancelLabel: t("common.cancel"),
      onConfirm: () => {
        hideDialog();
        const previousOrders = [...orders];

        // İyimser güncelleme — kalemi listeden silmek yerine iptal durumuna çek
        setOrders((prevOrders) =>
          prevOrders.map((order) => ({
            ...order,
            items: order.items.map((item: any) =>
              item.id === itemId ? { ...item, status: "CANCELLED" } : item
            ),
          }))
        );

        apiClient
          .post(`/orders/items/${itemId}/cancel/`, {
            reason_code: "WAITER_CANCEL",
            reason_text: "Garson tarafından iptal edildi"
          })
          .then(() => {
            if (branchId) {
              void queryClient.invalidateQueries({ queryKey: ["dashboard", "stats", branchId] });
              void queryClient.invalidateQueries({ queryKey: ["orders", "main", "waiter", branchId] });
            }
          })
          .catch((error) => {
            // Hata durumunda rollback
            setOrders(previousOrders);
            showDialog({
              title: t("common.error"),
              message: "Ürün iptal edilemedi. İnternet bağlantınızı kontrol edin.",
              type: "error",
              onConfirm: hideDialog,
            });
          });
      },
      onCancel: hideDialog,
    });
  }, [orders, branchId, queryClient, t, showDialog, hideDialog]);

  const handleUpdateItemQuantity = useCallback((itemId: string, currentQty: number, delta: number) => {
    const newQty = currentQty + delta;
    if (newQty <= 0) {
      handleCancelItem(itemId);
      return;
    }

    const sourceOrder = orders.find((order) =>
      Array.isArray(order.items) && order.items.some((item: any) => item.id === itemId)
    );
    const sourceItem = sourceOrder?.items?.find((item: any) => item.id === itemId);
    const resendDeltaToKitchen = Boolean(
      sourceItem &&
        !sourceItem.parent_item &&
        sourceItem.status === "DELIVERED" &&
        delta > 0
    );

    const previousOrders = [...orders];

    if (!resendDeltaToKitchen) {
      setOrders((prevOrders) =>
        prevOrders.map((order) => ({
          ...order,
          items: order.items.map((item: any) =>
            item.id === itemId ? { ...item, quantity: newQty } : item
          ),
        }))
      );
    }

    apiClient
      .post(`/orders/items/${itemId}/update_quantity/`, {
        quantity: newQty,
        resend_delta_to_kitchen: resendDeltaToKitchen,
      })
      .then(() => {
        if (branchId) {
          void queryClient.invalidateQueries({ queryKey: ["dashboard", "stats", branchId] });
          void queryClient.invalidateQueries({ queryKey: ["orders", "main", "waiter", branchId] });
        }
        if (resendDeltaToKitchen && id) {
          return apiClient
            .get(`/branches/tables/${id}/`)
            .then((res) => {
              setOrders(res.data.active_orders || []);
            });
        }
      })
      .catch(() => {
        // Hata durumunda rollback (eski state'e geri dön)
        setOrders(previousOrders);
        showDialog({
          title: t("common.error"),
          message: "Miktar güncellenemedi. İnternet bağlantınızı kontrol edin.",
          type: "error",
          onConfirm: hideDialog,
        });
      });
  }, [orders, branchId, queryClient, t, showDialog, hideDialog, handleCancelItem]);

  const fetchAllTablesForTransfer = useCallback(async () => {
    if (!branchId) {
      showDialog({
        title: t("common.error"),
        message: t("common.noData"),
        type: "error",
        onConfirm: hideDialog,
      });
      return;
    }
    try {
      const response = await apiClient.get("/tables/", { params: { branch_id: branchId } });
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setAllTables(data.filter((t: any) => t.id !== id && t.status === "FREE"));
      setIsTransferModalVisible(true);
    } catch (error) {
      showDialog({
        title: t("common.error"),
        message: t("common.noData"),
        type: "error",
        onConfirm: hideDialog,
      });
    }
  }, [branchId, id, showDialog, hideDialog, t]);

  const handleTransferTable = async (targetTableId: string) => {
    setIsTransferring(true);
    try {
      await apiClient.post("/orders/main/transfer_table/", {
        from_table_id: id,
        to_table_id: targetTableId
      });
      setIsTransferModalVisible(false);
      if (branchId) {
        void queryClient.invalidateQueries({ queryKey: ["tables", branchId] });
        void queryClient.invalidateQueries({ queryKey: ["table", "detail", id] });
      }
      showDialog({
        title: t("common.success"),
        message: "Masa başarıyla transfer edildi.",
        type: "success",
        onConfirm: () => {
          hideDialog();
          router.replace("/(main)/tables");
        },
      });
    } catch (error) {
      showDialog({
        title: t("common.error"),
        message: t("tableDetail.transferError"),
        type: "error",
        onConfirm: hideDialog,
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancellingOrderId) return;
    setIsCancellingOrder(true);
    try {
      await apiClient.post(`/orders/main/${cancellingOrderId}/cancel/`, {
        reason_code: selectedReasonCode,
        reason_text: reasonDescription.trim() || undefined
      });
      setIsCancelModalVisible(false);
      setCancellingOrderId(null);
      setReasonDescription("");
      setSelectedReasonCode("MISTAKE");
      void fetchTableDetail();
      if (branchId) {
        void queryClient.invalidateQueries({ queryKey: ["dashboard", "stats", branchId] });
        void queryClient.invalidateQueries({ queryKey: ["orders", "main", "waiter", branchId] });
        void queryClient.invalidateQueries({ queryKey: ["tables", branchId] });
        void queryClient.invalidateQueries({ queryKey: ["tables-takeaway-virtual", branchId] });
      }
      setTimeout(() => {
        showDialog({
          title: t("common.success"),
          message: t("tableDetail.cancelOrderSuccess"),
          type: "success",
          onConfirm: hideDialog,
        });
      }, 100);
    } catch (error) {
      showDialog({
        title: t("common.error"),
        message: t("tableDetail.cancelOrderError"),
        type: "error",
        onConfirm: hideDialog,
      });
    } finally {
      setIsCancellingOrder(false);
    }
  };

  const getCleaningRemainingSeconds = useCallback((tbl: any): number | null => {
    if (tbl?.status !== "CLEANING") return null;
    const until = tbl.cleaning_until ? Date.parse(String(tbl.cleaning_until)) : NaN;
    if (Number.isFinite(until)) {
      return Math.max(0, Math.ceil((until - Date.now()) / 1000));
    }
    if (tbl.cleaning_remaining_seconds != null) {
      return Math.max(0, Math.floor(Number(tbl.cleaning_remaining_seconds)));
    }
    return null;
  }, []);

  const getCleaningRemainingLabel = (tbl: any): string | null => {
    const sec = getCleaningRemainingSeconds(tbl);
    if (sec == null) return null;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const handleFinishCleaning = async (options?: { silent?: boolean }) => {
    if (!id) return;
    setIsCleaningAction(true);
    try {
      const updated = await finishTableCleaning(String(id));
      setTable(updated);
      if (branchId) {
        void queryClient.invalidateQueries({ queryKey: ["tables", branchId] });
      }
      if (!options?.silent) {
        showDialog({
          title: t("common.success"),
          message: t("tableDetail.finishCleaningSuccess"),
          type: "success",
          onConfirm: hideDialog,
        });
      }
    } catch {
      if (!options?.silent) {
        showDialog({
          title: t("common.error"),
          message: t("tableDetail.cleaningActionError"),
          type: "error",
          onConfirm: hideDialog,
        });
      }
    } finally {
      setIsCleaningAction(false);
    }
  };

  const autoFinishSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (isTakeawayZone || table?.status !== "CLEANING") {
      autoFinishSessionRef.current = null;
      return;
    }
    const sessionKey = String(table.cleaning_until ?? table.id);
    const tick = () => {
      const seconds = getCleaningRemainingSeconds(table);
      if (seconds == null || seconds > 0) return;
      if (autoFinishSessionRef.current === sessionKey) return;
      autoFinishSessionRef.current = sessionKey;
      void handleFinishCleaning({ silent: true });
    };
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [table, isTakeawayZone, getCleaningRemainingSeconds]);

  const handleStartCleaning = async () => {
    if (!id) return;
    setIsCleaningAction(true);
    try {
      const updated = await startTableCleaning(String(id));
      setTable(updated);
      if (branchId) {
        void queryClient.invalidateQueries({ queryKey: ["tables", branchId] });
      }
      showDialog({
        title: t("common.success"),
        message: t("tableDetail.startCleaningSuccess"),
        type: "success",
        onConfirm: hideDialog,
      });
    } catch {
      showDialog({
        title: t("common.error"),
        message: t("tableDetail.cleaningActionError"),
        type: "error",
        onConfirm: hideDialog,
      });
    } finally {
      setIsCleaningAction(false);
    }
  };

  const totalAmount = useMemo(
    () => orders.reduce((acc, order) => acc + parseFloat(order.total_amount ?? "0"), 0),
    [orders]
  );

  const getItemStatusLabel = useCallback(
    (status: string) => getOrderItemStatusLabel(status, t),
    [t],
  );

  const handleCancelOrderPress = useCallback((orderId: string) => {
    setCancellingOrderId(orderId);
    setIsCancelModalVisible(true);
  }, []);

  const renderOrder = useCallback(({ item: order }: { item: any }) => (
    <OrderCard
      order={order}
      cancelLabel={t("tableDetail.cancelOrder")}
      getItemStatusLabel={getItemStatusLabel}
      onCancelOrder={handleCancelOrderPress}
      onUpdateItemQuantity={handleUpdateItemQuantity}
    />
  ), [getItemStatusLabel, handleCancelOrderPress, handleUpdateItemQuantity, t]);

  const occupiedListHeader = useMemo(() => (
    <View>
      <View className="bg-primary p-6 rounded-2xl mb-6 flex-row justify-between items-center">
        <View>
          <Text className="text-white/70 text-[10px] font-black uppercase tracking-wider mb-1">{t("tableDetail.totalAmount")}</Text>
          <Text className="text-white text-3xl font-black tracking-tight">{totalAmount.toFixed(2)}</Text>
        </View>
        <View className="bg-white/15 px-4 py-2 rounded-xl">
          <Text className="text-white font-black text-xs">{orders.length} Sipariş</Text>
        </View>
      </View>
      <Text className="text-foreground font-black text-base mb-4 ml-1 tracking-tight">{t("tableDetail.orderContent")}</Text>
    </View>
  ), [orders.length, t, totalAmount]);

  const occupiedListFooter = useMemo(() => (
    !id?.startsWith("tw-ord__") ? (
      <View className="mt-4 mb-10 gap-3">
        <Pressable
          onPress={() => router.push(`/(main)/table-order/${id}`)}
          className="active:scale-[0.98] bg-primary h-16 rounded-2xl items-center justify-center"
        >
          <Text className="text-primary-foreground font-black text-base">{t("tableDetail.addOrder")}</Text>
        </Pressable>

        <Pressable
          onPress={fetchAllTablesForTransfer}
          className="active:scale-[0.98] bg-secondary border border-border h-16 rounded-2xl items-center justify-center"
        >
          <Text className="text-foreground font-black text-base">{t("tableDetail.transferTable")}</Text>
        </Pressable>
      </View>
    ) : null
  ), [id, router, t, fetchAllTablesForTransfer]);

  if (isBootstrapping && !table) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#1E2A4A" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="px-4 py-3.5 flex-row justify-between items-center bg-card border-b border-border/40">
        <Pressable onPress={() => router.back()} className="active:scale-95 bg-secondary w-10 h-10 rounded-xl items-center justify-center border border-border">
          <ChevronLeft size={22} color="#1E2A4A" />
        </Pressable>
        <View className="items-center">
          <Text className="text-foreground font-black text-lg tracking-tight">{table?.name}</Text>
          <Text className="text-muted-foreground text-[9px] font-black uppercase tracking-wider mt-0.5">{table?.zone_name}</Text>
        </View>
        <Pressable
          onPress={() => void fetchTableDetail()}
          className="active:scale-95 bg-primary/10 px-4 py-2 rounded-xl"
        >
          <Text className="text-primary font-bold text-xs">{t("common.refresh")}</Text>
        </Pressable>
      </View>

      {table?.status === "OCCUPIED" ? (
        <FlashListAny
          data={orders}
          keyExtractor={(order: any) => String(order.id)}
          estimatedItemSize={70}
          renderItem={renderOrder}
          ListHeaderComponent={occupiedListHeader}
          ListFooterComponent={occupiedListFooter}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void fetchTableDetail()}
              tintColor="#1E2A4A"
            />
          }
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-4"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void fetchTableDetail()}
              tintColor="#1E2A4A"
            />
          }
        >
        {!isTakeawayZone && table?.status === "CLEANING" ? (
          <View className="items-center justify-center py-20 px-6">
            <View className="w-20 h-20 bg-sky-50 dark:bg-sky-950/20 rounded-full items-center justify-center mb-6">
              <Utensils size={36} color="#0EA5E9" />
            </View>
            <Text className="text-foreground text-2xl font-black mb-2 tracking-tight">{t("tableDetail.cleaningTitle")}</Text>
            <Text className="text-muted-foreground text-center mb-4 px-4 text-xs font-semibold leading-relaxed">
              {t("tableDetail.cleaningDesc")}
            </Text>
            {(() => {
              const cleaningRemaining = getCleaningRemainingLabel(table);
              if (!cleaningRemaining) return null;
              return (
                <Text className="text-sky-600 dark:text-sky-400 font-black text-lg mb-8 tabular-nums">
                  {t("tableDetail.cleaningRemaining", { time: cleaningRemaining })}
                </Text>
              );
            })()}
            {(getCleaningRemainingSeconds(table) ?? 1) > 0 ? (
              <Pressable
                disabled={isCleaningAction}
                onPress={() => void handleFinishCleaning()}
                className="active:scale-[0.98] bg-primary w-full h-16 rounded-2xl items-center justify-center"
              >
                {isCleaningAction ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-primary-foreground font-black text-base">{t("tableDetail.finishCleaning")}</Text>
                )}
              </Pressable>
            ) : isCleaningAction ? (
              <ActivityIndicator color="#1E2A4A" size="large" />
            ) : null}
          </View>
        ) : (
          <View className="items-center justify-center py-20">
            <View className="w-20 h-20 bg-primary/10 rounded-full items-center justify-center mb-6">
              <Utensils size={36} color="#1E2A4A" />
            </View>
            <Text className="text-foreground text-2xl font-black mb-2 tracking-tight">{t("tableDetail.emptyTable")}</Text>
            <Text className="text-muted-foreground text-center mb-10 px-10 text-xs font-semibold leading-relaxed">
              {t("tableDetail.emptyTableDesc")}
            </Text>
            <View className="w-full gap-3">
              <Pressable onPress={() => router.push(`/(main)/table-order/${id}`)}
                className="active:scale-[0.98] bg-primary w-full h-16 rounded-2xl items-center justify-center"
              >
                <Text className="text-primary-foreground font-black text-base">{t("tableDetail.openTable")}</Text>
              </Pressable>
              {!isTakeawayZone ? (
                <Pressable
                  disabled={isCleaningAction}
                  onPress={() => void handleStartCleaning()}
                  className="active:scale-[0.98] bg-sky-500 w-full h-16 rounded-2xl items-center justify-center"
                >
                  {isCleaningAction ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-black text-base">{t("tableDetail.startCleaning")}</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
        </ScrollView>
      )}

      {/* Transfer Table Modal Component */}
      <TransferTableModal
        visible={isTransferModalVisible}
        allTables={allTables}
        onClose={() => setIsTransferModalVisible(false)}
        onTransfer={handleTransferTable}
        t={t}
      />

      {/* Cancel Order Modal Component */}
      <CancelOrderModal
        visible={isCancelModalVisible}
        isCancelling={isCancellingOrder}
        selectedReasonCode={selectedReasonCode}
        reasonDescription={reasonDescription}
        setSelectedReasonCode={setSelectedReasonCode}
        setReasonDescription={setReasonDescription}
        onClose={() => setIsCancelModalVisible(false)}
        onSubmit={handleCancelOrder}
        t={t}
      />

      {/* Global Premium Custom Dialog */}
      <CustomDialog
        visible={dialogConfig.visible}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        confirmLabel={dialogConfig.confirmLabel}
        cancelLabel={dialogConfig.cancelLabel}
        onConfirm={dialogConfig.onConfirm}
        onCancel={dialogConfig.onCancel}
      />
    </SafeAreaView>
  );
}
