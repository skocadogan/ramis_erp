// ============================================================
// Stock Man — Quick Actions Grid
//
// A responsive grid of large press targets for the most common
// stock-management actions.
// ============================================================

import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  ArrowLeftRight,
  ClipboardCheck,
  PackagePlus,
  Search,
  Truck,
} from "lucide-react-native";
import { useI18n } from "@/i18n";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/utils/cn";
import type { LucideIcon } from "lucide-react-native";

interface QuickAction {
  key: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  href: Href;
  bg: string;
  iconColor: string;
  borderColor: string;
}

const HORIZONTAL_PADDING = 32;
const COLUMNS = 5;

export function QuickActions() {
  const router = useRouter();
  const { t } = useI18n();
  const { width, isTablet } = useResponsive();

  const gap = isTablet ? 8 : 4;
  const itemWidth = useMemo(
    () => (width - HORIZONTAL_PADDING - gap * (COLUMNS - 1)) / COLUMNS,
    [width, gap]
  );

  const actions: QuickAction[] = [
    {
      key: "product-search",
      label: t("stock.productSearch"),
      hint: t("stock.productSearchHint"),
      icon: Search,
      href: "/(main)/stock/search",
      bg: "bg-secondary/10",
      iconColor: "#6366F1",
      borderColor: "border-secondary/20",
    },
    {
      key: "new-purchase",
      label: t("purchase.new"),
      hint: t("purchase.title"),
      icon: PackagePlus,
      href: "/(main)/purchase/new",
      bg: "bg-primary/10",
      iconColor: "#1E40AF",
      borderColor: "border-primary/20",
    },
    {
      key: "goods-receiving",
      label: t("receiving.new"),
      hint: t("receiving.title"),
      icon: Truck,
      href: "/(main)/receiving/new",
      bg: "bg-info/10",
      iconColor: "#0EA5E9",
      borderColor: "border-info/20",
    },
    {
      key: "new-transfer",
      label: t("transfer.new"),
      hint: t("transfer.title"),
      icon: ArrowLeftRight,
      href: "/(main)/transfer/new",
      bg: "bg-warning/10",
      iconColor: "#F59E0B",
      borderColor: "border-warning/20",
    },
    {
      key: "new-counting",
      label: t("counting.new"),
      hint: t("counting.title"),
      icon: ClipboardCheck,
      href: "/(main)/counting/new",
      bg: "bg-success/10",
      iconColor: "#059669",
      borderColor: "border-success/20",
    },
  ];

  const iconSize = isTablet ? 40 : 32;
  const iconGlyph = isTablet ? 20 : 16;

  return (
    <View className="flex-row" style={{ gap }}>
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Pressable
            key={a.key}
            onPress={() => router.push(a.href)}
            accessibilityRole="button"
            accessibilityLabel={`${a.label}. ${a.hint}`}
            style={{ width: itemWidth }}
            className={cn(
              "items-center rounded-xl border bg-card active:opacity-80",
              a.borderColor,
              isTablet ? "px-2 py-2.5" : "px-1 py-1.5"
            )}
            hitSlop={4}
          >
            <View
              className={cn(
                "items-center justify-center rounded-lg",
                a.bg
              )}
              style={{ width: iconSize, height: iconSize }}
            >
              <Icon size={iconGlyph} color={a.iconColor} />
            </View>
            <Text
              className={cn(
                "mt-1 text-center font-semibold text-foreground",
                isTablet ? "text-caption leading-4" : "text-[10px] leading-3"
              )}
              numberOfLines={2}
            >
              {a.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

