// ============================================================
// Stock Man — Card
//
// Variants:  elevated (shadow) | flat | outlined
// Optional onPress makes the card pressable (Pressable) with
// a subtle active opacity. Without onPress it renders as a
// passive View. Minimum 48px height enforced via minHeight
// to keep touch ergonomics consistent across the app.
// ============================================================

import React, { forwardRef } from "react";
import {
  Pressable,
  View,
  type PressableProps,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { cn } from "@/utils/cn";

type CardVariant = "elevated" | "flat" | "outlined";

export interface CardProps extends Omit<ViewProps, "style"> {
  variant?: CardVariant;
  onPress?: PressableProps["onPress"];
  className?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  /** Override the accessibility label (auto-derived from children otherwise). */
  accessibilityLabel?: string;
}

const variantStyles: Record<CardVariant, string> = {
  elevated: "bg-card border border-border shadow-sm",
  flat: "bg-card border border-border",
  outlined: "bg-transparent border-2 border-border",
};

export const Card = forwardRef<View, CardProps>(function Card(
  {
    variant = "elevated",
    onPress,
    className,
    children,
    accessibilityLabel,
    ...rest
  },
  ref
) {
  const baseClass = cn(
    "rounded-xl p-4 min-h-[48px]",
    variantStyles[variant],
    className
  );

  if (onPress) {
    return (
      <Pressable
        ref={ref as any}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={cn(baseClass, "active:opacity-80")}
        {...(rest as any)}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View
      ref={ref}
      className={baseClass}
      accessibilityLabel={accessibilityLabel}
      {...rest}
    >
      {children}
    </View>
  );
});

