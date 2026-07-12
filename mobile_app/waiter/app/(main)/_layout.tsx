import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../src/store/useAuthStore";
import { useI18n } from "../../src/i18n";
import { usePosStore, applyWaiterScreenPreferences } from "../../src/store/usePosStore";
import { useUnifiedSync } from "../../src/hooks/useUnifiedSync";
import { useWaiterCallReminders } from "../../src/hooks/useWaiterCallReminders";
import { useWaiterPosPushStore } from "../../src/store/useWaiterPosPushStore";
import { useBackendHealthStore } from "../../src/store/useBackendHealthStore";
import { effectiveBranchId } from "../../src/utils/branchScope";
import { fetchActiveShift } from "../../src/api/waiterApi";
import apiClient from "../../src/api/client";
import { useShallow } from "zustand/react/shallow";
import CustomDialog from "../../src/components/CustomDialog";
import WaiterNotificationOverlay from "../../src/components/WaiterNotificationOverlay";
import { OfflineQueueHost } from "../../src/features/offline/OfflineQueueProvider";
import { useColorScheme } from "nativewind";
import type { ErrorBoundaryProps } from "expo-router";

/** Ana sayfa veya terminal/ayarlar dışında POS terminal zorunlu */
function allowsMissingPosTerminal(segments: string[]): boolean {
  if (!segments.length) return true;
  if (
    segments.includes("terminal-select") ||
    segments.includes("settings") ||
    segments.includes("button-setup")
  )
    return true;
  const deep = segments.filter((s) => s !== "(main)");
  return deep.length === 0;
}

/** Ana sayfa, ayarlar veya terminal seçim ekranında vardiya kapalı olsa bile kalınabilir */
function isShiftSafeRoute(segments: string[]): boolean {
  const deep = segments.filter((s) => s !== "(main)");
  if (deep.length === 0) return true;
  if (segments.includes("terminal-select")) return true;
  if (segments.includes("settings")) return true;
  if (segments.includes("button-setup")) return true;
  return false;
}

function WaiterPosSyncHost() {
  const router = useRouter();
  const segments = useSegments();
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { activeBranchId, posTerminalUuid } = usePosStore(
    useShallow((s) => ({
      activeBranchId: s.activeBranchId,
      posTerminalUuid: s.posTerminalUuid,
    }))
  );
  const branchId = effectiveBranchId(user?.branchId, activeBranchId);

  const shiftQuery = useQuery({
    queryKey: ["shift", "active", branchId, posTerminalUuid] as const,
    queryFn: () => fetchActiveShift(branchId!, posTerminalUuid),
    enabled: !!branchId && !!posTerminalUuid,
    // WS bağlantısı aktifken 30 s yeterli; bağlantı kopuksa daha sık kontrol et
    refetchInterval: posTerminalUuid ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  /** Garson çağrısı / rezervasyon uyarıları — terminal seçimi gerekmez */
  const pushNotificationsEnabled = !!(token && branchId);

  useEffect(() => {
    if (!token || !branchId || posTerminalUuid) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.get("/auth/me/pos-screen-preferences/", {
          params: { context: "waiter" },
        });
        if (cancelled) return;
        const p = res.data?.preferences as Record<string, unknown> | undefined;
        applyWaiterScreenPreferences(p);
        const uuid = p?.assigned_pos_terminal_uuid;
        const code = p?.assigned_terminal_code;
        if (uuid && code) {
          usePosStore.getState().setTerminal(String(code), String(uuid));
          void usePosStore.getState().syncStockTrackingModeFromTerminal(String(uuid));
        }
      } catch {
        /* sunucuda tercih yok veya ağ */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, branchId, posTerminalUuid]);

  useEffect(() => {
    if (!token || !branchId) return;

    if (!posTerminalUuid && !allowsMissingPosTerminal(segments)) {
      router.replace("/(main)/terminal-select");
      return;
    }

    if (
      posTerminalUuid &&
      shiftQuery.isSuccess &&
      shiftQuery.data?.status !== "OPEN" &&
      !isShiftSafeRoute(segments)
    ) {
      useWaiterPosPushStore.getState().setReadyItemsCount(0);
      void queryClient.invalidateQueries({ queryKey: ["shift"] });
      router.replace("/(main)");
    }
  }, [
    token,
    branchId,
    posTerminalUuid,
    segments,
    shiftQuery.isSuccess,
    shiftQuery.data?.status,
    router,
    queryClient,
  ]);

  useEffect(() => {
    if (!token || !branchId || !posTerminalUuid) return;
    void usePosStore.getState().syncStockTrackingModeFromTerminal(posTerminalUuid);
  }, [token, branchId, posTerminalUuid]);

  useUnifiedSync(pushNotificationsEnabled);
  useWaiterCallReminders(pushNotificationsEnabled);

  useEffect(() => {
    useWaiterPosPushStore.getState().setMenuRefreshHandler(() => {
      void queryClient.invalidateQueries({ queryKey: ["menu"] });
      void queryClient.invalidateQueries({ queryKey: ["production-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["product-availabilities"] });
      void queryClient.invalidateQueries({ queryKey: ["table"] });
    });
    return () => {
      useWaiterPosPushStore.getState().setMenuRefreshHandler(null);
    };
  }, [queryClient]);

  useEffect(() => {
    const store = useBackendHealthStore.getState();

    // İlk kontrolü 3 sn geciktir: login/init sırasındaki başarılı API yanıtları
    // interceptor aracılığıyla zaten "ok" set eder; çok erken gelen /health/
    // geçici ağ meşguliyetinden false-positive "down" üretebilir.
    const initial = setTimeout(() => void store.checkHealth(), 3000);

    // 30 s — WS zaten anlık bildirir; aşırı HTTP baskısı önlenir
    const interval = setInterval(() => {
      void store.checkHealth();
    }, 30_000);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  return null;
}

/** Rota hatasında Stack/navigator ayakta kalır (kök ErrorBoundary navigasyonu söker). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorTitle}>Beklenmedik bir hata oluştu</Text>
      <Text style={styles.errorMessage} numberOfLines={4}>
        {error.message}
      </Text>
      <Pressable style={styles.errorButton} onPress={retry}>
        <Text style={styles.errorButtonText}>Yeniden Dene</Text>
      </Pressable>
    </View>
  );
}

/**
 * Ana grup: Stack HER ZAMAN monte.
 * Oturum yoksa replace ile çıkış — Stack'i unmount etmeyin (navigation context kopması).
 */
export default function MainLayout() {
  const router = useRouter();
  const { t } = useI18n();
  const { colorScheme } = useColorScheme();
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const { disconnectModalVisible, disconnectModalMessage, setDisconnectModal } = usePosStore(
    useShallow((s) => ({
      disconnectModalVisible: s.disconnectModalVisible,
      disconnectModalMessage: s.disconnectModalMessage,
      setDisconnectModal: s.setDisconnectModal,
    }))
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <View style={styles.flex} className={colorScheme === "dark" ? "dark flex-1" : "flex-1"}>
      {/*
        Manuel Stack.Screen isimleri dosya tabanlı rotalarla uyuşmayınca navigator bozuluyordu
        ("No route named table/[id]"). Expo Router alt rotaları otomatik bağlar — boş Stack kullanın.
      */}
      <Stack screenOptions={{ headerShown: false }} />
      <WaiterPosSyncHost />
      <OfflineQueueHost />
      <WaiterNotificationOverlay />
      {isLoading ? (
        <View style={styles.overlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#1E2A4A" />
        </View>
      ) : null}

      <CustomDialog
        visible={disconnectModalVisible}
        title="Bağlantı Koptu"
        message={disconnectModalMessage}
        type="error"
        confirmLabel="Tamam"
        onConfirm={() => setDisconnectModal(false)}
        secondaryLabel={t("settings.logout")}
        onSecondary={() => {
          setDisconnectModal(false);
          void logout();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  errorBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111",
    marginBottom: 8,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 18,
  },
  errorButton: {
    backgroundColor: "#1E2A4A",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  errorButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    zIndex: 9999,
  },
});
