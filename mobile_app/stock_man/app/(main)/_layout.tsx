// ============================================================
// Stock Man — Main group layout
//
// Auth guard: anyone not signed in is bounced to the login
// screen. While the auth store is still hydrating (cold start)
// we show a full-screen Loading so the user never sees a
// flash of the wrong route.
//
// WSPushHost wraps the stack so the P5 WebSocket subscription
// lives at the top of the authenticated tree.
// ============================================================

import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/store/useAuthStore";
import { Loading } from "@/components/ui/Loading";
import { WSPushHost } from "@/components/WSPushHost";

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <Loading fullScreen />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  return (
    <WSPushHost>
      <Stack screenOptions={{ headerShown: false }} />
    </WSPushHost>
  );
}
