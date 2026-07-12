// ============================================================
// Stock Man — KPI Card
//
// One tile in the dashboard's KPI row. Renders a small caption
// (the label), a big number, and a tinted icon on the right.
// When `onPress` is provided the whole card becomes a button
// that pushes the deep-dive route (e.g. tapping "Low stock"
// goes to the filtered stock list).
//
// Variant drives both the icon-tile background and the value
// colour, so the eye picks up the severity without reading
// the label.
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";

export type KpiVariant =
  | "default"
  | "warning"
  | "destructive"
  | "success"
  | "info";

export interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  onPress?: () => void;
  variant?: KpiVariant;
  /** Optional trend indicator (e.g. "+12" or "−3"). */
  trend?: string;
  /** Style the trend as up (good) or down (bad). Default: up. */
  trendDirection?: "up" | "down";
  /** Optional sublabel shown under the value. */
  hint?: string;
}

const variantStyles: Record<
  KpiVariant,
  { tile: string; tileIcon: string; value: string }
> = {
  default: {
    tile: "bg-muted",
    tileIcon: "#64748B",
    value: "text-foreground",
  },
  info: {
    tile: "bg-info/15",
    tileIcon: "#0EA5E9",
    value: "text-info",
  },
  success: {
    tile: "bg-success/15",
    tileIcon: "#059669",
    value: "text-success",
  },
  warning: {
    tile: "bg-warning/15",
    tileIcon: "#F59E0B",
    value: "text-warning",
  },
  destructive: {
    tile: "bg-destructive/15",
    tileIcon: "#DC2626",
    value: "text-destructive",
  },
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  onPress,
  variant = "default",
  trend,
  trendDirection = "up",
  hint,
}: KpiCardProps) {
  const { t } = useI18n();
  const s = variantStyles[variant];

  return (
    <Card
      variant="elevated"
      onPress={onPress}
      className="flex-1"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole={onPress ? "button" : "summary"}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 min-w-0">
          <Text
            className="text-caption text-muted-foreground font-semibold uppercase"
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            className={cn("text-h1 text-mono font-bold mt-1", s.value)}
            numberOfLines={1}
          >
            {value}
          </Text>
          {hint ? (
            <Text
              className="text-caption text-muted-foreground mt-0.5"
              numberOfLines={1}
            >
              {hint}
            </Text>
          ) : null}
          {trend ? (
            <Text
              className={cn(
                "text-caption font-semibold mt-1",
                trendDirection === "up"
                  ? "text-success"
                  : "text-destructive"
              )}
              numberOfLines={1}
            >
              {trendDirection === "up" ? "▲ " : "▼ "}
              {trend}
            </Text>
          ) : null}
        </View>
        <View
          className={cn(
            "h-10 w-10 items-center justify-center rounded-lg ml-2",
            s.tile
          )}
        >
          <Icon size={20} color={s.tileIcon} />
        </View>
      </View>
      {onPress ? (
        <View className="flex-row items-center justify-end mt-2">
          <Text className="text-caption text-primary font-semibold mr-1">
            {t("common.details")}
          </Text>
          <ChevronRight size={14} color="#1E40AF" />
        </View>
      ) : null}
    </Card>
  );
}

