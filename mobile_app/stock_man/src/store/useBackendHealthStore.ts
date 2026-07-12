// ============================================================
// Stock Man — Backend Health Store
//
// Tracks whether the API is reachable. P5 will plug this into
// a polling loop + a "disconnected" modal. For P0 we just
// expose the state and a `checkHealth()` helper.
//
// A single in-flight promise is shared across concurrent
// callers so a busy dashboard doesn't kick off 10 /health/
// requests at once. We also apply a fail threshold (2) before
// flipping the status to "down" to avoid a brief network blip
// causing a full-screen disconnect overlay.
// ============================================================

import { create } from "zustand";
import { axiosClient } from "@/api/client";

const FAIL_THRESHOLD = 2;

type HealthStatus = "checking" | "ok" | "down";

type State = {
  status: HealthStatus;
  failCount: number;
  lastOkAt: number | null;
  checkHealth: () => Promise<boolean>;
  recordSuccess: () => void;
  setStatus: (s: HealthStatus) => void;
};

let inFlight: Promise<boolean> | null = null;

export const useBackendHealthStore = create<State>((set, get) => ({
  status: "checking",
  failCount: 0,
  lastOkAt: null,

  checkHealth: async () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const res = await axiosClient.get("/health/", { timeout: 5000 });
        if (res.data?.status === "ok") {
          set({ status: "ok", failCount: 0, lastOkAt: Date.now() });
          return true;
        }
        throw new Error("bad response");
      } catch {
        const failCount = get().failCount + 1;
        set({
          status: failCount >= FAIL_THRESHOLD ? "down" : "checking",
          failCount,
        });
        return false;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  recordSuccess: () => {
    if (get().status !== "ok") {
      set({ status: "ok", failCount: 0, lastOkAt: Date.now() });
    }
  },

  setStatus: (s) => set({ status: s }),
}));
