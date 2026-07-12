import { create } from "zustand";
import apiClient from "../api/client";

export type HealthStatus = "checking" | "ok" | "down";

interface BackendHealthState {
  status: HealthStatus;
  /** Ardışık başarısız kontrol sayısı — false-positive modal'ı önler. */
  failCount: number;
  checkHealth: () => Promise<boolean>;
  setStatus: (status: HealthStatus) => void;
}

/** Kaç ardışık başarısız kontrol sonrası "down" sayılsın. */
const FAIL_THRESHOLD = 2;
let healthCheckInFlight: Promise<boolean> | null = null;

export const useBackendHealthStore = create<BackendHealthState>((set, get) => ({
  status: "checking",
  failCount: 0,
  setStatus: (status) => set({ status, failCount: 0 }),
  checkHealth: async () => {
    if (healthCheckInFlight) return healthCheckInFlight;

    healthCheckInFlight = (async () => {
      try {
        const res = await apiClient.get("/health/", { timeout: 5000 });
        if (res.status === 200 && res.data?.status === "ok") {
          const wasDown = get().status === "down";
          set({ status: "ok", failCount: 0 });
          // Bağlantı yeniden gelince açık kalan disconnect diyaloğunu kapat
          if (wasDown) {
            const { usePosStore } = await import("./usePosStore");
            usePosStore.getState().setDisconnectModal(false);
          }
          return true;
        }
        throw new Error("Invalid response");
      } catch {
        const { status: prevStatus, failCount } = get();
        const newFailCount = failCount + 1;

        // Eşiğe ulaşıldığında ve daha önce "ok" idi ise VEYA ilk açılışta ("checking") hata aldıysak modal aç.
        // Bu sayede hem geçici ağ kopmalarında eşiği bekleriz, hem de açılışta sunucu kapalıysa hemen uyarı veririz.
        const shouldShowModal =
          (newFailCount >= FAIL_THRESHOLD && prevStatus === "ok") ||
          (newFailCount >= 1 && prevStatus === "checking");

        if (shouldShowModal) {
          set({ status: "down", failCount: newFailCount });
          const { usePosStore } = await import("./usePosStore");
          usePosStore
            .getState()
            .setDisconnectModal(
              true,
              "Sunucuya bağlanılamadı. Lütfen sunucunun açık olduğundan ve internet bağlantınızdan emin olun."
            );
          return false;
        }

        set({
          status: newFailCount >= FAIL_THRESHOLD ? "down" : prevStatus,
          failCount: newFailCount,
        });
        return false;
      } finally {
        healthCheckInFlight = null;
      }
    })();

    return healthCheckInFlight;
  },
}));
