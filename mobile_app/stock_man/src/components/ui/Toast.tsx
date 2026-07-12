// ============================================================
// Stock Man — Toast + ToastHost
//
// Top-positioned, auto-dismissing notification. Slide-in/out
// is handled with Reanimated for 60fps on low-end Android.
//
// Public API:
//   const toast = useToast();
//   toast.show({ title: "Saved", variant: "success" });
//
// Backed by a tiny local store so that any component can show
// a toast without prop-drilling a ref. Only one toast is on
// screen at a time; queuing will be added if real demand
// appears.
// ============================================================

import { create } from "zustand";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react-native";
import { cn } from "@/utils/cn";

const TOAST_DURATION = 2200;
const ANIM_DURATION = 250;
const HIDDEN_OFFSET = -140;

export type ToastVariant = "success" | "info" | "error" | "warning";

type ToastState = {
  visible: boolean;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
  show: (opts: {
    title: string;
    description?: string;
    variant?: ToastVariant;
    durationMs?: number;
  }) => void;
  hide: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  title: "",
  description: undefined,
  variant: "info",
  durationMs: TOAST_DURATION,
  show: (opts) =>
    set({
      visible: true,
      title: opts.title,
      description: opts.description,
      variant: opts.variant ?? "info",
      durationMs: opts.durationMs ?? TOAST_DURATION,
    }),
  hide: () => set({ visible: false }),
}));

export function useToast() {
  return {
    show: (opts: {
      title: string;
      description?: string;
      variant?: ToastVariant;
      durationMs?: number;
    }) => useToastStore.getState().show(opts),
    success: (title: string, description?: string) =>
      useToastStore.getState().show({ title, description, variant: "success" }),
    error: (title: string, description?: string) =>
      useToastStore.getState().show({ title, description, variant: "error" }),
    info: (title: string, description?: string) =>
      useToastStore.getState().show({ title, description, variant: "info" }),
    warning: (title: string, description?: string) =>
      useToastStore.getState().show({ title, description, variant: "warning" }),
    hide: () => useToastStore.getState().hide(),
  };
}

const variantConfig: Record<
  ToastVariant,
  { container: string; icon: LucideIcon; iconColor: string }
> = {
  success: {
    container: "bg-success",
    icon: CheckCircle2,
    iconColor: "#FFFFFF",
  },
  info: {
    container: "bg-primary",
    icon: Info,
    iconColor: "#FFFFFF",
  },
  error: {
    container: "bg-destructive",
    icon: XCircle,
    iconColor: "#FFFFFF",
  },
  warning: {
    container: "bg-warning",
    icon: AlertTriangle,
    iconColor: "#1F2937",
  },
};

function ToastView() {
  const { visible, title, description, variant, durationMs, hide } =
    useToastStore();

  const translateY = useSharedValue(HIDDEN_OFFSET);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    translateY.value = withSequence(
      withTiming(20, {
        duration: ANIM_DURATION,
        easing: Easing.out(Easing.back(1.2)),
      })
    );
    opacity.value = withTiming(1, { duration: ANIM_DURATION });

    const timer = setTimeout(() => {
      translateY.value = withTiming(
        HIDDEN_OFFSET,
        { duration: ANIM_DURATION, easing: Easing.in(Easing.ease) },
        () => runOnJS(hide)()
      );
      opacity.value = withTiming(0, { duration: ANIM_DURATION });
    }, durationMs);

    return () => clearTimeout(timer);
  }, [visible, durationMs, hide, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;
  const cfg = variantConfig[variant];
  const Icon = cfg.icon;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[animatedStyle, { position: "absolute", top: 0, left: 0, right: 0, zIndex: 9999 }]}
    >
      <View className="px-4 pt-4">
        <Pressable
          onPress={hide}
          accessibilityRole="alert"
          className={cn(
            "flex-row items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl",
            cfg.container
          )}
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Icon size={20} color={cfg.iconColor} strokeWidth={2.5} />
          <View className="flex-1">
            <Text className="text-base font-semibold text-white">
              {title}
            </Text>
            {description ? (
              <Text className="mt-0.5 text-sm text-white/90">
                {description}
              </Text>
            ) : null}
          </View>
          <X size={18} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** Mount once near the app root. */
export function ToastHost() {
  return <ToastView />;
}

