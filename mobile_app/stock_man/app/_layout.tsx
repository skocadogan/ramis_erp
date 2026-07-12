// ============================================================
// Stock Man — Root layout
//
// Boot order:
//   1. Hydrate UI prefs (language, theme) from SecureStore
//   2. Re-hydrate auth (token, user, serverUrl) — restores
//      session if the user was logged in
//   3. Mount providers: React Query, SafeArea, GestureHandler
//   4. Apply NativeWind color scheme (light/dark) via the
//      theme helper
//   5. Render Stack + global hosts (Dialog, Toast)
//
// The route stack is intentionally flat at P0 — the only
// two groups are (auth) and (main), and (main) will host the
// tabs in P1.
// ============================================================

import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated";
import { queryClient } from "@/api/queryClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useUIStore } from "@/store/useUIStore";
import { useBackendHealthStore } from "@/store/useBackendHealthStore";
import { registerApiCallbacks } from "@/api/client";
import { useAppTheme } from "@/utils/theme";
import { ToastHost } from "@/components/ui/Toast";
import { DialogHost } from "@/components/ui/Dialog";
import { ConnectivityGuard } from "@/components/ConnectivityGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initDatabase } from "@/lib/offline/db";
import "../global.css";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore */
});

// Local AGENTS.md §2: silence Reanimated's strict logger so a
// non-fatal animation warning can't crash dev. Call once, before
// any animation mounts.
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

export default function RootLayout() {
  useEffect(() => {
    async function initApp() {
      try {
        registerApiCallbacks({
          onSuccess: () => {
            useBackendHealthStore.getState().recordSuccess();
          },
          onAuthFailure: async () => {
            await useAuthStore.getState().logout();
            queryClient.clear();
            router.replace("/(auth)/login");
          },
          onRefreshToken: async () => {
            return useAuthStore.getState().refreshToken();
          },
        });

        await Promise.all([
          initDatabase(),
          useUIStore.getState().hydrateFromStorage(),
        ]);
        await useAuthStore.getState().init();
      } catch (err) {
        console.warn("[RootLayout] Initialization failed:", err);
      } finally {
        await SplashScreen.hideAsync();
      }
    }
    void initApp();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemedApp />
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function ThemedApp() {
  const { isDark, themeVarsStyle } = useAppTheme();
  return (
    <View style={[themeVarsStyle, { flex: 1 }]} className="flex-1 bg-background">
      <StatusBar style={isDark ? "light" : "dark"} />
      <ConnectivityGuard>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(main)" options={{ headerShown: false }} />
        </Stack>
        <DialogHost />
        <ToastHost />
      </ConnectivityGuard>
    </View>
  );
}
