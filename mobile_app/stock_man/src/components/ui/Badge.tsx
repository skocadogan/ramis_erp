// ============================================================
// Stock Man — Badge
//
// Compact status / category tag. Variants follow the design
// tokens (success / warning / destructive / info) so the rest
// of the app can stay consistent without touching raw colours.
//
// `dot` is the standard "traffic-light" indicator used on
// order status pills; `icon` is for richer badges (allergen
// warnings, etc.).
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { cn } from "@/utils/cn";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "info";
export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: LucideIcon;
  dot?: boolean;
  label?: string;
  children?: React.ReactNode;
  className?: string;
}

const variantStyles: Record<
  BadgeVariant,
  { container: string; text: string; dot: string; iconColor: string }
> = {
  default: {
    container: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    iconColor: "#64748B",
  },
  success: {
    container: "bg-success/15",
    text: "text-success",
    dot: "bg-success",
    iconColor: "#059669",
  },
  warning: {
    container: "bg-warning/15",
    text: "text-warning",
    dot: "bg-warning",
    iconColor: "#F59E0B",
  },
  destructive: {
    container: "bg-destructive/15",
    text: "text-destructive",
    dot: "bg-destructive",
    iconColor: "#DC2626",
  },
  info: {
    container: "bg-info/15",
    text: "text-info",
    dot: "bg-info",
    iconColor: "#0EA5E9",
  },
};

const sizeStyles: Record<BadgeSize, { container: string; text: string }> = {
  sm: { container: "px-2 py-0.5 rounded-full", text: "text-xs font-medium" },
  md: { container: "px-3 py-1 rounded-full", text: "text-sm font-semibold" },
};

const iconSizeMap: Record<BadgeSize, number> = { sm: 12, md: 14 };
const dotSizeMap: Record<BadgeSize, { w: number; h: number }> = {
  sm: { w: 6, h: 6 },
  md: { w: 8, h: 8 },
};

export function Badge({
  variant = "default",
  size = "md",
  icon: Icon,
  dot = false,
  label,
  children,
  className,
}: BadgeProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const iSize = iconSizeMap[size];
  const dSize = dotSizeMap[size];
  const content = children ?? label;

  return (
    <View
      className={cn(
        "flex-row items-center self-start",
        v.container,
        s.container,
        className
      )}
    >
      {dot ? (
        <View
          className={cn("rounded-full mr-1.5", v.dot)}
          style={{ width: dSize.w, height: dSize.h }}
        />
      ) : null}
      {Icon ? (
        <View className="mr-1">
          <Icon size={iSize} color={v.iconColor} />
        </View>
      ) : null}
      {typeof content === "string" || typeof content === "number" ? (
        <Text className={cn(v.text, s.text)}>{content}</Text>
      ) : (
        content
      )}
    </View>
  );
}

