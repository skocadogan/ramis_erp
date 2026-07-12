// ============================================================
// Stock Man — Expiry KPI Card (Dashboard)
//
// SKT özet sayaçları: 3 gün / 7 gün / süresi geçmiş.
// Web SKT Takibi özet widget'ı ile aynı API alanlarını kullanır.
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import { CalendarClock, ChevronRight } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import type { KpiVariant } from "@/components/dashboard/KpiCard";

export interface ExpiryKpiCardProps {
  within3Days: number;
  within7Days: number;
  expired: number;
  onPress?: () => void;
  variant?: KpiVariant;
}

const variantStyles: Record<
  KpiVariant,
  { tile: string; tileIcon: string; total: string }
> = {
  default: {
    tile: "bg-muted",
    tileIcon: "#64748B",
    total: "text-foreground",
  },
  info: {
    tile: "bg-info/15",
    tileIcon: "#0EA5E9",
    total: "text-info",
  },
  success: {
    tile: "bg-success/15",
    tileIcon: "#059669",
    total: "text-success",
  },
  warning: {
    tile: "bg-warning/15",
    tileIcon: "#F59E0B",
    total: "text-warning",
  },
  destructive: {
    tile: "bg-destructive/15",
    tileIcon: "#DC2626",
    total: "text-destructive",
  },
};

function pickVariant(
  within3Days: number,
  within7Days: number,
  expired: number
): KpiVariant {
  const total = within3Days + within7Days + expired;
  if (total === 0) return "success";
  if (expired > 0 || within3Days > 0) return "destructive";
  if (within7Days > 0) return "warning";
  return "default";
}

function MetricColumn({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName: string;
}) {
  return (
    <View className="flex-1 min-w-0 items-center px-1">
      <Text
        className="text-[10px] leading-3 text-muted-foreground font-semibold text-center"
        numberOfLines={2}
      >
        {label}
      </Text>
      <Text
        className={cn("text-body text-mono font-bold mt-0.5", valueClassName)}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export function ExpiryKpiCard({
  within3Days,
  within7Days,
  expired,
  onPress,
  variant,
}: ExpiryKpiCardProps) {
  const { t } = useI18n();
  const resolvedVariant =
    variant ?? pickVariant(within3Days, within7Days, expired);
  const s = variantStyles[resolvedVariant];
  const total = within3Days + within7Days + expired;

  return (
    <Card
      variant="elevated"
      onPress={onPress}
      className="flex-1"
      accessibilityLabel={`${t("dashboard.kpis.expiringCard.title")}: ${total}`}
      accessibilityRole={onPress ? "button" : "summary"}
    >
      <View className="flex-row items-center justify-between gap-1">
        <Text
          className="text-caption text-muted-foreground font-semibold uppercase"
          numberOfLines={2}
        >
          {t("dashboard.kpis.expiringCard.title")}
        </Text>
        <Text className={cn("text-h2 text-mono font-bold shrink-0", s.total)}>
          {total}
        </Text>
      </View>

      <View className="flex-row items-start mt-2 pt-2 border-t border-border/60">
        <MetricColumn
          label={t("dashboard.kpis.expiringCard.within3")}
          value={within3Days}
          valueClassName={
            within3Days > 0 ? "text-destructive" : "text-foreground"
          }
        />
        <View className="w-px self-stretch bg-border/60" />
        <MetricColumn
          label={t("dashboard.kpis.expiringCard.within7")}
          value={within7Days}
          valueClassName={within7Days > 0 ? "text-warning" : "text-foreground"}
        />
        <View className="w-px self-stretch bg-border/60" />
        <MetricColumn
          label={t("dashboard.kpis.expiringCard.expired")}
          value={expired}
          valueClassName={expired > 0 ? "text-destructive" : "text-foreground"}
        />
      </View>

      {onPress ? (
        <View className="flex-row items-center justify-end mt-1">
          <CalendarClock size={12} color={s.tileIcon} />
          <Text className="text-[10px] text-primary font-semibold ml-1 mr-0.5">
            {t("common.details")}
          </Text>
          <ChevronRight size={12} color="#1E40AF" />
        </View>
      ) : null}
    </Card>
  );
}

