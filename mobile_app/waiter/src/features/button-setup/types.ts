export const ESP_SETUP_AP_SSID = "RAMIS_BTN_SETUP";
export const ESP_SETUP_URL = "http://192.168.4.1/api/setup";

export type ButtonSetupStep =
  "confirm" | "connectAp" | "selectWifi" | "scanQr" | "submitting" | "success" | "error";

export interface ScannedWifiNetwork {
  ssid: string;
  level: number;
  secure: boolean;
}

export interface ButtonSetupPayload {
  ssid: string;
  password: string;
  ramis_ip: string;
  masa: string;
  masa_name: string;
}

export interface ButtonSetupWizardState {
  step: ButtonSetupStep;
  previousSsid: string | null;
  cachedNetworks: ScannedWifiNetwork[];
  selectedSsid: string;
  wifiPassword: string;
  masaId: string;
  tableName: string;
  errorMessage: string;
}

export const INITIAL_WIZARD_STATE: ButtonSetupWizardState = {
  step: "confirm",
  previousSsid: null,
  cachedNetworks: [],
  selectedSsid: "",
  wifiPassword: "",
  masaId: "",
  tableName: "",
  errorMessage: "",
};
