import NetInfo from "@react-native-community/netinfo";
import { useBackendHealthStore } from "../../store/useBackendHealthStore";

export function getCanSyncNow(): boolean {
  const backendOk = useBackendHealthStore.getState().status === "ok";
  return backendOk;
}

async function getNetworkConnected(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

void getNetworkConnected;

export function useWaiterConnectivity() {
  const backendStatus = useBackendHealthStore((s) => s.status);
  const offlineMode = backendStatus === "down";
  const canSync = backendStatus === "ok";

  return { backendStatus, offlineMode, canSync };
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
