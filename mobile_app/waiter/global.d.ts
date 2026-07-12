/// <reference types="nativewind/types" />

// CSS dosyalarının side-effect import'una izin ver
declare module "*.css" {}

declare module "react-native-wifi-reborn" {
  interface WifiEntry {
    SSID: string;
    BSSID: string;
    capabilities: string;
    frequency: number;
    level: number;
    timestamp: number;
  }

  const WifiManager: {
    loadWifiList(): Promise<WifiEntry[]>;
    reScanAndLoadWifiList?(): Promise<WifiEntry[]>;
    getCurrentWifiSSID(): Promise<string>;
  };

  export default WifiManager;
}
