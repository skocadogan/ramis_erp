import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuthStore } from "../../src/store/useAuthStore";
import { useColorScheme } from "nativewind";

/**
 * Auth grubu: Stack HER ZAMAN monte.
 * Zaten giriş yapılmışsa ana gruba gönder.
 */
export default function AuthLayout() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace("/(main)");
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <View style={styles.flex} className={colorScheme === "dark" ? "dark flex-1" : "flex-1"}>
      <Stack screenOptions={{ headerShown: false }} />
      {isLoading ? (
        <View style={styles.overlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#1E2A4A" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    zIndex: 9999,
  },
});
