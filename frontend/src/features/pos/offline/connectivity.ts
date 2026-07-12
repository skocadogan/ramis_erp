import { useSyncExternalStore } from "react";
import { useBackendHealth } from "@/components/shell/BackendHealthProvider";
import { getBackendHealthSnapshot } from "./healthSnapshot";

/** Health snapshot + tarayıcı `navigator.onLine` durumunu birleştirir. */
export function getCanSyncNow(): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  return getBackendHealthSnapshot() === "ok";
}

function getNavigatorOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function usePosConnectivity() {
  const { status: backendStatus } = useBackendHealth();
  const online = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("online", onStoreChange);
      window.addEventListener("offline", onStoreChange);
      return () => {
        window.removeEventListener("online", onStoreChange);
        window.removeEventListener("offline", onStoreChange);
      };
    },
    getNavigatorOnline,
    () => true
  );

  const backendReachable = backendStatus === "ok" || backendStatus === "checking";
  const offlineMode = !online || backendStatus === "down";
  const canSync = online && backendStatus === "ok";

  return { online, backendStatus, backendReachable, offlineMode, canSync };
}

export function shouldQueueMutation(offlineMode: boolean, err: unknown): boolean {
  if (offlineMode) return true;
  const e = err as { code?: string; message?: string; response?: unknown };
  if (e?.code === "ERR_NETWORK" || e?.code === "ECONNABORTED") return true;
  if (!e?.response && typeof e?.message === "string") {
    return e.message.toLowerCase().includes("network");
  }
  return false;
}
