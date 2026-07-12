// ============================================================
// ActiveOrderStrip — Menü ekranında canlı sipariş durumu
//
// useOrderStore.activeOrders'a abone olur, WebSocket
// güncellemeleriyle eş zamanlı çalışır. Sipariş olmadığında
// hiç render edilmez (null döner).
// ============================================================

import React, { useMemo, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Clock,
  CookingPot,
  CheckCircle2,
  Bell,
  UtensilsCrossed,
  ChevronRight,
  XCircle,
} from "lucide-react-native";
import { useOrderStore } from "@/store/order-store";
import { useUIStore } from "@/store/ui-store";
import { useTheme } from "@/hooks/useTheme";
import {
  deriveCustomerOrderDisplayStatus,
  countDeliveredItems,
  countActiveItems,
  getCustomerStatusProgressPercent,
  type CustomerOrderDisplayStatus,
} from "@/utils/customerOrderStatus";
import {
  getCustomerStatusColor,
  getCustomerStatusLabel,
  getCustomerStatusBadgeColors,
} from "@/utils/format";
import type { Order } from "@/types";

// ─── Status Icon (compact) ─────────────────────────────────

const StatusIcon = ({
  status,
  size = 16,
}: {
  status: CustomerOrderDisplayStatus;
  size?: number;
}) => {
  const color = getCustomerStatusColor(status);
  switch (status) {
    case "SENT_TO_KITCHEN":
      return <Clock size={size} color={color} />;
    case "PREPARING":
      return <CookingPot size={size} color={color} />;
    case "PREPARED":
      return <CheckCircle2 size={size} color={color} />;
    case "ON_THE_WAY":
      return <Bell size={size} color={color} />;
    case "DELIVERED":
    case "COMPLETED":
      return <UtensilsCrossed size={size} color={color} />;
    case "CANCELLED":
      return <XCircle size={size} color={color} />;
    default:
      return <Clock size={size} color={color} />;
  }
};

// ─── Single Order Pill ────────────────────────────────────

interface OrderPillProps {
  order: Order;
  language: "tr" | "en";
  onPress: (order: Order) => void;
}

const OrderPill = React.memo(({ order, language, onPress }: OrderPillProps) => {
  const { colors } = useTheme();
  const displayStatus = useMemo(
    () => deriveCustomerOrderDisplayStatus(order),
    [order],
  );
  const badgeColors = getCustomerStatusBadgeColors(displayStatus);
  const progress = useMemo(
    () => getCustomerStatusProgressPercent(displayStatus),
    [displayStatus],
  );
  const activeCount = countActiveItems(order.items);
  const deliveredCount = countDeliveredItems(order.items);
  const statusLabel = getCustomerStatusLabel(displayStatus, language);

  const pillCardStyle = useMemo(
    () => ({
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: badgeColors.bg,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 } as const,
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    }),
    [colors.card, badgeColors.bg],
  );

  return (
    <Pressable
      onPress={() => onPress(order)}
      className="rounded-2xl mr-3 overflow-hidden active:opacity-80"
      style={pillCardStyle}
    >
      <View className="px-4 py-3 min-w-[160px]">
        {/* Header — order # + status icon */}
        <View className="flex-row items-center justify-between mb-2">
          <Text
            className="text-[12px] font-bold"
            style={{ color: colors.mutedForeground }}
          >
            #{order.id.slice(-4)}
          </Text>
          <View
            className="px-2 py-0.5 rounded-full flex-row items-center"
            style={{ backgroundColor: badgeColors.bg }}
          >
            <StatusIcon status={displayStatus} size={12} />
            <Text
              className="text-[10px] font-semibold ml-1"
              style={{ color: badgeColors.text }}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View
          className="h-1 rounded-full overflow-hidden mb-2"
          style={{ backgroundColor: colors.muted }}
        >
          <View
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              backgroundColor:
                displayStatus === "CANCELLED"
                  ? colors.destructive
                  : colors.success,
            }}
          />
        </View>

        {/* Item count */}
        <View className="flex-row items-center justify-between">
          <Text
            className="text-[11px]"
            style={{ color: colors.mutedForeground }}
          >
            {deliveredCount}/{activeCount}{" "}
            {language === "tr" ? "teslim" : "del"}
          </Text>
          <ChevronRight size={14} color={colors.icon} />
        </View>
      </View>
    </Pressable>
  );
});

OrderPill.displayName = "OrderPill";

// ─── ActiveOrderStrip ─────────────────────────────────────

const ActiveOrderStrip = React.memo(function ActiveOrderStrip() {
  const router = useRouter();
  const activeOrders = useOrderStore((s) => s.activeOrders);
  const language = useUIStore((s) => s.language);
  const { colors } = useTheme();

  // Animasyon — strip görünürlüğüne göre yumuşak geçiş
  const opacity = useSharedValue(activeOrders.length > 0 ? 1 : 0);
  const height = useSharedValue(activeOrders.length > 0 ? 1 : 0);

  useEffect(() => {
    if (activeOrders.length > 0) {
      opacity.value = withTiming(1, { duration: 300 });
      height.value = withSpring(1, { damping: 24, stiffness: 280 });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      height.value = withSpring(0, { damping: 28, stiffness: 320 });
    }
  }, [activeOrders.length, height, opacity]);

  const stripAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    maxHeight: height.value * 140, // maksimum yükseklik ~140px
    overflow: "hidden",
  }));

  const handleOrderPress = useCallback(
    (_order: Order) => {
      router.push("/(tabs)/orders");
    },
    [router],
  );

  if (activeOrders.length === 0) {
    // Tamamen gizlemek yerine animasyonlu collapse için boş View
    return (
      <Animated.View style={stripAnimatedStyle}>
        <View style={{ height: 0 }} />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={stripAnimatedStyle}>
      <View
        className="px-5 pb-2"
        style={{ backgroundColor: colors.background }}
      >
        {/* Label */}
        <View className="flex-row items-center justify-between mb-2 mt-1">
          <Text
            className="text-[13px] font-bold"
            style={{ color: colors.foreground }}
          >
            {language === "tr" ? "Aktif Siparişlerim" : "My Active Orders"}
          </Text>
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: colors.success }}
          />
        </View>

        {/* Horizontal scrollable pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 20 }}
          decelerationRate="fast"
          snapToInterval={176} // min-w-[160px] + mr-3 = yaklaşık 172-176
          snapToAlignment="start"
        >
          {activeOrders.map((order) => (
            <OrderPill
              key={order.id}
              order={order}
              language={language}
              onPress={handleOrderPress}
            />
          ))}
        </ScrollView>
      </View>
    </Animated.View>
  );
});

export default ActiveOrderStrip;
