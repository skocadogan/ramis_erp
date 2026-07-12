import { Platform, PermissionsAndroid } from "react-native";
import WifiManager from "react-native-wifi-reborn";
import { ESP_SETUP_AP_SSID, type ScannedWifiNetwork } from "./types";

const DEFAULT_SCAN_TIMEOUT_MS = 8000;
const CACHED_SCAN_TIMEOUT_MS = 5000;

interface RawWifiEntry {
  SSID?: string;
  ssid?: string;
  level?: number;
  capabilities?: string;
}

export interface ScanWifiOptions {
  /** true ise önce önbellek, ardından kısa süreli yeniden tarama dener */
  forceRescan?: boolean;
  timeoutMs?: number;
}

function normalizeSsid(raw: string): string {
  return raw.replace(/^"(.*)"$/, "$1").trim();
}

function isSecure(capabilities?: string): boolean {
  if (!capabilities) return true;
  const open =
    capabilities.includes("[ESS]") &&
    !capabilities.includes("WPA") &&
    !capabilities.includes("WEP") &&
    !capabilities.includes("PSK");
  return !open;
}

function parseWifiEntries(rawList: RawWifiEntry[]): ScannedWifiNetwork[] {
  const bySsid = new Map<string, ScannedWifiNetwork>();

  for (const entry of rawList) {
    const ssid = normalizeSsid(entry.SSID || entry.ssid || "");
    if (!ssid || ssid === ESP_SETUP_AP_SSID || ssid === "<unknown ssid>") {
      continue;
    }

    const level = typeof entry.level === "number" ? entry.level : -100;
    const secure = isSecure(entry.capabilities);
    const existing = bySsid.get(ssid);

    if (!existing || level > existing.level) {
      bySsid.set(ssid, { ssid, level, secure });
    }
  }

  return Array.from(bySsid.values()).sort((a, b) => b.level - a.level);
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorCode: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorCode)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  const fineGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  if (!fineGranted) {
    const fineResult = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Konum izni",
        message: "Yakındaki WiFi ağlarını listelemek için konum izni gereklidir.",
        buttonPositive: "İzin ver",
        buttonNegative: "İptal",
      }
    );
    if (fineResult !== PermissionsAndroid.RESULTS.GRANTED) {
      return false;
    }
  }

  if (Platform.Version >= 33) {
    const nearbyPermission =
      PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES ??
      "android.permission.NEARBY_WIFI_DEVICES";
    const nearbyGranted = await PermissionsAndroid.check(nearbyPermission);
    if (!nearbyGranted) {
      const nearbyResult = await PermissionsAndroid.request(nearbyPermission, {
        title: "Yakındaki cihazlar",
        message: "WiFi ağlarını taramak için yakındaki cihaz izni gereklidir.",
        buttonPositive: "İzin ver",
        buttonNegative: "İptal",
      });
      if (nearbyResult !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }
    }
  }

  return true;
}

async function loadCachedWifiList(timeoutMs: number): Promise<RawWifiEntry[]> {
  return withTimeout(
    WifiManager.loadWifiList() as Promise<RawWifiEntry[]>,
    timeoutMs,
    "scan_timeout"
  );
}

async function loadRawWifiList(forceRescan: boolean, timeoutMs: number): Promise<RawWifiEntry[]> {
  const cachedTimeout = Math.min(timeoutMs, CACHED_SCAN_TIMEOUT_MS);

  try {
    const cached = await loadCachedWifiList(cachedTimeout);
    if (!forceRescan || cached.length > 0) {
      return cached;
    }
  } catch {
    if (!forceRescan) {
      throw new Error("scan_timeout");
    }
  }

  if (forceRescan && typeof WifiManager.reScanAndLoadWifiList === "function") {
    try {
      return await withTimeout(
        WifiManager.reScanAndLoadWifiList() as Promise<RawWifiEntry[]>,
        timeoutMs,
        "scan_timeout"
      );
    } catch {
      return loadCachedWifiList(cachedTimeout);
    }
  }

  return loadCachedWifiList(cachedTimeout);
}

export async function scanWifiNetworks(
  options: ScanWifiOptions | boolean = {}
): Promise<ScannedWifiNetwork[]> {
  const normalized: ScanWifiOptions =
    typeof options === "boolean" ? { forceRescan: options } : options;
  const forceRescan = normalized.forceRescan ?? false;
  const timeoutMs = normalized.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;

  if (Platform.OS === "android") {
    const granted = await withTimeout(
      ensureLocationPermission(),
      Math.min(timeoutMs, 5000),
      "permission_timeout"
    ).catch(() => false);
    if (!granted) {
      throw new Error("location_denied");
    }
  }

  const rawList = await loadRawWifiList(forceRescan, timeoutMs);
  return parseWifiEntries(rawList);
}

export function mergeWifiNetworks(
  cached: ScannedWifiNetwork[],
  live: ScannedWifiNetwork[],
  suggestedSsid?: string | null
): ScannedWifiNetwork[] {
  const bySsid = new Map<string, ScannedWifiNetwork>();

  for (const network of [...cached, ...live]) {
    const existing = bySsid.get(network.ssid);
    if (!existing || network.level > existing.level) {
      bySsid.set(network.ssid, network);
    }
  }

  if (suggestedSsid && suggestedSsid !== ESP_SETUP_AP_SSID && !bySsid.has(suggestedSsid)) {
    bySsid.set(suggestedSsid, {
      ssid: suggestedSsid,
      level: -55,
      secure: true,
    });
  }

  return Array.from(bySsid.values()).sort((a, b) => b.level - a.level);
}
