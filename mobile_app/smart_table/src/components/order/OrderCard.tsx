// ============================================================
// OrderCard — A card showing an order's status and items
// Tablet-optimized with large touch targets
// ============================================================

import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import {
  Clock,
  ChevronRight,
  CheckCircle2,
  UtensilsCrossed,
  CookingPot,
  Bell,
  Ban,
} from "lucide-react-native";
import {
  formatPrice,
  formatDate,
  formatDateEn,
  getCustomerStatusColor,
  getCustomerStatusBadgeColors,
  getCustomerStatusLabel,
  getStatusColor,
} from "@/utils/format";
import {
  deriveCustomerOrderDisplayStatus,
  countDeliveredItems,
  countActiveItems,
  getCustomerStatusProgressPercent,
  getDisplayOrderItems,
  type CustomerOrderDisplayStatus,
} from "@/utils/customerOrderStatus";
import type { Order } from "@/types";
import { useTheme } from "@/hooks/useTheme";

// ─── Status Icon ────────────────────────────────────────────

const StatusIcon = ({ status }: { status: CustomerOrderDisplayStatus }) => {
  const size = 18;
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
      return <Ban size={size} color={color} />;
    default:
      return <Clock size={size} color={color} />;
  }
};

// ─── Item Status Icon (small) ──────────────────────────────

const ItemStatusDot = ({ status }: { status: string }) => {
  const dotColor = getStatusColor(status);
  return (
    <View
      className="w-2.5 h-2.5 rounded-full"
      style={{ backgroundColor: dotColor }}
    />
  );
};

// ─── Progress Bar ──────────────────────────────────────────

const ProgressBar = ({
  displayStatus,
}: {
  displayStatus: CustomerOrderDisplayStatus;
}) => {
  const { colors } = useTheme();
  const progress = useMemo(
    () => getCustomerStatusProgressPercent(displayStatus),
    [displayStatus],
  );
  if (displayStatus === "CANCELLED") {
    return (
      <View
        className="h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: `${colors.destructive}26` }}
      >
        <View
          className="h-full rounded-full opacity-50"
          style={{ width: "100%", backgroundColor: colors.destructive }}
        />
      </View>
    );
  }

  return (
    <View
      className="h-1.5 rounded-full overflow-hidden"
      style={{ backgroundColor: colors.muted }}
    >
      <View
        className="h-full rounded-full"
        style={{ width: `${progress}%`, backgroundColor: colors.success }}
      />
    </View>
  );
};

// ─── OrderCard ──────────────────────────────────────────────

interface OrderCardProps {
  order: Order;
  language?: "tr" | "en";
  onPress?: (order: Order) => void;
}

const OrderCard = React.memo(function OrderCard({
  order,
  language = "tr",
  onPress,
}: OrderCardProps) {
  const { colors, isDark } = useTheme();
  const displayStatus = useMemo(
    () => deriveCustomerOrderDisplayStatus(order),
    [order],
  );
  const badgeColors = getCustomerStatusBadgeColors(displayStatus);
  const formattedDate =
    language === "tr"
      ? formatDate(order.createdAt)
      : formatDateEn(order.createdAt);

  const itemCount = countActiveItems(order.items);
  const deliveredCount = countDeliveredItems(order.items);
  const displayItems = useMemo(
    () => getDisplayOrderItems(order.items),
    [order.items],
  );

  const orderRef = order.id.slice(-5);
  const statusLabel = getCustomerStatusLabel(displayStatus, language);
  const a11yLabel =
    language === "tr"
      ? `Sipariş ${orderRef}, ${statusLabel}, ${formattedDate}`
      : `Order ${orderRef}, ${statusLabel}, ${formattedDate}`;

  return (
    <Pressable
      onPress={() => onPress?.(order)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      className="rounded-2xl overflow-hidden border active:opacity-80"
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        // Card shadow using theme config helper if possible, or manual values
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.3 : 0.08,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center">
            <Text
              className="text-[14px] font-bold"
              style={{ color: colors.foreground }}
            >
              #{order.id.slice(-5)}
            </Text>
            <View
              className="w-1 h-1 rounded-full mx-2"
              style={{ backgroundColor: colors.border }}
            />
            <Text
              className="text-[14px]"
              style={{ color: colors.mutedForeground }}
            >
              {order.tableName}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Clock size={13} color={colors.icon} />
            <Text
              className="text-[12px] ml-1"
              style={{ color: colors.mutedForeground }}
            >
              {formattedDate}
            </Text>
          </View>
        </View>

        {/* Status Badge */}
        <View
          className="self-start px-3.5 py-1.5 rounded-full flex-row items-center"
          style={{ backgroundColor: badgeColors.bg }}
        >
          <StatusIcon status={displayStatus} />
          <Text
            className="text-[13px] font-semibold ml-1.5"
            style={{ color: badgeColors.text }}
          >
            {getCustomerStatusLabel(displayStatus, language)}
          </Text>
        </View>
      </View>

      {/* Items List (compact) */}
      <View className="px-5 py-2">
        {displayItems.slice(0, 4).map((item, idx) => {
          const hideZeroPrice =
            !!item.isCombinedProduct &&
            item.unitPrice === 0 &&
            item.totalPrice === 0;
          const combinedPartLines =
            item.combinedParts && item.combinedParts.length > 0
              ? item.combinedParts
                  .map((part) => {
                    const displayQuantity = (
                      item.isCombinedProduct
                        ? item.quantity
                        : part.quantityTotal
                    ).toLocaleString(language === "tr" ? "tr-TR" : "en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 4,
                    });
                    return [
                      part.productName,
                      `x${displayQuantity}`,
                      part.unitName,
                    ]
                      .filter(Boolean)
                      .join(" ");
                  })
                  .filter(Boolean)
              : [];

          return (
            <View
              key={item.id}
              className="flex-row items-center justify-between py-2"
              style={
                idx < Math.min(displayItems.length, 4) - 1
                  ? { borderBottomWidth: 1, borderBottomColor: colors.border }
                  : undefined
              }
            >
              <View className="flex-row items-start flex-1 mr-3">
                <View className="mt-1">
                  <ItemStatusDot status={item.status} />
                </View>
                <View className="ml-2.5 flex-1">
                  <Text
                    className="text-[14px]"
                    style={{ color: colors.foreground }}
                    numberOfLines={1}
                  >
                    {language === "tr" ? item.productName : item.productNameEn}
                  </Text>
                  {(
                    language === "tr"
                      ? item.unitName
                      : item.unitNameEn || item.unitName
                  ) ? (
                    <Text
                      className="text-[11px] mt-0.5"
                      style={{ color: colors.mutedForeground }}
                    >
                      {language === "tr"
                        ? item.unitName
                        : item.unitNameEn || item.unitName}
                    </Text>
                  ) : null}
                  {Array.isArray(combinedPartLines) &&
                  combinedPartLines.length > 0 ? (
                    <View className="mt-1 ml-3 gap-0.5">
                      {combinedPartLines.map((line, lineIndex) => (
                        <Text
                          key={`${item.id}-part-${lineIndex}`}
                          className="text-[11px]"
                          style={{ color: colors.mutedForeground }}
                        >
                          {line}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {Array.isArray(item.modifiers) &&
                  item.modifiers.length > 0 ? (
                    <Text
                      className="text-[11px] font-semibold mt-0.5"
                      style={{ color: colors.success }}
                    >
                      +{" "}
                      {item.modifiers
                        .map((m) =>
                          language === "tr"
                            ? m.modifierName
                            : m.groupName || m.modifierName,
                        )
                        .join(", ")}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View className="flex-row items-center">
                <Text
                  className="text-[13px] mr-2"
                  style={{ color: colors.mutedForeground }}
                >
                  x{item.quantity}
                </Text>
                {hideZeroPrice ? null : (
                  <Text
                    className="text-[14px] font-semibold min-w-[70px] text-right"
                    style={{ color: colors.foreground }}
                  >
                    {formatPrice(item.totalPrice)}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
        {displayItems.length > 4 && (
          <Text
            className="text-[13px] text-center pt-2"
            style={{ color: colors.mutedForeground }}
          >
            +{displayItems.length - 4}{" "}
            {language === "tr" ? "ürün daha" : "more items"}
          </Text>
        )}
      </View>

      {/* Progress */}
      <View className="px-5 pt-2 pb-1">
        <ProgressBar displayStatus={displayStatus} />
        <View className="flex-row justify-between mt-1">
          <Text
            className="text-[11px]"
            style={{ color: colors.mutedForeground }}
          >
            {deliveredCount}/{itemCount}{" "}
            {language === "tr" ? "teslim" : "delivered"}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View
        className="flex-row items-center justify-between px-5 py-4 mt-1 border-t"
        style={{ borderTopColor: colors.border }}
      >
        <Text className="text-[14px]" style={{ color: colors.mutedForeground }}>
          {language === "tr" ? "Toplam" : "Total"}
        </Text>
        <View className="flex-row items-center">
          <Text
            className="text-[20px] font-bold mr-1"
            style={{ color: colors.primary }}
          >
            {formatPrice(order.totalAmount)}
          </Text>
          <ChevronRight size={18} color={colors.icon} />
        </View>
      </View>
    </Pressable>
  );
});

export default OrderCard;
