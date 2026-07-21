// ============================================================
// Smart Table — ConnectivityGuard
//
// Tamamen görünmez koruma katmanı. Normal çalışmada hissedilmez.
//   1) Auth state yüklendikten sonra saklı JWT'yi doğrular;
//      geçersizse 42 sn (5 deneme, 2/4/8/16/16 s) içinde login'e atar.
//   2) Doğrulama başarılıysa 30 sn aralıkla sessiz health-check başlatır;
//      down olursa 10 sn hızlı recheck moduna geçer.
//   3) App foreground'a dönünce anında bir recheck tetikler.
//   4) healthStatus === 'down' VE güvenli olmayan rotada ise "Bağlantı
//      Koptu" modal'ı açar; düzelince otomatik kapatır ve siparişleri
//      sessizce arka planda yeniler.
//
// Pattern: mobile_app/waiter/app/(main)/_layout.tsx (WaiterPosSyncHost)
// ============================================================

import { useEffect, useRef } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  AppState,
  Pressable,
  type AppStateStatus,
} from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useAuthStore } from "@/store/auth-store";
import { useTableStore } from "@/store/table-store";
import { useBackendHealthStore } from "@/store/useBackendHealthStore";
import { useOrderStore } from "@/store/order-store";
import { useUIStore } from "@/store/ui-store";
import { useTheme } from "@/hooks/useTheme";
import { attemptTokenRefresh } from "@/services/api";

// ─── Sabitler ────────────────────────────────────────────────

/** Sağlıklı durumda periyodik health-check aralığı. */
const HEALTH_INTERVAL_MS = 30_000;
/** Down durumunda daha sık recheck — kullanıcı beklerken hızlı toparlansın. */
const FAST_RECHECK_MS = 10_000;
/** İlk health-check için gecikme — auth/UI mount olsun. */
const INITIAL_CHECK_DELAY_MS = 2_000;
/** Token doğrulamasında en fazla deneme sayısı. */
const MAX_AUTO_LOGIN_ATTEMPTS = 5;
/** Token doğrulaması tek seferlik HTTP timeout. */
const VALIDATE_TIMEOUT_MS = 5_000;

/**
 * Üstel geri-çekilme — 2s, 4s, 8s, 16s (16s sonrası sabit).
 * Toplam bütçe: 2+4+8+16 = 30s + 5x ilk istek = ~50s.
 */
function computeBackoff(attempt: number): number {
  return Math.min(2_000 * 2 ** (attempt - 1), 16_000);
}

// ─── Token Doğrulama (modül kapsamında in-flight dedup) ──────

let validateInFlight: Promise<"valid" | "invalid" | "unreachable"> | null =
  null;

type TokenCheckResult = "ok" | "unauthorized" | "network";

/**
 * Saklı JWT'yi `/api/v1/auth/me/` üzerinden doğrular.
 * Ağ hatalarını auth başarısızlığından ayırır — geçici kopmada logout yok.
 */
async function validateStoredToken(): Promise<
  "valid" | "invalid" | "unreachable"
> {
  if (validateInFlight) return validateInFlight;

  validateInFlight = (async () => {
    const { serverUrl, token } = useAuthStore.getState();
    if (!serverUrl || !token) return "invalid";

    const accessResult = await checkToken(serverUrl, token);
    if (accessResult === "ok") return "valid";
    if (accessResult === "network") return "unreachable";

    // unauthorized → refresh dene
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      const renewedToken = useAuthStore.getState().token;
      if (renewedToken) {
        const renewed = await checkToken(serverUrl, renewedToken);
        if (renewed === "ok") return "valid";
        if (renewed === "network") return "unreachable";
      }
    }

    return "invalid";
  })().finally(() => {
    validateInFlight = null;
  });

  return validateInFlight;
}

async function checkToken(
  serverUrl: string,
  token: string,
): Promise<TokenCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    const response = await fetch(`${serverUrl}/api/v1/auth/me/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    if (response.ok) return "ok";
    if (response.status === 401 || response.status === 403) {
      return "unauthorized";
    }
    // 5xx vb. — sunucu ayakta değil / geçici; logout etme
    return "network";
  } catch {
    return "network";
  } finally {
    clearTimeout(timeout);
  }
}

// ─── useConnectivityMonitor ──────────────────────────────────

/**
 * Tüm connectivity yaşam döngüsünü yöneten tek hook.
 *
 * Durum makinesi (iki paralel akış):
 *
 *   Auto-login (auth yüklendikten SONRA):
 *     isAuthenticated && serverUrl && !isLoading
 *       ├─ validateStoredToken() === 'valid'       → store.recordSuccess()
 *       ├─ 'unreachable'                           → backoff retry (logout YOK)
 *       ├─ 'invalid', attempt < 5                  → computeBackoff sonra tekrar
 *       └─ 'invalid', attempt >= 5                 → logout() + router.replace('/(auth)/login')
 *
 *   Periodic health check (auto-login başarıyla geçtikten sonra):
 *     status === 'ok'        → 30 sn aralıkla
 *     status === 'down'      → 10 sn aralıkla (daha hızlı toparlanma)
 *     her AppState 'active'  → anında bir check
 *
 * Modal görünürlüğü `useDisconnectOverlay` tarafından ayrı bir effect
 * ile değerlendirilir; burada sadece ağ durumunu değiştiriyoruz.
 */
function useConnectivityMonitor() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const status = useBackendHealthStore((s) => s.status);
  const checkHealth = useBackendHealthStore((s) => s.checkHealth);
  const recordSuccess = useBackendHealthStore((s) => s.recordSuccess);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  // Aynı auth oturumunda yalnız bir kez doğrulama çalıştır.
  // Auth false'a dönüp tekrar true olduğunda (yeni login) tekrar çalışır.
  const isRunningRef = useRef(false);

  // ── Auto-login doğrulaması + geri-çekilme ─────────────────
  useEffect(() => {
    if (isLoading || !isAuthenticated || !serverUrl) return;
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async (attemptNumber: number) => {
      if (cancelled) return;
      const result = await validateStoredToken();
      if (cancelled) return;

      if (result === "valid") {
        recordSuccess();
        return;
      }

      // Ağ/sunucu hatası — oturumu düşürme; health modal'a bırak, yeniden dene
      if (result === "unreachable") {
        void checkHealth();
        const delay = computeBackoff(Math.min(attemptNumber, 5));
        retryTimer = setTimeout(() => void attempt(attemptNumber), delay);
        return;
      }

      // Confirmed invalid token
      if (attemptNumber >= MAX_AUTO_LOGIN_ATTEMPTS) {
        try {
          await logout();
        } catch (err) {
          console.warn("[ConnectivityGuard] logout error:", err);
        }
        if (!cancelled) {
          isRunningRef.current = false;
          router.replace("/(auth)/login");
        }
        return;
      }

      const nextAttempt = attemptNumber + 1;
      const delay = computeBackoff(nextAttempt);
      retryTimer = setTimeout(() => void attempt(nextAttempt), delay);
    };

    // İlk deneme 1 sn sonra — SecureStore iyice yerleşsin, ekran açılsın.
    retryTimer = setTimeout(() => void attempt(1), 1_000);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      isRunningRef.current = false;
    };
  }, [isLoading, isAuthenticated, serverUrl, recordSuccess, logout, router, checkHealth]);

  // ── İlk health check (bir kez) ────────────────────────────
  // status değişimlerine bağlı değil; auth+UI mount olduktan sonra
  // sabit bir gecikmeyle tetiklenir. Ref ile double-fire koruması.
  const hasInitialCheckRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !serverUrl) return;
    if (hasInitialCheckRef.current) return;
    hasInitialCheckRef.current = true;

    const initial = setTimeout(() => {
      void checkHealth();
    }, INITIAL_CHECK_DELAY_MS);

    return () => {
      clearTimeout(initial);
      // Logout gibi durumlarda tekrar tetiklenebilsin diye ref'i sıfırla.
      hasInitialCheckRef.current = false;
    };
  }, [isAuthenticated, serverUrl, checkHealth]);

  // ── Periyodik health check (status'a göre yeniden kurulur) ─
  useEffect(() => {
    if (!isAuthenticated || !serverUrl) return;

    // Down durumunda daha sık yokla; kullanıcı modal'a bakarken
    // toparlanmayı çabuk fark edelim.
    const intervalMs = status === "down" ? FAST_RECHECK_MS : HEALTH_INTERVAL_MS;
    const interval = setInterval(() => {
      void checkHealth();
    }, intervalMs);

    return () => clearInterval(interval);
    // status değişince effect yeniden çalışır → down'a geçince 10 sn
    // periyoda, ok'a dönünce 30 sn periyoda otomatik geçer.
  }, [isAuthenticated, serverUrl, status, checkHealth]);

  // ── AppState foreground → anında recheck ──────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active" && useAuthStore.getState().isAuthenticated) {
        void checkHealth();
      }
    });
    return () => sub.remove();
  }, [checkHealth]);
}

// ─── useDisconnectOverlay ────────────────────────────────────

/**
 * Sağlık durumuna + mevcut route'a göre modal görünürlüğünü yönetir.
 *
 * Güvenli rotalar (modal GÖSTERİLMEZ):
 *   - '/' (kök index — segments.length === 0)
 *   - 'login' veya '(auth)/login' — kullanıcı zaten auth formunda
 *
 * Bu rotalarda kullanıcı ya yeniden yönlendirilecek (logout sonrası) ya
 * da manuel olarak login ekranına gelmiş demektir; bağlantı koptu
 * modal'ı gereksizdir.
 */
function useDisconnectOverlay() {
  const router = useRouter();
  const segments = useSegments();
  const healthStatus = useBackendHealthStore((s) => s.status);
  const recordSuccess = useBackendHealthStore((s) => s.recordSuccess);
  const logout = useAuthStore((s) => s.logout);

  // Route türetme — her render'da yeniden hesaplama.
  // expo-router 56'da (auth) grubu segment[0]'da görünür, ayrıca
  // pathname grup segmentlerini filtreler. İki formu da kontrol et.
  // useSegments'in generic'i route-path şemasına bağlanır; biz sadece
  // string[] olarak değerlendiriyoruz.
  const segmentsList: string[] = Array.isArray(segments)
    ? (segments as string[])
    : [];
  const isSafeRoute =
    segmentsList[0] === "(auth)" ||
    segmentsList.includes("login") ||
    segmentsList.length === 0;

  const modalVisible = healthStatus === "down" && !isSafeRoute;

  // down → ok geçişinde arka planda siparişleri yenile.
  // Eski prev-ref mantığına gerek kalmadan, doğrudan status'a tepki verir.
  useEffect(() => {
    if (healthStatus !== "ok") return;
    const tableName = useTableStore.getState().selectedTable?.name;
    if (tableName) {
      useOrderStore
        .getState()
        .fetchOrders(tableName, { background: true })
        .catch((err) =>
          console.warn(
            "[ConnectivityGuard] recovery fetch failed:",
            err?.message,
          ),
        );
    }
  }, [healthStatus]);

  /**
   * Modal içindeki "Tekrar Dene" butonu. Token hâlâ geçerliyse
   * health'i 'ok' işaretle, geçersizse çıkış yap.
   */
  const attemptReconnect = async () => {
    const result = await validateStoredToken();
    if (result === "valid") {
      recordSuccess();
      return;
    }
    if (result === "unreachable") {
      void useBackendHealthStore.getState().checkHealth();
      return;
    }
    try {
      await logout();
    } catch (err) {
      console.warn("[ConnectivityGuard] logout error:", err);
    }
    router.replace("/(auth)/login");
  };

  /**
   * Modal içindeki "Çıkış Yap" butonu. await ile sıralı; router.replace
   * yalnızca logout başarıyla tamamlandıktan sonra çağrılır.
   */
  const onLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.warn("[ConnectivityGuard] logout error:", err);
    }
    router.replace("/(auth)/login");
  };

  return {
    visible: modalVisible,
    attemptReconnect,
    onLogout,
  };
}

// ─── Disconnect Modal ────────────────────────────────────────

function DisconnectModal({
  onRetry,
  onLogout,
}: {
  onRetry: () => void;
  onLogout: () => void;
}) {
  const language = useUIStore((s) => s.language);
  const { colors } = useTheme();

  const copy =
    language === "tr"
      ? {
          title: "Bağlantı Koptu",
          message:
            "Sunucuya bağlanılamadı.\nİnternet bağlantınızı kontrol edin.",
          retry: "Tekrar Dene",
          logout: "Çıkış Yap",
        }
      : {
          title: "Connection Lost",
          message:
            "Could not reach the server.\nPlease check your internet connection.",
          retry: "Retry",
          logout: "Log Out",
        };

  return (
    <View style={styles.backdrop} pointerEvents="box-none">
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              shadowColor: colors.foreground,
            },
          ]}
        >
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginBottom: 16 }}
          />
          <Text style={[styles.title, { color: colors.primary }]}>
            {copy.title}
          </Text>
          <Text style={[styles.message, { color: colors.mutedForeground }]}>
            {copy.message}
          </Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={onRetry}
          >
            <Text
              style={[
                styles.retryButtonText,
                { color: colors.primaryForeground },
              ]}
            >
              {copy.retry}
            </Text>
          </Pressable>
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <Text
              style={[
                styles.logoutButtonText,
                { color: colors.mutedForeground },
              ]}
            >
              {copy.logout}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Ana Bileşen ─────────────────────────────────────────────

export default function ConnectivityGuard() {
  useConnectivityMonitor();
  const { visible, attemptReconnect, onLogout } = useDisconnectOverlay();

  if (!visible) return null;

  return <DisconnectModal onRetry={attemptReconnect} onLogout={onLogout} />;
}

// ─── Stiller ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  card: {
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    width: "100%",
    alignItems: "center",
    marginBottom: 8,
  },
  retryButtonText: {
    fontWeight: "800",
    fontSize: 14,
  },
  logoutButton: {
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  logoutButtonText: {
    fontWeight: "600",
    fontSize: 13,
  },
});
