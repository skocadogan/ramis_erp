// ============================================================
// Smart Table — Bottom Tab Navigation Layout
//
// Three-tab layout: Menü, Siparişler, Garson Çağır.
// Profil: Menü tab'ına 5× hızlı tık → gizli açılış.
// Features a custom tab bar with primary colour
// active state, badge support on the orders tab showing
// cart count, and large tablet-optimised touch targets.
//
// Includes auth guard: if not authenticated, redirects to login.
// ============================================================

import { useEffect, useRef, useCallback } from "react";
import { Tabs, useRouter } from "expo-router";
import { View, Text, Pressable, type ColorValue } from "react-native";
import { UtensilsCrossed, ClipboardList, Bell } from "lucide-react-native";
import { useAuthStore } from "@/store/auth-store";
import { useCartStore, selectCartItemCount } from "@/store/cart-store";
import { useUIStore } from "@/store/ui-store";
import { useTheme } from "@/hooks/useTheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Tab Icon Component ─────────────────────────────────────

function TabIcon({
  icon: Icon,
  color,
  size,
  badge,
  badgeColor,
}: {
  icon: typeof UtensilsCrossed;
  color: ColorValue;
  size: number;
  badge?: number;
  badgeColor?: string;
}) {
  return (
    <View className="relative items-center justify-center w-10 h-10">
      <Icon size={size} color={color} strokeWidth={1.8} />
      {badge != null && badge > 0 && (
        <View
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full items-center justify-center px-1"
          style={{ backgroundColor: badgeColor ?? color }}
        >
          <Text className="text-[10px] font-bold text-white">
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Tab Label Component ────────────────────────────────────

function TabLabel({ label, color }: { label: string; color: ColorValue }) {
  return (
    <Text className="text-[10px] font-semibold mt-0.5" style={{ color }}>
      {label}
    </Text>
  );
}

// ─── Tab Layout ─────────────────────────────────────────────

export default function TabLayout() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const language = useUIStore((s) => s.language);
  const itemCount = useCartStore(selectCartItemCount);

  // ── Easter egg: Menü tab'ina 5× hızlı tıkla → Profil ──
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMenuTabPress = useCallback((): boolean => {
    tapCountRef.current += 1;

    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      router.push("/(tabs)/profile");
      return true; // ← easter egg tetiklendi, default onPress'i engelle
    }

    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);

    return false;
  }, [router]);

  // ── Auth guard ──
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/(auth)/login" as never);
    }
  }, [isAuthenticated, isLoading, router]);

  // ── Idle Timer Activation ──
  const setIdleTimerActive = useUIStore((s) => s.setIdleTimerActive);
  useEffect(() => {
    setIdleTimerActive(true);
  }, [setIdleTimerActive]);

  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Android gesture bar veya tuş çubuğu için güvenli padding
  const bottomInset = insets.bottom;
  const safeBottom = bottomInset > 0 ? bottomInset : 14;
  const TAB_HEIGHT = 60 + safeBottom;

  const primaryColor = colors.primary;
  const inactiveColor = colors.icon;
  const bgColor = colors.card;
  const borderColor = colors.border;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: bgColor,
          borderTopColor: borderColor,
          borderTopWidth: 1,
          height: TAB_HEIGHT,
          paddingBottom: safeBottom,
          paddingTop: 8,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      {/* ── Tab 1: Menü (Menu) — 5× hızlı tık → Profil ── */}
      <Tabs.Screen
        name="menu"
        options={{
          tabBarLabel: ({ color }) => (
            <TabLabel
              label={language === "tr" ? "Menü" : "Menu"}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: language === "tr" ? "Menü" : "Menu",
          tabBarIcon: ({ color, size }) => (
            <TabIcon icon={UtensilsCrossed} color={color} size={size} />
          ),
          tabBarButton: ({ onPress, children, ref: _ref, ...rest }) => (
            <Pressable
              {...rest}
              onPress={(e) => {
                const easterEggTriggered = handleMenuTabPress();
                if (!easterEggTriggered) {
                  onPress?.(e);
                }
              }}
            >
              {children}
            </Pressable>
          ),
        }}
      />

      {/* ── Tab 2: Siparişler (Orders) ── */}
      <Tabs.Screen
        name="orders"
        options={{
          tabBarLabel: ({ color }) => (
            <TabLabel
              label={language === "tr" ? "Siparişler" : "Orders"}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: language === "tr" ? "Siparişler" : "Orders",
          tabBarIcon: ({ color, size }) => (
            <TabIcon
              icon={ClipboardList}
              color={color}
              size={size}
              badge={itemCount}
              badgeColor={primaryColor}
            />
          ),
        }}
      />

      {/* ── Tab 3: Garson Çağır ── */}
      <Tabs.Screen
        name="waiter-call"
        options={{
          tabBarLabel: ({ color }) => (
            <TabLabel
              label={language === "tr" ? "Garson" : "Waiter"}
              color={color}
            />
          ),
          tabBarAccessibilityLabel:
            language === "tr" ? "Garson çağır" : "Call waiter",
          tabBarIcon: ({ color, size }) => (
            <TabIcon icon={Bell} color={color} size={size} />
          ),
        }}
      />

      {/* Profil — tab bar'da gösterilmez, top bar'dan erişilir */}
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
