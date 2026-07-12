// ============================================================
// Smart Table — Root Layout
// On mount: initialise auth state from SecureStore and load
// persisted theme preference.
// ============================================================

import { useEffect, useLayoutEffect } from "react";
import { Appearance } from "react-native";
import { Asset } from "expo-asset";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated";
import { useAuthStore } from "@/store/auth-store";
import { useTableStore } from "@/store/table-store";
import { useUIStore } from "@/store/ui-store";
import { useTheme } from "@/hooks/useTheme";
import { useOrderSync } from "@/hooks/useOrderSync";
import IdleTimerProvider from "@/components/IdleTimerProvider";
import ConnectivityGuard from "@/components/ConnectivityGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Dialog } from "@/components/ui/Dialog";
import { SmartTableSurveyHost } from "@/components/survey/SmartTableSurveyHost";
import { Toast } from "@/components/ui/Toast";
import "../global.css";

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

export default function RootLayout() {
  const initAuth = useAuthStore((s) => s.init);
  const initTable = useTableStore((s) => s.init);
  const loadIdleTimeout = useUIStore((s) => s.loadIdleTimeout);
  const loadTheme = useUIStore((s) => s.loadTheme);
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { colors } = useTheme();

  // WebSocket sipariş senkronizasyonu — tüm ekranlarda canlı
  useOrderSync();

  // Initialize auth state, table state, idle timeout ve tema tercihini yükle
  useEffect(() => {
    initAuth();
    initTable();
    loadIdleTimeout();
    loadTheme();
  }, [initAuth, initTable, loadIdleTimeout, loadTheme]);

  // Kritik asset'leri ön yükle — splash ve icon geçişlerini hızlandırır
  useEffect(() => {
    Asset.loadAsync([
      require("../assets/icon.png"),
      require("../assets/adaptive-icon.png"),
      require("../assets/splash.png"),
    ]).catch((err) => {
      console.warn("[RootLayout] Asset preload error:", err);
    });
  }, []);

  // Tema değişince hem Appearance hem NativeWind dark: modifier'ını tetikle
  // Bu iki mekanizmanın senkronize olması kritiktir:
  // - Appearance.setColorScheme → NativeWind useColorScheme ile dark: class'larını günceller
  // - useTheme() hook → inline style renkleri günceller
  useLayoutEffect(() => {
    Appearance.setColorScheme(isDark ? "dark" : "light");
  }, [isDark]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <IdleTimerProvider>
          <ConnectivityGuard />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "slide_from_right",
              animationDuration: 300,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="product/[id]"
              options={{
                presentation: "modal",
                animation: "slide_from_bottom",
                animationDuration: 350,
              }}
            />
            <Stack.Screen
              name="waiter-call"
              options={{
                presentation: "modal",
                animation: "slide_from_bottom",
                animationDuration: 350,
              }}
            />
          </Stack>
          <Dialog />
          <SmartTableSurveyHost />
          <Toast />
          <StatusBar style={isDark ? "light" : "dark"} />
        </IdleTimerProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
