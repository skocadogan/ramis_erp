import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useBackendHealthStore } from "../../store/useBackendHealthStore";

/** NetInfo aboneliği ile güncellenir — getCanSyncNow senkron kalır. */
let _networkOk = true;

export function getNetworkOkCached(): boolean {
  return _networkOk;
}

export function setNetworkOkCached(ok: boolean): void {
  _networkOk = ok;
}

export function getCanSyncNow(): boolean {
  const backendOk = useBackendHealthStore.getState().status === "ok";
  return backendOk && _networkOk;
}

export function useWaiterConnectivity() {
  const backendStatus = useBackendHealthStore((s) => s.status);
  const [networkOk, setNetworkOk] = useState(_networkOk);

  useEffect(() => {
    let mounted = true;
    const apply = (connected: boolean) => {
      _networkOk = connected;
      if (mounted) setNetworkOk(connected);
    };

    void NetInfo.fetch().then((state) => {
      apply(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    const unsub = NetInfo.addEventListener((state) => {
      apply(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const offlineMode = backendStatus === "down" || !networkOk;
  const canSync = backendStatus === "ok" && networkOk;

  return { backendStatus, offlineMode, canSync, networkOk };
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
