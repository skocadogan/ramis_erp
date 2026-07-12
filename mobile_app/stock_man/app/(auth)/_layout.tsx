// ============================================================
// Auth group layout — just a transparent Stack so the Login
// screen is the root of this group. No header (login design
// owns its layout).
// ============================================================

import { Stack } from "expo-router";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
