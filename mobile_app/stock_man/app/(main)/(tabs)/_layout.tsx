// ============================================================
// Stock Man — Bottom tabs
//
// 7 tabs: Dashboard · Stock · Purchase · Transfers · Deficiency · Return/Cancel · More
// (Settings is reached through the "More" tab for now; in
// later phases we may move Settings to its own tab if the
// "More" screen becomes too crowded.)
//
// Icons: lucide-react-native. Active tint: brand primary
// (#1E40AF navy).
// ============================================================

import { useMemo } from "react";
import { Tabs } from "expo-router";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ArrowLeftRight,
  ListMinus,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/i18n";
import { useAppTheme } from "@/utils/theme";
import { getTabBarColors } from "@/theme/colorVariables";

export default function TabsLayout() {
  const { t } = useI18n();
  const { isDark } = useAppTheme();
  const tabColors = useMemo(() => getTabBarColors(isDark), [isDark]);
  const insets = useSafeAreaInsets();
  const safeBottom = insets.bottom > 0 ? insets.bottom : 8;
  const tabBarHeight = 56 + safeBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabColors.active,
        tabBarInactiveTintColor: tabColors.inactive,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: safeBottom,
          backgroundColor: tabColors.background,
          borderTopColor: tabColors.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("dashboard.title"),
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: t("stock.title"),
          tabBarIcon: ({ color, size }) => (
            <Package size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="purchase"
        options={{
          title: t("purchase.title"),
          tabBarIcon: ({ color, size }) => (
            <ShoppingCart size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transfers"
        options={{
          title: t("transfer.title"),
          tabBarIcon: ({ color, size }) => (
            <ArrowLeftRight size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="deficiency"
        options={{
          title: t("deficiency.title"),
          tabBarIcon: ({ color, size }) => (
            <ListMinus size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="return-cancel"
        options={{
          title: t("returnCancel.nav.tabShort"),
          tabBarIcon: ({ color, size }) => (
            <RotateCcw size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("settings.title"),
          tabBarIcon: ({ color, size }) => (
            <MoreHorizontal size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
