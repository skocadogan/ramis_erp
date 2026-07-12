import { useEffect } from "react";
import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../src/api/queryClient";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "../src/store/useAuthStore";
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";
import { useColorScheme } from "nativewind";
import { usePosStore } from "../src/store/usePosStore";
import { initDatabase } from "../src/features/offline/dbInit";
import "../global.css";

// Disable Reanimated strict mode rendering warnings (caused by third-party packages)
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

/**
 * Kök layout yalın tutulur:
 * - Auth / segment dinlemesi burada YOK (çift yönlendirme ve context yarışlarını önlemek için).
 * - `(main)` ve `(auth)` grupları kendi içinde koruma yapar; Stack hiçbir zaman sökülmez.
 */
export default function RootLayout() {
  const init = useAuthStore((s) => s.init);
  const { colorScheme, setColorScheme } = useColorScheme();
  const themePreference = usePosStore((s) => s.themePreference);

  useEffect(() => {
    // Initialize SQLite database and auth in parallel
    void Promise.all([initDatabase(), init()]);
  }, [init]);

  useEffect(() => {
    if (themePreference) {
      setColorScheme(themePreference);
    }
  }, [themePreference, setColorScheme]);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </QueryClientProvider>
  );
}
