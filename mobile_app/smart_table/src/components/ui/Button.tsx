// ============================================================
// Smart Table — Button Component
//
// A versatile, touch-optimised button for tablet restaurant
// menu ordering. Supports variants, sizes, loading state,
// left icon, and full-width mode.
// ============================================================

import React from "react";
import {
  Text,
  ActivityIndicator,
  View,
  Pressable,
  type PressableProps,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useUIStore } from "@/store/ui-store";

// ─── Variant & Size Types ───────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "xl";

// ─── Props ──────────────────────────────────────────────────

export interface ButtonProps extends Omit<PressableProps, "children"> {
  /** Visual variant @default 'primary' */
  variant?: ButtonVariant;
  /** Size preset @default 'md' */
  size?: ButtonSize;
  /** Show a loading spinner and disable interaction */
  loading?: boolean;
  /** Icon component from lucide-react-native placed before the label */
  icon?: LucideIcon;
  /** Icon size override (default follows the size preset) */
  iconSize?: number;
  /** Stretch to fill the parent width */
  fullWidth?: boolean;
  /** Button label */
  children: React.ReactNode;
}

// ─── Style Maps ─────────────────────────────────────────────

const variantStyles: Record<
  ButtonVariant,
  { container: string; text: string }
> = {
  primary: {
    container: "bg-primary active:bg-primary/90",
    text: "text-primary-foreground",
  },
  secondary: {
    container: "bg-secondary active:bg-secondary/90",
    text: "text-secondary-foreground",
  },
  outline: {
    container: "border-2 border-primary bg-transparent active:bg-primary/10",
    text: "text-primary",
  },
  ghost: {
    container: "bg-transparent active:bg-muted",
    text: "text-foreground",
  },
};

const sizeStyles: Record<ButtonSize, { container: string; text: string }> = {
  sm: {
    container: "h-10 px-4 rounded-xl",
    text: "text-sm font-medium",
  },
  md: {
    container: "h-12 px-5 rounded-[16px]",
    text: "text-base font-semibold",
  },
  lg: {
    container: "h-14 px-6 rounded-[16px]",
    text: "text-lg font-semibold",
  },
  xl: {
    container: "h-[56px] px-8 rounded-[20px]",
    text: "text-xl font-bold",
  },
};

// Spinner & icon sizes per button size
const iconSizeMap: Record<ButtonSize, number> = {
  sm: 16,
  md: 20,
  lg: 22,
  xl: 24,
};

// ─── Component ──────────────────────────────────────────────

/**
 * Primary call-to-action button. Touch-optimised for tablets
 * with a minimum 48 px touch target on all sizes.
 *
 * @example
 *   <Button variant="primary" size="xl" icon={ShoppingCart}>
 *     Sepete Ekle
 *   </Button>
 *
 *   <Button variant="outline" loading fullWidth>
 *     Kaydediliyor…
 *   </Button>
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon: Icon,
  iconSize,
  fullWidth = false,
  children,
  disabled,
  className,
  style,
  accessibilityLabel,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const theme = useUIStore((s) => s.theme);

  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const iSize = iconSize ?? iconSizeMap[size];
  const defaultLabel =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : undefined;

  return (
    <Pressable
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? defaultLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={`flex-row items-center justify-center min-w-[48px] ${fullWidth ? "w-full" : ""} ${v.container} ${s.container} ${isDisabled ? "opacity-50" : ""} ${className || ""}`}
      style={style}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size={iSize <= 20 ? "small" : "large"}
          color={
            variant === "outline" || variant === "ghost"
              ? theme === "dark"
                ? "#E85D04"
                : "#D94A3D"
              : "#FFFFFF"
          }
          className="mr-2"
        />
      ) : Icon ? (
        <View className="mr-2">
          <Icon size={iSize} color={getIconColor(variant, theme)} />
        </View>
      ) : null}

      {typeof children === "string" || typeof children === "number" ? (
        <Text className={`${v.text} ${s.text} text-center`}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function getIconColor(variant: ButtonVariant, theme: string): string {
  switch (variant) {
    case "primary":
      return "#FFFFFF";
    case "secondary":
      return "#FFFFFF";
    case "outline":
      return theme === "dark" ? "#E85D04" : "#D94A3D";
    case "ghost":
      return theme === "dark" ? "#EDEDED" : "#1A1A2E";
    default:
      return "#FFFFFF";
  }
}
