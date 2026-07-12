// ============================================================
// Smart Table — Badge / Tag Component
//
// Compact status and label badges used for order status,
// dietary info (allergens, vegan, gluten-free), price tags
// and category labels. Supports variants, sizes, dot indicator,
// and optional icon.
// ============================================================

import React from "react";
import { View, Text } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useUIStore } from "@/store/ui-store";

// ─── Variant & Size Types ───────────────────────────────────

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "info";
type BadgeSize = "sm" | "md";

// ─── Props ──────────────────────────────────────────────────

export interface BadgeProps {
  /** Visual variant @default 'default' */
  variant?: BadgeVariant;
  /** Size preset @default 'md' */
  size?: BadgeSize;
  /** Optional icon from lucide-react-native */
  icon?: LucideIcon;
  /** Dot indicator shown before text */
  dot?: boolean;
  /** Badge label */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

// ─── Style Maps ─────────────────────────────────────────────

const variantStyles: Record<
  BadgeVariant,
  { container: string; text: string; dot: string }
> = {
  default: {
    container: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  success: {
    container: "bg-success/15",
    text: "text-success",
    dot: "bg-success",
  },
  warning: {
    container: "bg-warning/15",
    text: "text-warning",
    dot: "bg-warning",
  },
  destructive: {
    container: "bg-destructive/15",
    text: "text-destructive",
    dot: "bg-destructive",
  },
  info: {
    container: "bg-primary/15",
    text: "text-primary",
    dot: "bg-primary",
  },
};

const sizeStyles: Record<BadgeSize, { container: string; text: string }> = {
  sm: {
    container: "px-2 py-0.5 rounded-full",
    text: "text-xs font-medium",
  },
  md: {
    container: "px-3 py-1 rounded-full",
    text: "text-sm font-semibold",
  },
};

const iconSizeMap: Record<BadgeSize, number> = {
  sm: 12,
  md: 14,
};

const dotSizeMap: Record<BadgeSize, { width: number; height: number }> = {
  sm: { width: 6, height: 6 },
  md: { width: 8, height: 8 },
};

// ─── Component ──────────────────────────────────────────────

/**
 * A compact badge / tag for statuses, labels, and attributes.
 *
 * @example
 *   <Badge variant="success" dot>Hazır</Badge>
 *   <Badge variant="warning" icon={AlertTriangle}>Dikkat</Badge>
 *   <Badge variant="info" size="sm">Vegan</Badge>
 */
export function Badge({
  variant = "default",
  size = "md",
  icon: Icon,
  dot = false,
  children,
  className,
}: BadgeProps) {
  const theme = useUIStore((s) => s.theme);
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const iSize = iconSizeMap[size];
  const dotSize = dotSizeMap[size];

  return (
    <View
      className={`flex-row items-center self-start ${v.container} ${s.container} ${className || ""}`}
    >
      {dot ? (
        <View
          className={`rounded-full mr-1.5 ${v.dot}`}
          style={{ width: dotSize.width, height: dotSize.height }}
        />
      ) : null}

      {Icon ? (
        <View className="mr-1">
          <Icon size={iSize} color={getVariantTextColor(variant, theme)} />
        </View>
      ) : null}

      <Text className={`${v.text} ${s.text}`}>{children}</Text>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function getVariantTextColor(variant: BadgeVariant, theme: string): string {
  const isDark = theme === "dark";
  switch (variant) {
    case "default":
      return isDark ? "#9CA3AF" : "#6B7280";
    case "success":
      return "#059669";
    case "warning":
      return "#F59E0B";
    case "destructive":
      return "#EF4444";
    case "info":
      return isDark ? "#E85D04" : "#D94A3D";
    default:
      return isDark ? "#9CA3AF" : "#6B7280";
  }
}
