// ============================================================
// OrderDetailSheet — Full order detail modal/sheet
// Shows status timeline, items grouped by status,
// total breakdown, with cancel functionality
// ============================================================

import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import {
  X,
  Ban,
  CheckCircle2,
  Clock,
  CookingPot,
  Bell,
  Utensils,
  FileText,
} from "lucide-react-native";
import {
  formatPrice,
  formatDate,
  formatDateEn,
  getCustomerStatusLabel,
} from "@/utils/format";
import OrderTimeline from "@/components/order/OrderTimeline";
import {
  deriveCustomerOrderDisplayStatus,
  deriveCustomerItemDisplayStatus,
  getDisplayOrderItems,
  type CustomerOrderDisplayStatus,
} from "@/utils/customerOrderStatus";
import { useOrderStore } from "@/store/order-store";
import { useDialogStore } from "@/store/dialog-store";
import type { Order, OrderItem } from "@/types";
import { useTheme, type ThemeColors } from "@/hooks/useTheme";

const TABLET_MIN_WIDTH = 768;

// ─── Status Badge Colors ───────────────────────────────────

function getStatusBadgeStyles(
  status: CustomerOrderDisplayStatus,
  colors: ThemeColors,
) {
  switch (status) {
    case "SENT_TO_KITCHEN":
    case "PREPARING":
      return {
        container: { backgroundColor: `${colors.primary}26` },
        text: { color: colors.primary },
      };
    case "PREPARED":
    case "DELIVERED":
    case "COMPLETED":
      return {
        container: { backgroundColor: `${colors.success}26` },
        text: { color: colors.success },
      };
    case "ON_THE_WAY":
      return {
        container: { backgroundColor: `${colors.warning}26` },
        text: { color: colors.warning },
      };
    case "CANCELLED":
      return {
        container: { backgroundColor: `${colors.destructive}26` },
        text: { color: colors.destructive },
      };
    default:
      return {
        container: { backgroundColor: colors.muted },
        text: { color: colors.mutedForeground },
      };
  }
}

// ─── Item Status Icon ──────────────────────────────────────

const ItemStatusIcon = ({ status }: { status: CustomerOrderDisplayStatus }) => {
  const size = 16;
  switch (status) {
    case "SENT_TO_KITCHEN":
      return <Clock size={size} color="#3B82F6" />;
    case "PREPARING":
      return <CookingPot size={size} color="#8B5CF6" />;
    case "PREPARED":
      return <CheckCircle2 size={size} color="#059669" />;
    case "ON_THE_WAY":
      return <Bell size={size} color="#F59E0B" />;
    case "DELIVERED":
    case "COMPLETED":
      return <Utensils size={size} color="#059669" />;
    case "CANCELLED":
      return <Ban size={size} color="#EF4444" />;
    default:
      return <Clock size={size} color="#059669" />;
  }
};

// ─── Order Item Row ────────────────────────────────────────

interface OrderItemRowProps {
  item: OrderItem;
  language: "tr" | "en";
  onCancel?: (item: OrderItem) => void;
}

const OrderItemRow = React.memo(
  ({ item, language, onCancel }: OrderItemRowProps) => {
    const itemDisplayStatus = deriveCustomerItemDisplayStatus(item);
    const { colors } = useTheme();
    const hideZeroPrice =
      !!item.isCombinedProduct && item.unitPrice === 0 && item.totalPrice === 0;
    const unitLabel =
      language === "tr" ? item.unitName : item.unitNameEn || item.unitName;
    const combinedPartLines =
      item.combinedParts && item.combinedParts.length > 0
        ? item.combinedParts
            .map((part) => {
              const displayQuantity = (
                item.isCombinedProduct ? item.quantity : part.quantityTotal
              ).toLocaleString(language === "tr" ? "tr-TR" : "en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 4,
              });
              return [part.productName, `x${displayQuantity}`, part.unitName]
                .filter(Boolean)
                .join(" ");
            })
            .filter(Boolean)
        : [];
    const detailLineParts = [
      unitLabel,
      hideZeroPrice
        ? null
        : `${formatPrice(item.unitPrice)} x ${item.quantity}`,
      hideZeroPrice ? `x ${item.quantity}` : null,
    ].filter(Boolean);

    return (
      <View
        className="rounded-xl px-4 py-3 mb-2 border"
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
        }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 mr-3">
            <ItemStatusIcon status={itemDisplayStatus} />
            <View className="ml-2.5 flex-1">
              <Text
                className="text-[15px] font-semibold"
                style={{ color: colors.foreground }}
              >
                {language === "tr" ? item.productName : item.productNameEn}
              </Text>
              <Text
                className="text-[13px] mt-0.5"
                style={{ color: colors.mutedForeground }}
              >
                {detailLineParts.join(" · ")}
              </Text>
              {combinedPartLines.length > 0 ? (
                <View className="mt-1 ml-3 gap-0.5">
                  {combinedPartLines.map((line, lineIndex) => (
                    <Text
                      key={`${item.id}-part-${lineIndex}`}
                      className="text-[12px]"
                      style={{ color: colors.mutedForeground }}
                    >
                      {line}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          {hideZeroPrice ? null : (
            <Text
              className="text-[16px] font-bold"
              style={{ color: colors.foreground }}
            >
              {formatPrice(item.totalPrice)}
            </Text>
          )}
        </View>

        {/* Modifiers */}
        {item.modifiers.length > 0 && (
          <View
            className="flex-row flex-wrap gap-1.5 mt-2 pt-2 border-t"
            style={{ borderTopColor: colors.border }}
          >
            {item.modifiers.map((mod, idx) => (
              <View
                key={`${mod.modifierId}-${idx}`}
                className="px-2.5 py-1 rounded-full"
                style={{ backgroundColor: colors.accent }}
              >
                <Text
                  className="text-[12px]"
                  style={{ color: colors.accentForeground }}
                >
                  {mod.modifierName}
                  {mod.price > 0 && (
                    <Text style={{ color: colors.primary }}>
                      {" "}
                      +{formatPrice(mod.price)}
                    </Text>
                  )}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Item Note */}
        {item.note ? (
          <View
            className="flex-row items-start mt-2 pt-2 border-t"
            style={{ borderTopColor: colors.border }}
          >
            <FileText size={14} color={colors.icon} />
            <Text
              className="text-[12px] ml-1.5 flex-1 italic"
              style={{ color: colors.mutedForeground }}
            >
              {item.note}
            </Text>
          </View>
        )}

        {/* Cancel Item Action */}
        {(itemDisplayStatus === "SENT_TO_KITCHEN" ||
          itemDisplayStatus === "PREPARING") &&
          onCancel && (
            <View
              className="flex-row justify-end mt-2 pt-2 border-t"
              style={{ borderTopColor: colors.border }}
            >
              <Pressable
                onPress={() => onCancel(item)}
                className="px-3 py-1.5 rounded-lg active:opacity-75"
                style={{ backgroundColor: `${colors.destructive}15` }}
              >
                <Text
                  className="text-[12px] font-bold"
                  style={{ color: colors.destructive }}
                >
                  {language === "tr" ? "Ürünü İptal Et" : "Cancel Item"}
                </Text>
              </Pressable>
            </View>
          )}
      </View>
    );
  },
);

OrderItemRow.displayName = "OrderItemRow";

// ─── Section Title ─────────────────────────────────────────

const SectionTitle = ({ title, count }: { title: string; count: number }) => {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center mb-3 mt-4 first:mt-0">
      <View
        className="w-1 h-5 rounded-full mr-3"
        style={{ backgroundColor: colors.primary }}
      />
      <Text
        className="text-[17px] font-bold"
        style={{ color: colors.foreground }}
      >
        {title}
      </Text>
      <View
        className="ml-2 px-2.5 py-0.5 rounded-full"
        style={{ backgroundColor: `${colors.primary}26` }}
      >
        <Text
          className="text-[12px] font-semibold"
          style={{ color: colors.primary }}
        >
          {count}
        </Text>
      </View>
    </View>
  );
};

// ─── Shared Sub-components ─────────────────────────────────

const statusOrder: CustomerOrderDisplayStatus[] = [
  "SENT_TO_KITCHEN",
  "PREPARING",
  "PREPARED",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
];

const OrderDetailHeader = React.memo(function OrderDetailHeader({
  order,
  language,
  onClose,
}: {
  order: Order;
  language: "tr" | "en";
  onClose: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      className="flex-row items-center justify-between px-6 py-3 border-b"
      style={{ borderBottomColor: colors.border }}
    >
      <View>
        <Text
          className="text-[20px] font-bold"
          style={{ color: colors.foreground }}
        >
          {language === "tr" ? "Sipariş Detayı" : "Order Detail"}
        </Text>
        <Text
          className="text-[13px] mt-0.5"
          style={{ color: colors.mutedForeground }}
        >
          #{order.id.slice(-5)} &middot; {order.tableName}
        </Text>
      </View>
      <Pressable
        onPress={onClose}
        className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
        style={{ backgroundColor: colors.muted }}
        hitSlop={8}
      >
        <X size={22} color={colors.icon} />
      </Pressable>
    </View>
  );
});

const OrderDetailStatusBadge = React.memo(function OrderDetailStatusBadge({
  displayStatus,
  order,
  language,
}: {
  displayStatus: CustomerOrderDisplayStatus;
  order: Order;
  language: "tr" | "en";
}) {
  const { colors } = useTheme();
  const badgeStyles = getStatusBadgeStyles(displayStatus, colors);
  return (
    <View className="flex-row items-center flex-wrap gap-2">
      <View className="px-4 py-2 rounded-full" style={badgeStyles.container}>
        <Text className="text-[14px] font-semibold" style={badgeStyles.text}>
          {getCustomerStatusLabel(displayStatus, language)}
        </Text>
      </View>
      <Text className="text-[13px]" style={{ color: colors.mutedForeground }}>
        {language === "tr"
          ? formatDate(order.createdAt)
          : formatDateEn(order.createdAt)}
      </Text>
    </View>
  );
});

const OrderDetailItems = React.memo(function OrderDetailItems({
  order,
  language,
  onCancel,
}: {
  order: Order;
  language: "tr" | "en";
  onCancel?: (item: OrderItem) => void;
}) {
  const { colors } = useTheme();
  const displayItems = React.useMemo(
    () => getDisplayOrderItems(order.items),
    [order.items],
  );

  const groupedItems = React.useMemo(() => {
    const groups = new Map<CustomerOrderDisplayStatus, OrderItem[]>();
    displayItems.forEach((item) => {
      const key = deriveCustomerItemDisplayStatus(item);
      const existing = groups.get(key) || [];
      existing.push(item);
      groups.set(key, existing);
    });
    return groups;
  }, [displayItems]);

  return (
    <View>
      <SectionTitle
        title={language === "tr" ? "Ürünler" : "Items"}
        count={displayItems.length}
      />

      {statusOrder.map((statusKey) => {
        const items = groupedItems.get(statusKey);
        if (!items || items.length === 0) return null;

        return (
          <View key={statusKey} className="mb-3">
            <View className="flex-row items-center mb-2 mt-1">
              <ItemStatusIcon status={statusKey} />
              <Text
                className="text-[13px] font-medium ml-1.5"
                style={{ color: colors.mutedForeground }}
              >
                {getCustomerStatusLabel(statusKey, language)}
              </Text>
            </View>
            {items.map((item) => (
              <OrderItemRow
                key={item.id}
                item={item}
                language={language}
                onCancel={onCancel}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
});

const OrderDetailNote = React.memo(function OrderDetailNote({
  note,
  language,
}: {
  note: string;
  language: "tr" | "en";
}) {
  const { colors } = useTheme();
  return (
    <View
      className="mb-4 p-4 rounded-xl flex-row items-start"
      style={{ backgroundColor: colors.accent }}
    >
      <FileText size={18} color={colors.primary} />
      <View className="ml-3 flex-1">
        <Text
          className="text-[13px] font-semibold mb-1"
          style={{ color: colors.accentForeground }}
        >
          {language === "tr" ? "Sipariş Notu" : "Order Note"}
        </Text>
        <Text
          className="text-[14px]"
          style={{ color: colors.accentForeground }}
        >
          {note}
        </Text>
      </View>
    </View>
  );
});

const OrderDetailPaymentSummary = React.memo(
  function OrderDetailPaymentSummary({
    totalAmount,
    language,
  }: {
    totalAmount: number;
    language: "tr" | "en";
  }) {
    const { colors } = useTheme();
    return (
      <View
        className="p-5 rounded-2xl border"
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
        }}
      >
        <Text
          className="text-[15px] font-bold mb-3"
          style={{ color: colors.foreground }}
        >
          {language === "tr" ? "Ödeme Özeti" : "Payment Summary"}
        </Text>

        <View
          className="flex-row justify-between py-2 border-b"
          style={{ borderBottomColor: colors.border }}
        >
          <Text
            className="text-[14px]"
            style={{ color: colors.mutedForeground }}
          >
            {language === "tr" ? "Ara Toplam" : "Subtotal"}
          </Text>
          <Text
            className="text-[14px] font-medium"
            style={{ color: colors.foreground }}
          >
            {formatPrice(totalAmount)}
          </Text>
        </View>
        <View
          className="flex-row justify-between py-2 border-b"
          style={{ borderBottomColor: colors.border }}
        >
          <Text
            className="text-[14px]"
            style={{ color: colors.mutedForeground }}
          >
            {language === "tr" ? "KDV" : "VAT"}
          </Text>
          <Text
            className="text-[14px] font-medium"
            style={{ color: colors.foreground }}
          >
            {language === "tr" ? "Dahil" : "Included"}
          </Text>
        </View>
        <View className="flex-row justify-between pt-3">
          <Text
            className="text-[16px] font-bold"
            style={{ color: colors.foreground }}
          >
            {language === "tr" ? "Toplam" : "Total"}
          </Text>
          <Text
            className="text-[22px] font-bold"
            style={{ color: colors.primary }}
          >
            {formatPrice(totalAmount)}
          </Text>
        </View>
      </View>
    );
  },
);

// ─── OrderDetailSheet ──────────────────────────────────────

interface OrderDetailSheetProps {
  orderId: string | null;
  visible: boolean;
  onClose: () => void;
  language?: "tr" | "en";
  /** Optional custom sheet height (ratio between 0.1 and 1.0, exact pixels, or percentage string) */
  height?: number | string;
}

export default function OrderDetailSheet({
  orderId,
  visible,
  onClose,
  language = "tr",
  height,
}: OrderDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth >= TABLET_MIN_WIDTH;
  const order = useOrderStore((s) =>
    orderId ? (s.activeOrders.find((o) => o.id === orderId) ?? null) : null,
  );
  const { colors } = useTheme();

  const customHeightValue =
    typeof height === "number"
      ? height <= 1
        ? screenHeight * height
        : height
      : typeof height === "string" && height.endsWith("%")
        ? screenHeight * (parseFloat(height) / 100)
        : typeof height === "string"
          ? parseFloat(height)
          : null;

  const defaultHeight = screenHeight * (isTablet ? 0.75 : 0.88);
  const sheetHeight = Math.min(
    customHeightValue ?? defaultHeight,
    screenHeight - insets.top - 12,
  );

  // ── Animation ───────────────────────────────────────────
  const translateY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible && order) {
      translateY.value = withSpring(0, {
        damping: 28,
        stiffness: 300,
        mass: 0.8,
      });
      backdropOpacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
    } else if (!visible) {
      translateY.value = withTiming(screenHeight, {
        duration: 250,
        easing: Easing.in(Easing.cubic),
      });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, order, screenHeight, backdropOpacity, translateY]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleCancelItem = useCallback(
    (item: OrderItem) => {
      useDialogStore.getState().confirm(
        language === "tr" ? "Ürünü İptal Et" : "Cancel Item",
        language === "tr"
          ? `"${item.productName}" ürününü siparişten iptal etmek istediğinize emin misiniz?`
          : `Are you sure you want to cancel "${item.productNameEn || item.productName}" from the order?`,
        async () => {
          try {
            await useOrderStore.getState().cancelItem(item.id);
            useDialogStore
              .getState()
              .alert(
                language === "tr" ? "Başarılı" : "Success",
                language === "tr"
                  ? "Ürün başarıyla iptal edildi."
                  : "Item has been successfully cancelled.",
              );
          } catch (err: unknown) {
            useDialogStore
              .getState()
              .alert(
                language === "tr" ? "Hata" : "Error",
                (err instanceof Error ? err.message : null) ||
                  (language === "tr"
                    ? "Ürün iptal edilemedi"
                    : "Failed to cancel item"),
              );
          }
        },
        undefined,
        language === "tr" ? "İptal Et" : "Cancel",
        language === "tr" ? "Vazgeç" : "Keep",
        true,
      );
    },
    [language],
  );

  // ── Render ──────────────────────────────────────────────
  if (!order) return null;

  const displayStatus = deriveCustomerOrderDisplayStatus(order);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Backdrop */}
        <Animated.View
          style={[
            backdropAnimatedStyle,
            { backgroundColor: "rgba(0,0,0,0.5)" },
          ]}
          className="absolute inset-0"
        >
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>

        {/* Sheet — sabit yükseklik + safe area; içerik ScrollView'da kayar */}
        <Animated.View
          style={[
            sheetAnimatedStyle,
            {
              height: sheetHeight,
              paddingBottom: insets.bottom,
              backgroundColor: colors.background,
            },
            isTablet
              ? { alignSelf: "center", width: 780, maxWidth: "95%" }
              : undefined,
          ]}
          className="absolute bottom-0 left-0 right-0 rounded-t-[24px] overflow-hidden"
        >
          {/* Handle */}
          <View className="items-center pt-3 pb-1">
            <View
              className="w-10 h-1 rounded-full"
              style={{ backgroundColor: colors.border }}
            />
          </View>

          <OrderDetailHeader
            order={order}
            language={language}
            onClose={onClose}
          />

          {isTablet ? (
            <View className="flex-1 flex-row min-h-0" style={{ minHeight: 0 }}>
              {/* Left column: Progress & Timeline */}
              <View
                style={{
                  width: 320,
                  borderRightWidth: 1,
                  borderRightColor: colors.border,
                  backgroundColor: colors.card,
                }}
                className="flex-col"
              >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  contentContainerStyle={{ paddingBottom: 24 }}
                >
                  <View className="px-6 pt-5 pb-3">
                    <OrderDetailStatusBadge
                      displayStatus={displayStatus}
                      order={order}
                      language={language}
                    />
                  </View>

                  <OrderTimeline
                    displayStatus={displayStatus}
                    estimatedCompletionTime={order.estimatedCompletionTime}
                    language={language}
                    variant="vertical"
                  />
                </ScrollView>
              </View>

              {/* Right column: Products, Note, Summary */}
              <View className="flex-1 min-h-0">
                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  bounces
                  contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingTop: 16,
                    paddingBottom: 24,
                  }}
                >
                  <OrderDetailItems
                    order={order}
                    language={language}
                    onCancel={handleCancelItem}
                  />
                  {order.note ? (
                    <OrderDetailNote note={order.note} language={language} />
                  )}
                  <OrderDetailPaymentSummary
                    totalAmount={order.totalAmount}
                    language={language}
                  />
                </ScrollView>
              </View>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              bounces
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              <View className="px-6 pt-4 pb-2">
                <OrderDetailStatusBadge
                  displayStatus={displayStatus}
                  order={order}
                  language={language}
                />
              </View>

              <View
                className="border-b"
                style={{ borderBottomColor: colors.border }}
              >
                <OrderTimeline
                  displayStatus={displayStatus}
                  estimatedCompletionTime={order.estimatedCompletionTime}
                  language={language}
                  variant="compact"
                />
              </View>

              <View className="px-5 pt-2 pb-4">
                <OrderDetailItems
                  order={order}
                  language={language}
                  onCancel={handleCancelItem}
                />
              </View>

              {order.note ? (
                <OrderDetailNote note={order.note} language={language} />
              ) : null}

              <View className="px-5">
                <OrderDetailPaymentSummary
                  totalAmount={order.totalAmount}
                  language={language}
                />
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
