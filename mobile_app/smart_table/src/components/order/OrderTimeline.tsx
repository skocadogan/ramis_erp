// ============================================================
// OrderTimeline — Sipariş ilerleme göstergesi
// compact: mobil detay sheet | vertical: geniş ekran
// ============================================================

import React, { useMemo } from "react";
import { View, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useSharedValue,
} from "react-native-reanimated";
import {
  Check,
  Clock,
  ChefHat,
  CookingPot,
  Utensils,
  Truck,
} from "lucide-react-native";
import { formatEstimatedTime } from "@/utils/format";
import { useTheme } from "@/hooks/useTheme";
import type { CustomerOrderDisplayStatus } from "@/utils/customerOrderStatus";

interface TimelineStep {
  key: CustomerOrderDisplayStatus;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  labelTr: string;
  labelEn: string;
  shortTr: string;
  shortEn: string;
}

const TIMELINE_STEPS: TimelineStep[] = [
  {
    key: "SENT_TO_KITCHEN",
    icon: Clock,
    labelTr: "Mutfağa İletildi",
    labelEn: "Sent to Kitchen",
    shortTr: "Mutfağa",
    shortEn: "Kitchen",
  },
  {
    key: "PREPARING",
    icon: CookingPot,
    labelTr: "Hazırlanıyor",
    labelEn: "Preparing",
    shortTr: "Hazırlanıyor",
    shortEn: "Preparing",
  },
  {
    key: "PREPARED",
    icon: Check,
    labelTr: "Hazırlandı",
    labelEn: "Prepared",
    shortTr: "Hazır",
    shortEn: "Ready",
  },
  {
    key: "ON_THE_WAY",
    icon: Truck,
    labelTr: "Masanıza Getirilecek",
    labelEn: "On the Way",
    shortTr: "Yolda",
    shortEn: "On way",
  },
  {
    key: "DELIVERED",
    icon: Utensils,
    labelTr: "Teslim Edildi",
    labelEn: "Delivered",
    shortTr: "Teslim",
    shortEn: "Done",
  },
];

function Spinner({ size = 18, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const rotation = useSharedValue(0);

  React.useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1200, easing: Easing.linear }),
      -1,
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const spinnerColor = color ?? colors.primary;

  return (
    <Animated.View style={animatedStyle}>
      <ChefHat size={size} color={spinnerColor} />
    </Animated.View>
  );
}

function getStepIndex(status: CustomerOrderDisplayStatus): number {
  if (status === "CANCELLED") return -1;
  if (status === "COMPLETED") return TIMELINE_STEPS.length - 1;
  return TIMELINE_STEPS.findIndex((s) => s.key === status);
}

interface OrderTimelineProps {
  displayStatus: CustomerOrderDisplayStatus;
  estimatedCompletionTime?: string;
  language?: "tr" | "en";
  variant?: "compact" | "vertical";
}

function CompactTimeline({
  displayStatus,
  estimatedCompletionTime,
  language = "tr",
}: Omit<OrderTimelineProps, "variant">) {
  const currentIndex = useMemo(
    () => getStepIndex(displayStatus),
    [displayStatus],
  );
  const isCancelled = displayStatus === "CANCELLED";
  const isTr = language === "tr";
  const { colors } = useTheme();

  return (
    <View className="px-4 py-3">
      {estimatedCompletionTime && !isCancelled ? (
        <View className="items-center mb-3">
          <View
            className="px-4 py-2 rounded-full"
            style={{ backgroundColor: colors.accent }}
          >
            <Text
              className="text-[13px] font-semibold"
              style={{ color: colors.accentForeground }}
            >
              {isTr ? "Tahmini: " : "Est.: "}
              <Text className="font-bold" style={{ color: colors.primary }}>
                {formatEstimatedTime(estimatedCompletionTime, language)}
              </Text>
            </Text>
          </View>
        </View>
      ) : null}

      {isCancelled ? (
        <View className="items-center py-2">
          <Text
            className="text-[14px] font-semibold"
            style={{ color: colors.destructive }}
          >
            {isTr ? "Sipariş İptal Edildi" : "Order Cancelled"}
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-row items-center px-1">
            {TIMELINE_STEPS.map((step, idx) => {
              const isCompleted = currentIndex > idx;
              const isCurrent = currentIndex === idx;
              const isLast = idx === TIMELINE_STEPS.length - 1;

              return (
                <React.Fragment key={step.key}>
                  <View className="items-center" style={{ width: 36 }}>
                    <View
                      className="w-8 h-8 rounded-full items-center justify-center border-2"
                      style={{
                        backgroundColor: isCompleted
                          ? colors.success
                          : isCurrent
                            ? colors.background
                            : colors.muted,
                        borderColor: isCompleted
                          ? colors.success
                          : isCurrent
                            ? colors.primary
                            : colors.border,
                      }}
                    >
                      {isCompleted ? (
                        <Check size={14} color="white" />
                      ) : isCurrent ? (
                        <Spinner size={14} />
                      ) : (
                        <step.icon size={14} color={colors.icon} />
                      )}
                    </View>
                  </View>
                  {!isLast && (
                    <View
                      className="flex-1 h-0.5 mx-0.5 rounded-full -mt-3"
                      style={{
                        backgroundColor: isCompleted
                          ? colors.success
                          : isCurrent
                            ? colors.primary
                            : colors.border,
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          <View className="flex-row mt-2 px-0.5">
            {TIMELINE_STEPS.map((step, idx) => {
              const isCompleted = currentIndex > idx;
              const isCurrent = currentIndex === idx;
              return (
                <Text
                  key={step.key}
                  className="flex-1 text-center text-[10px] leading-tight"
                  style={{
                    color: isCompleted
                      ? colors.success
                      : isCurrent
                        ? colors.primary
                        : colors.mutedForeground,
                    fontWeight: isCurrent
                      ? "bold"
                      : isCompleted
                        ? "500"
                        : "normal",
                  }}
                  numberOfLines={2}
                >
                  {isTr ? step.shortTr : step.shortEn}
                </Text>
              );
            })}
          </View>

          {currentIndex >= 0 && (
            <Text
              className="text-[12px] text-center mt-2"
              style={{ color: colors.primary }}
            >
              {isTr ? "Şu anda bu aşamada" : "Currently in progress"}
              {": "}
              <Text className="font-semibold">
                {isTr
                  ? TIMELINE_STEPS[currentIndex].labelTr
                  : TIMELINE_STEPS[currentIndex].labelEn}
              </Text>
            </Text>
          )}
        </>
      )}
    </View>
  );
}

function VerticalTimeline({
  displayStatus,
  estimatedCompletionTime,
  language = "tr",
}: Omit<OrderTimelineProps, "variant">) {
  const currentIndex = useMemo(
    () => getStepIndex(displayStatus),
    [displayStatus],
  );
  const isCancelled = displayStatus === "CANCELLED";
  const isTr = language === "tr";
  const { colors } = useTheme();

  return (
    <View className="px-4 py-4">
      {estimatedCompletionTime && !isCancelled ? (
        <View className="items-center mb-4">
          <View
            className="px-5 py-2 rounded-full"
            style={{ backgroundColor: colors.accent }}
          >
            <Text
              className="text-[14px] font-semibold"
              style={{ color: colors.accentForeground }}
            >
              {isTr ? "Tahmini Süre: " : "Est. Time: "}
              <Text className="font-bold" style={{ color: colors.primary }}>
                {formatEstimatedTime(estimatedCompletionTime, language)}
              </Text>
            </Text>
          </View>
        </View>
      ) : null}

      {isCancelled && (
        <View className="items-center mb-4">
          <Text
            className="text-[15px] font-semibold"
            style={{ color: colors.destructive }}
          >
            {isTr ? "Sipariş İptal Edildi" : "Order Cancelled"}
          </Text>
        </View>
      )}

      <View className="relative">
        {TIMELINE_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = currentIndex > idx;
          const isCurrent = currentIndex === idx;
          const isLast = idx === TIMELINE_STEPS.length - 1;

          return (
            <View key={step.key} className="flex-row">
              <View className="items-center w-10">
                {idx > 0 && (
                  <View
                    className="w-0.5 h-3"
                    style={{
                      backgroundColor: isCompleted
                        ? colors.success
                        : isCurrent
                          ? colors.primary
                          : colors.border,
                    }}
                  />
                )}
                <View
                  className="w-9 h-9 rounded-full items-center justify-center border-2"
                  style={{
                    backgroundColor: isCompleted
                      ? colors.success
                      : isCurrent
                        ? colors.background
                        : colors.muted,
                    borderColor: isCompleted
                      ? colors.success
                      : isCurrent
                        ? colors.primary
                        : colors.border,
                  }}
                >
                  {isCompleted ? (
                    <Check size={16} color="white" />
                  ) : isCurrent ? (
                    <Spinner size={16} />
                  ) : (
                    <Icon size={16} color={colors.icon} />
                  )}
                </View>
                {!isLast && (
                  <View
                    className="w-0.5 flex-1 min-h-[20px]"
                    style={{
                      backgroundColor: isCompleted
                        ? colors.success
                        : isCurrent
                          ? colors.primary
                          : colors.border,
                    }}
                  />
                )}
              </View>

              <View
                className={`flex-1 pb-4 pl-2 justify-center ${isLast ? "pb-0" : ""}`}
              >
                <Text
                  className="text-[14px] font-semibold"
                  style={{
                    color: isCompleted
                      ? colors.success
                      : isCurrent
                        ? colors.primary
                        : colors.mutedForeground,
                  }}
                >
                  {isTr ? step.labelTr : step.labelEn}
                </Text>
                {isCurrent && (
                  <Text
                    className="text-[12px] mt-0.5"
                    style={{ color: colors.primary }}
                  >
                    {isTr ? "Şu anda bu aşamada" : "Currently in progress"}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function OrderTimeline({
  variant = "compact",
  ...props
}: OrderTimelineProps) {
  if (variant === "vertical") {
    return <VerticalTimeline {...props} />;
  }
  return <CompactTimeline {...props} />;
}
