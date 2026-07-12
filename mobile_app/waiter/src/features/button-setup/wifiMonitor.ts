import { Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import WifiManager from "react-native-wifi-reborn";
import { ESP_SETUP_AP_SSID } from "./types";
import { ensureLocationPermission } from "./wifiScanner";

const ESP_PORTAL_URL = "http://192.168.4.1/";
const ESP_PORTAL_PROBE_MS = 4000;
const SSID_LOOKUP_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function normalizeSsid(raw: string): string {
  return raw.replace(/^"(.*)"$/, "$1").trim();
}

function readNetInfoSsid(details: { ssid?: string | null } | null | undefined): string | null {
  const ssid = details?.ssid;
  if (!ssid || ssid === "<unknown ssid>") {
    return null;
  }
  return ssid;
}

async function getWifiManagerSsid(): Promise<string | null> {
  if (Platform.OS !== "android") {
    return null;
  }

  try {
    const granted = await withTimeout(ensureLocationPermission(), SSID_LOOKUP_TIMEOUT_MS);
    if (!granted) {
      return null;
    }
    const ssid = await withTimeout(
      WifiManager.getCurrentWifiSSID() as Promise<string>,
      SSID_LOOKUP_TIMEOUT_MS
    );
    if (!ssid) {
      return null;
    }
    const normalized = normalizeSsid(String(ssid));
    return normalized || null;
  } catch {
    return null;
  }
}

async function getNetInfoIp(): Promise<string | null> {
  const state = await NetInfo.fetch();
  if (state.type !== "wifi") {
    return null;
  }
  const ip = (state.details as { ipAddress?: string | null } | null)?.ipAddress;
  return ip && ip !== "0.0.0.0" ? ip : null;
}

function isSetupApIp(ip: string | null | undefined): boolean {
  return !!ip && ip.startsWith("192.168.4.");
}

async function probeSetupPortal(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ESP_PORTAL_PROBE_MS);
    const response = await fetch(ESP_PORTAL_URL, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

export async function getCurrentWifiSsid(): Promise<string | null> {
  const fromManager = await getWifiManagerSsid();
  if (fromManager) {
    return fromManager;
  }

  const state = await withTimeout(NetInfo.fetch(), SSID_LOOKUP_TIMEOUT_MS);
  if (!state || state.type !== "wifi") {
    return null;
  }

  return readNetInfoSsid(state.details as { ssid?: string | null } | null);
}

export async function isConnectedToSetupAp(): Promise<boolean> {
  const managerSsid = await getWifiManagerSsid();
  if (managerSsid === ESP_SETUP_AP_SSID) {
    return true;
  }

  const state = await NetInfo.fetch();
  const netInfoSsid = readNetInfoSsid(state.details as { ssid?: string | null } | null);
  if (netInfoSsid === ESP_SETUP_AP_SSID) {
    return true;
  }

  const ip = (state.details as { ipAddress?: string | null } | null)?.ipAddress;
  if (isSetupApIp(ip)) {
    return true;
  }

  // SSID gizlense bile ESP portalına erişim en güvenilir doğrulama.
  return probeSetupPortal();
}

export function subscribeSetupApConnection(onConnected: () => void): () => void {
  let cancelled = false;

  const check = async () => {
    if (cancelled) return;
    const connected = await isConnectedToSetupAp();
    if (!cancelled && connected) {
      onConnected();
    }
  };

  void check();

  const unsub = NetInfo.addEventListener(() => {
    void check();
  });

  const interval = setInterval(() => {
    void check();
  }, 2000);

  return () => {
    cancelled = true;
    unsub();
    clearInterval(interval);
  };
}

/** @deprecated subscribeSetupApConnection kullanın */
function subscribeWifiSsid(onSsidChange: (ssid: string | null) => void): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.type !== "wifi") {
      onSsidChange(null);
      return;
    }
    onSsidChange(readNetInfoSsid(state.details as { ssid?: string | null } | null));
  });
}

async function getDeviceIpOnWifi(): Promise<string | null> {
  return getNetInfoIp();
}

void subscribeWifiSsid;
void getDeviceIpOnWifi;
