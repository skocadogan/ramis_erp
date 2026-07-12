// ============================================================
// Stock Man — Button
//
// Variants:  primary | secondary | outline | ghost | destructive
// Sizes:     sm | md | lg | xl        (all >= 48px touch target
//            on `md` and above — meets tablet accessibility
//            guidelines)
// Features:  loading spinner, left/right Lucide icons,
//            fullWidth, accessibilityLabel
// ============================================================

import React, { forwardRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { cn } from "@/utils/cn";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps
  extends Omit<PressableProps, "children" | "style"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  fullWidth?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

const variantStyles: Record<ButtonVariant, { container: string; text: string }> =
  {
    primary: {
      container: "bg-primary active:opacity-90",
      text: "text-primary-foreground",
    },
    secondary: {
      container: "bg-secondary active:opacity-90",
      text: "text-secondary-foreground",
    },
    outline: {
      container: "border-2 border-primary bg-transparent active:opacity-80",
      text: "text-primary",
    },
    ghost: {
      container: "bg-transparent active:opacity-80",
      text: "text-foreground",
    },
    destructive: {
      container: "bg-destructive active:opacity-90",
      text: "text-destructive-foreground",
    },
  };

const sizeStyles: Record<ButtonSize, { container: string; text: string }> = {
  sm: { container: "h-10 px-4 rounded-lg", text: "text-sm font-medium" },
  md: { container: "h-12 px-5 rounded-xl", text: "text-base font-semibold" },
  lg: { container: "h-14 px-6 rounded-xl", text: "text-lg font-semibold" },
  xl: { container: "h-[56px] px-8 rounded-2xl", text: "text-xl font-bold" },
};

const iconSizeMap: Record<ButtonSize, number> = {
  sm: 16,
  md: 20,
  lg: 22,
  xl: 24,
};

const spinnerColorMap: Record<ButtonVariant, string> = {
  primary: "#FFFFFF",
  secondary: "#0F172A",
  outline: "#1E40AF",
  ghost: "#0F172A",
  destructive: "#FFFFFF",
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    fullWidth = false,
    disabled,
    accessibilityLabel,
    children,
    className,
    style,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const iSize = iconSizeMap[size];

  const handlePress = (e: any) => {
    // Trigger haptics feedback based on variant
    try {
      if (variant === "destructive") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Avoid crashing if device doesn't support hardware haptics
    }
    props.onPress?.(e);
  };

  return (
    <Pressable
      ref={ref}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={cn(
        "flex-row items-center justify-center min-w-[48px]",
        fullWidth && "w-full",
        v.container,
        s.container,
        isDisabled && "opacity-50",
        className
      )}
      style={style}
      {...props}
      onPress={props.onPress ? handlePress : undefined}
    >
      {loading ? (
        <ActivityIndicator
          size={iSize <= 20 ? "small" : "large"}
          color={spinnerColorMap[variant]}
          className="mr-2"
        />
      ) : LeftIcon ? (
        <View className="mr-2">
          <LeftIcon size={iSize} color={spinnerColorMap[variant]} />
        </View>
      ) : null}

      {typeof children === "string" || typeof children === "number" ? (
        <Text
          className={cn(v.text, s.text, "text-center shrink")}
          numberOfLines={2}
        >
          {children}
        </Text>
      ) : Array.isArray(children) && children.every(c => typeof c === "string" || typeof c === "number" || c === null || c === undefined) ? (
        <Text
          className={cn(v.text, s.text, "text-center shrink")}
          numberOfLines={2}
        >
          {children.map(c => c ?? "").join("")}
        </Text>
      ) : (
        children
      )}

      {!loading && RightIcon ? (
        <View className="ml-2">
          <RightIcon size={iSize} color={spinnerColorMap[variant]} />
        </View>
      ) : null}
    </Pressable>
  );
});

