// ============================================================
// Smart Table — Auth Layout
// Guards: if already authenticated, redirects to main tabs.
// ============================================================

import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { useAuthStore } from "@/store/auth-store";

export default function AuthLayout() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace("/(tabs)/menu");
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
