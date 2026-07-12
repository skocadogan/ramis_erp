// ============================================================
// Stock Man — Chip
// ============================================================

import React from "react";
import { Pressable, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { cn } from "@/utils/cn";

type ChipVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "destructive";
type ChipSize = "sm" | "md";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  variant?: ChipVariant;
  size?: ChipSize;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  disabled?: boolean;
  className?: string;
}

const sizeStyles: Record<ChipSize, { container: string; text: string }> = {
  sm: { container: "h-8 px-3 rounded-full", text: "text-xs font-medium" },
  md: { container: "h-10 px-4 rounded-full", text: "text-sm font-semibold" },
};

const containerStyles: Record<ChipVariant, { selected: string; unselected: string }> = {
  default: {
    unselected: "bg-muted",
    selected: "bg-foreground",
  },
  primary: {
    unselected: "bg-primary/10",
    selected: "bg-primary",
  },
  success: {
    unselected: "bg-success/10",
    selected: "bg-success",
  },
  warning: {
    unselected: "bg-warning/10",
    selected: "bg-warning",
  },
  destructive: {
    unselected: "bg-destructive/10",
    selected: "bg-destructive",
  },
};

const textStyles: Record<ChipVariant, { selected: string; unselected: string }> = {
  default: {
    unselected: "text-muted-foreground",
    selected: "text-background",
  },
  primary: {
    unselected: "text-primary",
    selected: "text-primary-foreground",
  },
  success: {
    unselected: "text-success",
    selected: "text-success-foreground",
  },
  warning: {
    unselected: "text-warning",
    selected: "text-warning-foreground",
  },
  destructive: {
    unselected: "text-destructive",
    selected: "text-destructive-foreground",
  },
};

const iconColors: Record<ChipVariant, { selected: string; unselected: string }> = {
  default: { unselected: "#64748B", selected: "#FFFFFF" },
  primary: { unselected: "#1E40AF", selected: "#FFFFFF" },
  success: { unselected: "#059669", selected: "#FFFFFF" },
  warning: { unselected: "#F59E0B", selected: "#1F2937" },
  destructive: { unselected: "#DC2626", selected: "#FFFFFF" },
};

const iconSizeMap: Record<ChipSize, number> = { sm: 12, md: 14 };

export function Chip({
  label,
  selected = false,
  onPress,
  variant = "default",
  size = "md",
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  disabled,
  className,
}: ChipProps) {
  const sz = sizeStyles[size];
  const iSize = iconSizeMap[size];
  const palette = selected ? "selected" : "unselected";
  const iconColor = iconColors[variant][palette];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      className={cn(
        "flex-row items-center justify-center min-w-[48px]",
        sz.container,
        containerStyles[variant][palette],
        disabled && "opacity-50",
        !disabled && onPress && "active:opacity-85",
        className
      )}
    >
      {LeftIcon ? (
        <View className="mr-1.5">
          <LeftIcon size={iSize} color={iconColor} />
        </View>
      ) : null}
      <Text className={cn(sz.text, textStyles[variant][palette])}>{label}</Text>
      {RightIcon ? (
        <View className="ml-1.5">
          <RightIcon size={iSize} color={iconColor} />
        </View>
      ) : null}
    </Pressable>
  );
}

