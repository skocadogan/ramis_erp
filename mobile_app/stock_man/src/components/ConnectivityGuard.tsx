// ============================================================
// Stock Man — ConnectivityGuard (P5)
//
// Polls `useBackendHealthStore.checkHealth()` on a regular
// interval and renders a full-screen blocking modal when the
// backend is unreachable (state === "down"). The polling
// interval shortens to 10 s while we believe the backend is
// down so we recover quickly once the network/server comes
// back, and lengthens to 30 s otherwise to save battery.
//
// The modal exposes two escape hatches:
//
//   - "Retry"            : re-runs the health check on demand.
//   - "Sign out"         : clears the JWT + redirects to /login.
//
// We deliberately do *not* block children while the health
// status is "checking" — the normal app UI is shown and the
// modal only pops up when we have positive evidence that the
// backend is down (>=2 consecutive failures per the store's
// FAIL_THRESHOLD).
// ============================================================

import { ReactNode, useEffect, useState } from "react";
import { Modal, View, Text, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useBackendHealthStore } from "@/store/useBackendHealthStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { WifiOff } from "lucide-react-native";

const HEALTH_INTERVAL_MS = 30_000;
const FAST_RECHECK_MS = 10_000;
const INITIAL_CHECK_DELAY_MS = 2_000;

export function ConnectivityGuard({ children }: { children: ReactNode }) {
  const { status, checkHealth } = useBackendHealthStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { t } = useI18n();
  const [showModal, setShowModal] = useState(false);

  // Bootstrap + interval polling. We re-arm the interval whenever
  // the status flips so the fast-recheck window is honoured.
  useEffect(() => {
    if (!isAuthenticated) return;
    const initial = setTimeout(() => {
      void checkHealth();
    }, INITIAL_CHECK_DELAY_MS);

    const id = setInterval(() => {
      void checkHealth();
    }, status === "down" ? FAST_RECHECK_MS : HEALTH_INTERVAL_MS);

    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [isAuthenticated, status, checkHealth]);

  // Drive the modal visibility off the health store + auth gate.
  useEffect(() => {
    const shouldShow = status === "down" && isAuthenticated;
    const timer = setTimeout(() => {
      setShowModal(shouldShow);
    }, 0);
    return () => clearTimeout(timer);
  }, [status, isAuthenticated]);

  return (
    <>
      {children}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          // Android back button: do nothing — we want the user to
          // either retry or sign out, not silently dismiss.
        }}
      >
        <View className="flex-1 items-center justify-center bg-black/60">
          <View className="bg-card rounded-2xl p-6 mx-6 max-w-sm w-full items-center">
            <View className="w-16 h-16 rounded-full bg-destructive/10 items-center justify-center mb-4">
              <WifiOff size={32} color="#DC2626" />
            </View>
            <Text className="text-h2 text-foreground mb-2 text-center">
              {t("common.noConnectionTitle")}
            </Text>
            <Text className="text-body text-muted-foreground text-center mb-6">
              {t("common.noConnectionDesc")}
            </Text>
            <View className="w-full">
              <Button
                variant="primary"
                fullWidth
                onPress={() => {
                  void checkHealth();
                }}
              >
                {t("common.retry")}
              </Button>
            </View>
            <View className="mt-2 w-full">
              <Button
                variant="outline"
                fullWidth
                onPress={async () => {
                  await useAuthStore.getState().logout();
                  router.replace("/(auth)/login");
                }}
              >
                {t("dashboard.logout") ?? t("settings.logoutConfirm")}
              </Button>
            </View>
            {status === "checking" ? (
              <View className="flex-row items-center mt-3">
                <ActivityIndicator size="small" />
                <Text className="ml-2 text-caption text-muted-foreground">
                  {t("common.loading")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

