// ============================================================
// Smart Table — Toast Component
//
// A lightweight, auto-dismissing toast notification.
// Subscribes to useUIStore.toast state.
// ============================================================

import { useEffect } from "react";
import { Text, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { X, CheckCircle2, Info, AlertTriangle } from "lucide-react-native";
import { useUIStore } from "@/store/ui-store";

const TOAST_DURATION = 2200;
const ANIM_DURATION = 300;

const typeConfig = {
  success: {
    bg: "bg-success",
    icon: CheckCircle2,
    iconColor: "#FFFFFF",
  },
  info: {
    bg: "bg-primary",
    icon: Info,
    iconColor: "#FFFFFF",
  },
  error: {
    bg: "bg-destructive",
    icon: AlertTriangle,
    iconColor: "#FFFFFF",
  },
};

export function Toast() {
  const toast = useUIStore((s) => s.toast);
  const hideToast = useUIStore((s) => s.hideToast);

  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!toast.visible) {
      return;
    }

    translateY.value = -120;
    opacity.value = 0;

    // Slide in
    translateY.value = withSequence(
      withTiming(20, {
        duration: ANIM_DURATION,
        easing: Easing.out(Easing.back(1.2)),
      }),
    );
    opacity.value = withTiming(1, { duration: ANIM_DURATION });

    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      translateY.value = withTiming(
        -120,
        { duration: ANIM_DURATION, easing: Easing.in(Easing.ease) },
        () => runOnJS(hideToast)(),
      );
      opacity.value = withTiming(0, { duration: ANIM_DURATION });
    }, TOAST_DURATION);

    return () => clearTimeout(timer);
  }, [toast.id, toast.visible, translateY, opacity, hideToast]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!toast.visible) return null;

  const config = typeConfig[toast.type];
  const Icon = config.icon;

  return (
    <Animated.View
      className="absolute top-0 left-0 right-0 z-50 px-4 pt-4"
      style={animatedStyle}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={hideToast}
        className={`flex-row items-center gap-3 px-4 py-3.5 rounded-2xl ${config.bg} shadow-xl`}
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Icon size={20} color={config.iconColor} strokeWidth={2.5} />
        <Text className="flex-1 text-base font-semibold text-white">
          {toast.message}
        </Text>
        <X size={18} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
      </Pressable>
    </Animated.View>
  );
}
