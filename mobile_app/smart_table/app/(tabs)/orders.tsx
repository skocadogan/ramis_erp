// ============================================================
// Smart Table — Orders Screen
//
// Shows active orders for the current table only. Completed/paid
// orders are cleared when POS payment completes (no order history).
// ============================================================

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import {
  ClipboardList,
  Coffee,
  UtensilsCrossed,
  ShoppingCart,
} from "lucide-react-native";
import { useUIStore } from "@/store/ui-store";
import { useOrderStore } from "@/store/order-store";
import { useDialogStore } from "@/store/dialog-store";
import { useTableStore } from "@/store/table-store";
import { useCartStore } from "@/store/cart-store";
import { useTheme } from "@/hooks/useTheme";
import { useFabBottomOffset } from "@/hooks/useTabBarHeight";
import OrderCard from "@/components/order/OrderCard";
import OrderDetailSheet from "@/components/order/OrderDetailSheet";
import React, { Suspense } from "react";
const CartSheet = React.lazy(() => import("@/components/order/CartSheet"));
import { formatPrice } from "@/utils/format";
import type { Order } from "@/types";

export default function OrdersScreen() {
  const router = useRouter();
  const language = useUIStore((s) => s.language);
  const { isDark, colors } = useTheme();
  const fabBottom = useFabBottomOffset();
  const activeOrders = useOrderStore((s) => s.activeOrders);
  const isLoadingOrders = useOrderStore((s) => s.isLoading);
  const ordersError = useOrderStore((s) => s.error);
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const fetchOrders = useOrderStore((s) => s.fetchOrders);
  const placeOrder = useOrderStore((s) => s.placeOrder);
  const selectedTableId = useTableStore((s) => s.selectedTable?.id);

  const [refreshing, setRefreshing] = useState(false);
  const [isCartVisible, setCartVisible] = useState(false);

  // Order detail sheet — orderId ile store'dan canlı okunur (WS güncellemeleri)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDetailVisible, setDetailVisible] = useState(false);

  const selectedOrder = useMemo(
    () =>
      selectedOrderId
        ? (activeOrders.find((o) => o.id === selectedOrderId) ?? null)
        : null,
    [activeOrders, selectedOrderId],
  );

  const hasActiveOrders = activeOrders.length > 0;

  const grandTotal = useMemo(
    () => activeOrders.reduce((sum, order) => sum + order.totalAmount, 0),
    [activeOrders],
  );

  // ── Fetch orders on tab focus — her sekme değişiminde API'den taze veri ──
  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders]),
  );

  // ── Open cart sheet only when cart goes from empty → non-empty ──
  const prevCartCountRef = useRef(0);
  useEffect(() => {
    const prev = prevCartCountRef.current;
    prevCartCountRef.current = items.length;
    if (prev === 0 && items.length > 0) {
      setCartVisible(true);
    }
  }, [items.length]);

  // ── Pull to refresh ──
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  // ── Handle Placing Order ──
  const handlePlaceOrder = useCallback(async () => {
    if (items.length === 0) return;
    if (useOrderStore.getState().isPlacingOrder) return;
    if (!selectedTableId) {
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Hata" : "Error",
          language === "tr"
            ? "Sipariş vermek için masa seçmelisiniz."
            : "Please select a table before ordering.",
        );
      return;
    }
    try {
      setRefreshing(true);
      const note = useCartStore.getState().note;
      await placeOrder(items, selectedTableId, note);
      clearCart();
      setCartVisible(false);
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Başarılı" : "Success",
          language === "tr"
            ? "Siparişiniz başarıyla mutfağa iletildi."
            : "Your order has been successfully sent to the kitchen.",
        );
      router.replace("/(tabs)/menu");
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.name === "OrderAlreadyInFlightError"
      ) {
        return;
      }
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Hata" : "Error",
          err instanceof Error
            ? err.message
            : language === "tr"
              ? "Sipariş gönderilemedi"
              : "Failed to place order",
        );
    } finally {
      setRefreshing(false);
    }
  }, [items, placeOrder, clearCart, language, selectedTableId, router]);

  // ── Order press opens inline detail sheet ──
  const handleOrderPress = useCallback((order: Order) => {
    setSelectedOrderId(order.id);
    setDetailVisible(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailVisible(false);
    setSelectedOrderId(null);
  }, []);

  // Sipariş tamamlandı/iptal → detay kapanır
  useEffect(() => {
    if (isDetailVisible && selectedOrderId && !selectedOrder) {
      setDetailVisible(false);
      setSelectedOrderId(null);
    }
  }, [isDetailVisible, selectedOrderId, selectedOrder]);

  // ── Texts ──
  const t = {
    title: language === "tr" ? "Siparişlerim" : "My Orders",
    activeOrders: language === "tr" ? "Aktif Siparişler" : "Active Orders",
    noActiveOrders:
      language === "tr" ? "Henüz siparişiniz bulunmuyor" : "No orders yet",
    noActiveOrdersDesc:
      language === "tr"
        ? "Menüden lezzetleri keşfederek sipariş vermeye başlayın."
        : "Start ordering by exploring the menu.",
    startOrdering: language === "tr" ? "Menüyü Keşfet" : "Explore Menu",
    activeTab: language === "tr" ? "Aktif" : "Active",
    itemsLabel: language === "tr" ? "ürün" : "item",
    grandTotal: language === "tr" ? "Genel Toplam" : "Grand Total",
    retry: language === "tr" ? "Tekrar Dene" : "Retry",
  };

  const renderOrderItem = useCallback(
    ({ item }: { item: Order }) => (
      <OrderCard order={item} language={language} onPress={handleOrderPress} />
    ),
    [language, handleOrderPress],
  );

  const listHeader = useMemo(
    () => (
      <>
        {ordersError && !isLoadingOrders ? (
          <View
            className="mx-5 mt-3 flex-row items-center gap-2 rounded-lg border px-3 py-2"
            style={{
              backgroundColor: isDark
                ? `${colors.warning}26`
                : `${colors.warning}15`,
              borderColor: isDark
                ? `${colors.warning}66`
                : `${colors.warning}44`,
            }}
          >
            <Text
              className="text-xs font-medium flex-1"
              style={{ color: colors.foreground }}
            >
              {ordersError}
            </Text>
            <Pressable onPress={onRefresh}>
              <Text
                className="text-xs font-bold"
                style={{ color: colors.warning }}
              >
                {t.retry}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {hasActiveOrders ? (
          <View className="px-5 pt-5">
            <Text
              className="text-base font-bold mb-4"
              style={{ color: colors.foreground }}
            >
              {t.activeOrders}
            </Text>
          </View>
        ) : null}
      </>
    ),
    [
      ordersError,
      isLoadingOrders,
      hasActiveOrders,
      isDark,
      colors,
      onRefresh,
      t.retry,
      t.activeOrders,
    ],
  );

  const listEmpty = useMemo(() => {
    if (isLoadingOrders) {
      return (
        <View className="items-center justify-center py-24">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    return (
      <View className="items-center justify-center px-8 py-24">
        <View
          className="w-24 h-24 rounded-full items-center justify-center mb-6"
          style={{ backgroundColor: colors.muted }}
        >
          <Coffee
            size={48}
            color={colors.primary}
            strokeWidth={1.2}
            opacity={0.6}
          />
        </View>
        <Text
          className="text-xl font-bold text-center mb-2"
          style={{ color: colors.foreground }}
        >
          {t.noActiveOrders}
        </Text>
        <Text
          className="text-base text-center leading-relaxed max-w-xs mb-8"
          style={{ color: colors.mutedForeground }}
        >
          {t.noActiveOrdersDesc}
        </Text>
        <View className="flex-row gap-6 mb-8 opacity-30">
          <UtensilsCrossed size={28} color={colors.primary} strokeWidth={1} />
          <Coffee size={28} color={colors.warning} strokeWidth={1} />
          <UtensilsCrossed size={28} color={colors.success} strokeWidth={1} />
        </View>
        <Pressable
          onPress={() => router.push("/(tabs)/menu")}

          className="h-[52px] px-8 rounded-2xl items-center justify-center"
          style={{ backgroundColor: colors.primary }}
        >
          <Text
            className="text-base font-bold"
            style={{ color: colors.primaryForeground }}
          >
            {t.startOrdering}
          </Text>
        </Pressable>
      </View>
    );
  }, [isLoadingOrders, colors, t, router]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${colors.primary}1A`,
              }}
            >
              <ClipboardList
                size={22}
                color={colors.primary}
                strokeWidth={1.8}
              />
            </View>
            <View>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: colors.foreground,
                }}
              >
                {t.title}
              </Text>
              {hasActiveOrders && (
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  {activeOrders.length} {t.activeTab} • {items.length}{" "}
                  {t.itemsLabel}
                </Text>
              )}
            </View>
          </View>
          {hasActiveOrders && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.success,
                }}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "500",
                  color: colors.success,
                }}
              >
                {t.activeTab}
              </Text>
            </View>
          )}
        </View>

        <FlatList
          data={hasActiveOrders ? activeOrders : []}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          contentContainerStyle={{
            paddingBottom: fabBottom + 80,
            paddingHorizontal: hasActiveOrders ? 20 : 0,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />

        {hasActiveOrders && (
          <View
            style={{
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.foreground,
                }}
              >
                {t.grandTotal}
              </Text>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: colors.primary,
                }}
              >
                {formatPrice(grandTotal)}
              </Text>
            </View>
          </View>
        )}

        {/* ── Floating Cart Button ── */}
        {items.length > 0 && (
          <View
            className="absolute left-6 shadow-xl"
            style={{
              bottom: fabBottom,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.35,
              shadowRadius: 16,
              elevation: 10,
            }}
          >
            <Pressable
              onPress={() => setCartVisible(true)}

              className="flex-row items-center gap-2.5 h-[56px] px-5 rounded-2xl"
              style={{ backgroundColor: colors.success }}
              accessibilityRole="button"
              accessibilityLabel={
                language === "tr" ? "Sepeti görüntüle" : "View cart"
              }
            >
              <View className="relative">
                <ShoppingCart
                  size={22}
                  color={colors.successForeground}
                  strokeWidth={2}
                />
                <View
                  className="absolute -top-2 -right-2 min-w-[18px] h-[18px] rounded-full items-center justify-center px-1"
                  style={{ backgroundColor: colors.successForeground }}
                >
                  <Text
                    className="text-[9px] font-bold"
                    style={{ color: colors.success }}
                  >
                    {items.reduce((sum, item) => sum + item.quantity, 0)}
                  </Text>
                </View>
              </View>
              <View className="w-px h-6 bg-white/30" />
              <Text
                className="text-base font-bold"
                style={{ color: colors.successForeground }}
              >
                {language === "tr" ? "Sepeti Gör" : "View Cart"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Order Detail Inline Sheet ── */}
      <OrderDetailSheet
        orderId={selectedOrderId}
        visible={isDetailVisible && !!selectedOrder}
        onClose={handleCloseDetail}
        language={language}
      />

      {/* ── Cart Bottom Sheet ── */}
      <Suspense fallback={null}>
        <CartSheet
          visible={isCartVisible}
          onClose={() => setCartVisible(false)}
          onAddProduct={() => {
            setCartVisible(false);
            router.replace("/(tabs)/menu");
          }}
          onPlaceOrder={handlePlaceOrder}
          language={language}
        />
      </Suspense>
    </SafeAreaView>
  );
}
