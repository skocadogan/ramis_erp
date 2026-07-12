// ============================================================
// Smart Table — Welcome / Splash Screen
//
// First screen the user sees. Tapping anywhere triggers
// auth check and redirects to login or menu.
// ============================================================

import { useCallback, useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronRight, Bell, ClipboardList } from "lucide-react-native";
import { Image } from "expo-image";
import QRCode from "react-native-qrcode-svg";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { useTableStore } from "@/store/table-store";
import { useOrderStore } from "@/store/order-store";
import { useTheme } from "@/hooks/useTheme";
import {
  deriveCustomerOrderDisplayStatus,
  type CustomerOrderDisplayStatus,
} from "@/utils/customerOrderStatus";
import { getCustomerStatusColor, getCustomerStatusLabel } from "@/utils/format";
import { fetchCategories, fetchAllProducts } from "@/services/menuService";

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, setIdleTimerActive } = useUIStore();
  const selectedTable = useTableStore((s) => s.selectedTable);
  const [navigating, setNavigating] = useState(false);
  const { isDark, colors } = useTheme();

  // ── Sipariş durumu ──
  const activeOrders = useOrderStore((s) => s.activeOrders);
  const fetchOrders = useOrderStore((s) => s.fetchOrders);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Karşılama ekranında ilk siparişleri çek (auth varsa)
  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders(undefined, { background: true });
    }
  }, [isAuthenticated, fetchOrders]);

  // PERF: Menü verisini karşılama ekranında arka planda ön yükle.
  // Kullanıcı "Başlamak için Dokunun" dediğinde backend/network zaten sıcak,
  // menu ekranındaki useMenu() API çağrıları çok daha hızlı tamamlanır.
  const selectedBranchId = useTableStore((s) => s.selectedBranch?.id);
  useEffect(() => {
    if (!isAuthenticated) return;
    const params = selectedBranchId ? { branch_id: selectedBranchId } : undefined;
    // Fire-and-forget: sonucu bekleme, sadece backend'i ısıt
    fetchCategories(params).catch(() => {});
    fetchAllProducts(params).catch(() => {});
  }, [isAuthenticated, selectedBranchId]);

  // En kritik sipariş durumunu bul (aggregate)
  const aggregatedStatus = useMemo<CustomerOrderDisplayStatus | null>(() => {
    if (activeOrders.length === 0) return null;
    const priority: CustomerOrderDisplayStatus[] = [
      "ON_THE_WAY",
      "PREPARED",
      "PREPARING",
      "SENT_TO_KITCHEN",
      "DELIVERED",
      "COMPLETED",
      "CANCELLED",
    ];
    for (const status of priority) {
      if (
        activeOrders.some((o) => deriveCustomerOrderDisplayStatus(o) === status)
      ) {
        return status;
      }
    }
    return "SENT_TO_KITCHEN";
  }, [activeOrders]);

  // Toplam ürün sayısı
  const totalItemCount = useMemo(
    () => activeOrders.reduce((sum, o) => sum + o.items.length, 0),
    [activeOrders],
  );

  useEffect(() => {
    setIdleTimerActive(false);
  }, [setIdleTimerActive]);

  const handleStart = useCallback(async () => {
    if (navigating) return;
    setNavigating(true);

    try {
      // Auth store init zaten _layout'ta useEffect ile çağrıldı.
      // Direkt state'i okuyup yönlendiriyoruz.
      const { isAuthenticated } = useAuthStore.getState();

      if (isAuthenticated) {
        router.replace("/(tabs)/menu" as never);
      } else {
        router.replace("/(auth)/login" as never);
      }
    } catch {
      // Hata olursa login'e gönder
      router.replace("/(auth)/login" as never);
    }
  }, [navigating, router]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* ── Full-screen gradient background ── */}
      <LinearGradient
        colors={
          isDark
            ? ["#1A0A0A", "#0F0F1A", "#0A0A14"]
            : ["#FFF5F3", "#FAFAFA", "#F5F0FF"]
        }
        locations={[0, 0.5, 1]}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />

      {/* ── Language Switcher Button ── */}
      <View
        className="absolute z-50"
        style={{
          top: insets.top + 16,
          right: 20,
        }}
      >
        <Pressable
          onPress={() => setLanguage(language === "tr" ? "en" : "tr")}

          accessibilityRole="button"
          accessibilityLabel={
            language === "tr"
              ? "Dili İngilizce yap"
              : "Switch language to Turkish"
          }
          className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-full border shadow-sm"
          style={{
            backgroundColor: `${colors.card}E6`,
            borderColor: colors.border,
          }}
          disabled={navigating}
        >
          <Text
            className="text-xs font-bold"
            style={{ color: colors.foreground }}
          >
            {language === "tr" ? "🇬🇧 EN" : "🇹🇷 TR"}
          </Text>
        </Pressable>
      </View>

      {/* ── Decorative glow orbs ── */}
      <View className="absolute -top-48 -right-32 w-96 h-96 rounded-full opacity-30">
        <LinearGradient
          colors={
            isDark ? ["#D94A3D20", "#D94A3D00"] : ["#D94A3D15", "#D94A3D00"]
          }
          className="w-full h-full rounded-full"
        />
      </View>
      <View className="absolute -bottom-40 -left-28 w-72 h-72 rounded-full opacity-25">
        <LinearGradient
          colors={
            isDark ? ["#E85D0415", "#E85D0400"] : ["#F9731610", "#F9731600"]
          }
          className="w-full h-full rounded-full"
        />
      </View>
      <View className="absolute top-1/3 -left-20 w-48 h-48 rounded-full opacity-10">
        <LinearGradient
          colors={
            isDark ? ["#8B5CF620", "#8B5CF600"] : ["#8B5CF610", "#8B5CF600"]
          }
          className="w-full h-full rounded-full"
        />
      </View>

      {/* ── Content ── */}
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: "transparent" }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
          paddingVertical: 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full items-center">
          {/* Logo area */}
          <View className="w-32 h-32 mb-2">
            <Image
              source={require("../assets/splash-icon.png")}
              style={{ width: "100%", height: "100%" }}
              contentFit="contain"
            />
          </View>

          {/* Brand name */}
          <Text
            className="text-3xl font-extrabold text-center tracking-tight"
            style={{ color: colors.primary }}
          >
            Akıllı Masa
          </Text>

          {/* Selected table — QR Code */}
          {selectedTable && (
            <View
              className="items-center mt-6 px-5 py-4 rounded-2xl border"
              style={{
                backgroundColor: `${colors.card}20`,
                borderColor: colors.border,
              }}
            >
              {/* QR Code */}
              <View
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: isDark ? "#EDEDED" : "#FFFFFF",
                  padding: 12,
                  width: 204,
                  height: 204,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <QRCode
                  value={selectedTable.id}
                  size={180}
                  backgroundColor={isDark ? "#EDEDED" : "#FFFFFF"}
                  color={isDark ? "#0F0F1A" : "#1A1A2E"}
                />
              </View>

              {/* Table name */}
              <Text
                className="text-base font-bold mt-3"
                style={{ color: colors.foreground }}
              >
                {selectedTable.name}
              </Text>
            </View>
          )}

          {/* ── Active Orders Elegant Indicator ── */}
          {activeOrders.length > 0 && aggregatedStatus && (
            <View
              className="flex-row items-center gap-3 mt-5 px-4 py-3 rounded-2xl border"
              style={{
                backgroundColor: colors.card,
                borderColor: `${getCustomerStatusColor(aggregatedStatus)}40`,
                shadowColor: getCustomerStatusColor(aggregatedStatus),
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12,
                shadowRadius: 8,
                elevation: 3,
              }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center">
                <ClipboardList
                  size={20}
                  color={getCustomerStatusColor(aggregatedStatus)}
                  strokeWidth={1.8}
                />
              </View>

              {/* Text */}
              <View className="flex-1">
                <Text
                  className="text-sm font-bold"
                  style={{ color: colors.foreground }}
                >
                  {activeOrders.length}{" "}
                  {language === "tr"
                    ? "aktif siparişiniz var"
                    : `active order${activeOrders.length > 1 ? "s" : ""}`}
                </Text>
                <Text
                  className="text-xs mt-0.5"
                  style={{ color: getCustomerStatusColor(aggregatedStatus) }}
                >
                  {getCustomerStatusLabel(aggregatedStatus, language)}
                  {totalItemCount > 0 &&
                    ` · ${totalItemCount} ${language === "tr" ? "ürün" : "item"}`}
                </Text>
              </View>

              {/* Pulse dot */}
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: getCustomerStatusColor(aggregatedStatus),
                }}
              />
            </View>
          )}

          {/* Divider */}
          <View
            className="w-12 h-0.5 rounded-full mt-8 mb-8"
            style={{ backgroundColor: `${colors.primary}66` }}
          />

          {/* Tap to start indicator */}
          <Pressable
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel={language === "tr" ? "Menüye git" : "Go to menu"}
            className="rounded-full"
            disabled={navigating}
          >
            <View
              className="flex-row items-center gap-3 px-8 py-4 rounded-full border shadow-xl"
              style={{
                backgroundColor: colors.primary,
                borderColor: colors.primary,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDark ? 0.65 : 0.4,
                shadowRadius: 16,
                elevation: 10,
              }}
            >
              {navigating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text className="text-sm font-black tracking-widest uppercase text-white">
                    {language === "tr"
                      ? "Başlamak için Dokunun"
                      : "Tap to Start"}
                  </Text>
                  <ChevronRight size={18} color="#FFFFFF" strokeWidth={3} />
                </>
              )}
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Waiter Call Button ── */}
      <Pressable
        onPress={() => router.push("/waiter-call" as never)}

        accessibilityRole="button"
        accessibilityLabel={language === "tr" ? "Garson çağır" : "Call waiter"}
        className="flex-row items-center justify-center gap-2.5 mx-8 mb-6 h-16 rounded-2xl border"
        style={{
          backgroundColor: `${colors.card}CC`,
          borderColor: colors.border,
        }}
        disabled={navigating}
      >
        <Bell size={20} color={colors.primary} strokeWidth={1.8} />
        <Text
          className="text-lg font-semibold"
          style={{ color: colors.foreground }}
        >
          {language === "tr" ? "Garson Çağır" : "Call Waiter"}
        </Text>
      </Pressable>

      {/* ── Footer ── */}
      <View
        className="items-center pb-8"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <Text
          className="text-xs"
          style={{ color: colors.mutedForeground }}
        ></Text>
        <Text
          className="text-xs mt-1"
          style={{ color: colors.mutedForeground }}
        >
          0.0.7
        </Text>
      </View>
    </View>
  );
}
