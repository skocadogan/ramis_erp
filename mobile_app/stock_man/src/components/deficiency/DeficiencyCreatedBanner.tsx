// ============================================================
// Stock Man — Deficiency Created Banner
//
// KDS'den veya otomatik taramadan gelen yeni eksik listesi
// WebSocket olayları için slide-in banner (LowStockBanner ile
// aynı desen).
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
import { AlertCircle, ChevronRight, X } from "lucide-react-native";
import { useWSPushStore } from "@/data/p5";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

const AUTO_DISMISS_MS = 8000;
const VIBRATION_MS = 100;
const HIDDEN_OFFSET = -200;

export interface DeficiencyCreatedBannerProps {
  className?: string;
  style?: ViewStyle;
}

export function DeficiencyCreatedBanner({
  className,
  style,
}: DeficiencyCreatedBannerProps) {
  const { t } = useI18n();
  const router = useRouter();
  const alerts = useWSPushStore((s) => s.deficiencyAlerts);
  const removeDeficiencyAlert = useWSPushStore((s) => s.removeDeficiencyAlert);
  const alert = alerts[0];

  const translateY = useSharedValue(HIDDEN_OFFSET);
  const opacity = useSharedValue(0);
  const lastIdRef = useRef<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!alert) {
      translateY.value = HIDDEN_OFFSET;
      opacity.value = 0;
      return;
    }
    const id = alert.id;
    if (id === lastIdRef.current) return;
    lastIdRef.current = id;

    Vibration.vibrate(VIBRATION_MS);
    translateY.value = withSequence(
      withTiming(20, { duration: 260, easing: Easing.out(Easing.back(1.1)) })
    );
    opacity.value = withTiming(1, { duration: 200 });

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      slideOut(() => removeDeficiencyAlert(id));
    }, AUTO_DISMISS_MS);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.id]);

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
    slideOut(() => removeDeficiencyAlert(alert.id));
  };

  const handleView = () => {
    if (!alert) return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    const id = alert.id;
    slideOut(() => {
      removeDeficiencyAlert(id);
      router.push(routes.deficiency.detail(id));
    });
  };

  if (!alert) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        { position: "absolute", top: 0, left: 0, right: 0, zIndex: 49 },
        style,
        animatedStyle,
      ]}
    >
      <View className={cn("px-3 pt-3", className)}>
        <View
          className="rounded-2xl overflow-hidden border border-warning bg-warning/95"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <View className="flex-row items-start p-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-foreground/10 mr-3 mt-0.5">
              <AlertCircle size={18} color="#1F2937" strokeWidth={2.5} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
                {t("deficiency.notifications.createdTitle", { station: alert.station_name })}
              </Text>
              <Text className="text-caption mt-0.5 text-foreground/80" numberOfLines={1}>
                {t("deficiency.notifications.createdDescription", {
                  number: alert.report_number,
                })}
              </Text>
              {alert.branch_name ? (
                <Text className="text-caption mt-0.5 text-foreground/70" numberOfLines={1}>
                  {alert.branch_name}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={handleDismiss}
              accessibilityRole="button"
              accessibilityLabel="deficiency-banner-dismiss"
              hitSlop={8}
              className="w-7 h-7 items-center justify-center rounded-full active:opacity-70"
            >
              <X size={16} color="#1F2937" strokeWidth={2.5} />
            </Pressable>
          </View>
          <View className="flex-row border-t border-foreground/15 bg-foreground/5">
            <Pressable
              onPress={handleDismiss}
              accessibilityRole="button"
              className="flex-1 py-2.5 items-center justify-center active:opacity-80 border-r border-foreground/15"
            >
              <Text className="text-sm font-semibold text-foreground">
                {t("common.close")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleView}
              accessibilityRole="button"
              className="flex-1 py-2.5 flex-row items-center justify-center active:opacity-80"
            >
              <Text className="text-sm font-bold text-foreground mr-1">
                {t("deficiency.detail")}
              </Text>
              <ChevronRight size={14} color="#1F2937" strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

