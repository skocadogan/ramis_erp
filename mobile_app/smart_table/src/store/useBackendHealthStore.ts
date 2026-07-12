// ============================================================
// Smart Table — Backend Health Store
// Sürekli backend sağlık kontrolü: checking → ok / down
//
// Durum makinesi:
//   checking ──(2 ardışık hata, önceki: ok)──► down
//   checking ──(1 hata, önceki: checking)────► down
//   down     ──(1 başarılı yanıt)────────────► ok
//   herhangi ──(recordSuccess)──────────────► ok
//
// Aynı anda yalnızca bir istek uçabilir (healthCheckInFlight);
// bu sayede 30 sn periyotla tetiklenen polling ve AppState foreground
// recheck'i çakışmaz.
//
// `recordSuccess()` — `status: 'ok'` geçişiyle birlikte `lastOkAt`
// damgasını atomik olarak günceller. UI tüketicileri için tek
// doğruluk kaynağı.
// ============================================================

import { create } from "zustand";
import { useAuthStore } from "./auth-store";

type HealthStatus = "checking" | "ok" | "down";

interface BackendHealthState {
  status: HealthStatus;
  /** Ardışık başarısız kontrol sayısı — false-positive modal'ı önler. */
  failCount: number;
  /** Son başarılı yanıtın epoch ms cinsinden zaman damgası. */
  lastOkAt: number | null;
  /** Backend sağlık kontrolü yapar. `in-flight` çağrı varsa aynı Promise'i döner. */
  checkHealth: () => Promise<boolean>;
  /**
   * Durumu açıkça "ok" olarak işaretler ve `lastOkAt` damgasını şimdiye
   * çeker. `checkHealth`'in success dalı da bunu çağırır; UI tüketicileri
   * buraya abone olmamalı, doğrudan `status` ve `lastOkAt` okumalıdır.
   */
  recordSuccess: () => void;
  /**
   * Durumu manuel olarak ayarlamak için. `lastOkAt`'a dokunmaz; sadece
   * `down` veya `checking` gibi başarısız geçişler için kullanılır.
   */
  setStatus: (status: HealthStatus) => void;
}

const FAIL_THRESHOLD = 2;
let healthCheckInFlight: Promise<boolean> | null = null;

export const useBackendHealthStore = create<BackendHealthState>((set, get) => ({
  status: "checking",
  failCount: 0,
  lastOkAt: null,

  // `setStatus` sadece durum değişikliği için. lastOkAt'a dokunmaz —
  // bu yüzden başarı anlarında `recordSuccess` tercih edilir.
  setStatus: (status) => set({ status, failCount: 0 }),

  // Başarı anının atomik kaydı: status='ok', failCount sıfırla,
  // lastOkAt damgasını şu an olarak ayarla.
  recordSuccess: () => {
    const prev = get().status;
    // Aynı 'ok' değerini tekrar yazmak zustand abonelerini gereksiz tetikler.
    if (prev === "ok" && get().lastOkAt != null) return;
    set({ status: "ok", failCount: 0, lastOkAt: Date.now() });
  },

  checkHealth: async () => {
    if (healthCheckInFlight) return healthCheckInFlight;

    const { serverUrl, token } = useAuthStore.getState();
    if (!serverUrl || !token) {
      // Kimlik bilgisi yoksa backend ile konuşamayız — doğrudan down işaretle.
      set({ status: "down", failCount: 0 });
      return false;
    }

    healthCheckInFlight = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(`${serverUrl}/api/v1/health/`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });

          if (response.ok) {
            get().recordSuccess();
            return true;
          }
          throw new Error(`HTTP ${response.status}`);
        } finally {
          // Her durumda (throw dahil) zamanlayıcıyı temizle — aksi halde
          // 5s boyunca dangling timer kalır ve fetch reject olduğunda
          // AbortController da tetiklenmeden sızdırılmış olur.
          clearTimeout(timeout);
        }
      } catch {
        const { status: prevStatus, failCount } = get();
        const newFailCount = failCount + 1;

        // Eşiğe ulaşıldığında ve daha önce "ok" idi ise VEYA ilk açılışta
        // ("checking") hata aldıysak down işaretle. Bu sayede geçici ağ
        // kopmalarında eşiği beklerken, açılışta sunucu kapalıysa hızlı
        // geri bildirim veriyoruz.
        const shouldMarkDown =
          (newFailCount >= FAIL_THRESHOLD && prevStatus === "ok") ||
          (newFailCount >= 1 && prevStatus === "checking");

        if (shouldMarkDown) {
          set({ status: "down", failCount: newFailCount });
        } else {
          // prevStatus === 'ok' ve yeni failCount < FAIL_THRESHOLD — eski durumu
          // koru, sadece failCount'u ilerlet. Eşiğe ulaşınca üstteki branch
          // 'down' yapar.
          set({ status: prevStatus, failCount: newFailCount });
        }
        return false;
      } finally {
        healthCheckInFlight = null;
      }
    })();

    return healthCheckInFlight;
  },
}));
