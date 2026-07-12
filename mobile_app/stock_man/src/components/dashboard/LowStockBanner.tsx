// ============================================================
// Stock Man — LowStockBanner
//
// Slide-in banner that surfaces the most recent low-stock
// alert pushed by the backend over the WebSocket channel. The
// banner reads the alert list from `useWSPushStore` (owned by
// the data-layer agent) and dismisses it via the store's
// `removeLowAlert` action so the dismissal is shared with
// every other screen that might be listening.
//
// Behaviour:
//   - When `lowAlerts[0]` exists, slide down from the top with
//     a Reanimated entry, vibrate once, and auto-dismiss after
//     5s (or instantly on user tap of the X button).
//   - Tapping the "Stoğu kontrol et" CTA pushes the stock
//     detail route for the alerted item, then dismisses the
//     banner.
//   - Tapping the "Kapat" button just dismisses.
//   - Tapping anywhere else on the banner does nothing (the
//     banner is informational, not a pressable).
// ============================================================

import React, { useEffect, useRef } from "react";
import {
  Pressable,
  Text,
  Vibration,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { routes } from "@/navigation/routes";
import { AlertTriangle, ChevronRight, X } from "lucide-react-native";
import { useWSPushStore } from "@/data/p5";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { LowStockAlert } from "@/types/p5Data";

const AUTO_DISMISS_MS = 5000;
const VIBRATION_MS = 80;
const HIDDEN_OFFSET = -180;

export interface LowStockBannerProps {
  /** Where the banner sits inside its parent. */
  className?: string;
  style?: ViewStyle;
}

export function LowStockBanner({ className, style }: LowStockBannerProps) {
  const { t } = useI18n();
  const router = useRouter();
  const lowAlerts = useWSPushStore((s) => s.lowAlerts);
  const removeLowAlert = useWSPushStore((s) => s.removeLowAlert);
  const alert: LowStockAlert | undefined = lowAlerts[0];

  const translateY = useSharedValue(HIDDEN_OFFSET);
  const opacity = useSharedValue(0);
  const lastIdRef = useRef<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate in on new alert. Re-trigger when the alerted item changes.
  useEffect(() => {
    if (!alert) {
      translateY.value = HIDDEN_OFFSET;
      opacity.value = 0;
      return;
    }
    const id = alert.stock_item_id;
    if (id === lastIdRef.current) return;
    lastIdRef.current = id;

    Vibration.vibrate(VIBRATION_MS);
    translateY.value = withSequence(
      withTiming(20, {
        duration: 260,
        easing: Easing.out(Easing.back(1.1)),
      })
    );
    opacity.value = withTiming(1, { duration: 200 });

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      slideOut(() => removeLowAlert(id));
    }, AUTO_DISMISS_MS);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.stock_item_id]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  function slideOut(after?: () => void) {
    translateY.value = withTiming(
      HIDDEN_OFFSET,
      { duration: 220, easing: Easing.in(Easing.ease) },
      after ? () => runOnJS(after)() : undefined
    );
    opacity.value = withTiming(0, { duration: 220 });
  }

  const handleDismiss = () => {
    if (!alert) return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    slideOut(() => removeLowAlert(alert.stock_item_id));
  };

  const handleView = () => {
    if (!alert) return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    const id = alert.stock_item_id;
    slideOut(() => {
      removeLowAlert(id);
      router.push(routes.stock.detail(id));
    });
  };

  if (!alert) return null;

  // Derive a UI severity hint: 0 stock OR current <= 50% of min
  // is treated as critical; otherwise the alert is just a warning.
  const ratio =
    alert.minimum_quantity > 0
      ? alert.current_quantity / alert.minimum_quantity
      : 1;
  const isCritical = ratio <= 0.5;
  const accentBg = isCritical ? "bg-destructive" : "bg-warning";
  const iconColor = isCritical ? "#FFFFFF" : "#1F2937";

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
        },
        style,
        animatedStyle,
      ]}
    >
      <View className={cn("px-3 pt-3", className)}>
        <View
          className={cn(
            "rounded-2xl shadow-xl overflow-hidden border",
            isCritical
              ? "border-destructive bg-destructive/95"
              : "border-warning bg-warning/95"
          )}
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <View className="flex-row items-start p-3">
            <View
              className={cn(
                "h-9 w-9 items-center justify-center rounded-full mr-3 mt-0.5",
                accentBg
              )}
            >
              <AlertTriangle size={18} color={iconColor} strokeWidth={2.5} />
            </View>
            <View className="flex-1 min-w-0">
              <Text
                className={cn(
                  "text-sm font-bold",
                  isCritical ? "text-white" : "text-foreground"
                )}
                numberOfLines={1}
              >
                {t("dashboard.kpis.lowStock")}
              </Text>
              <Text
                className={cn(
                  "text-caption mt-0.5",
                  isCritical ? "text-white/95" : "text-foreground/80"
                )}
                numberOfLines={1}
              >
                {alert.stock_item_name}
                {alert.warehouse_name ? ` · ${alert.warehouse_name}` : ""}
              </Text>
              <Text
                className={cn(
                  "text-caption mt-0.5 font-mono",
                  isCritical ? "text-white/85" : "text-foreground/70"
                )}
                numberOfLines={1}
              >
                {alert.current_quantity} / {alert.minimum_quantity}
              </Text>
            </View>
            <Pressable
              onPress={handleDismiss}
              accessibilityRole="button"
              accessibilityLabel="banner-dismiss"
              hitSlop={8}
              className="w-7 h-7 items-center justify-center rounded-full active:opacity-70"
            >
              <X
                size={16}
                color={isCritical ? "#FFFFFF" : "#1F2937"}
                strokeWidth={2.5}
              />
            </Pressable>
          </View>
          <View
            className={cn(
              "flex-row border-t",
              isCritical
                ? "border-white/15 bg-white/10"
                : "border-foreground/15 bg-foreground/5"
            )}
          >
            <Pressable
              onPress={handleDismiss}
              accessibilityRole="button"
              accessibilityLabel="banner-close"
              className={cn(
                "flex-1 py-2.5 items-center justify-center active:opacity-80",
                "border-r",
                isCritical ? "border-white/15" : "border-foreground/15"
              )}
            >
              <Text
                className={cn(
                  "text-sm font-semibold",
                  isCritical ? "text-white" : "text-foreground"
                )}
              >
                {t("common.close")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleView}
              accessibilityRole="button"
              accessibilityLabel="banner-view"
              className="flex-1 py-2.5 flex-row items-center justify-center active:opacity-80"
            >
              <Text
                className={cn(
                  "text-sm font-bold mr-1",
                  isCritical ? "text-white" : "text-foreground"
                )}
              >
                {t("stock.title")}
              </Text>
              <ChevronRight
                size={14}
                color={isCritical ? "#FFFFFF" : "#1F2937"}
                strokeWidth={2.5}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

