import { contextBridge, ipcRenderer } from "electron";

let isDev = false;
try {
  isDev = process.env.ELECTRON_IS_PACKAGED !== "1";
} catch {
  // sandboxed context
}

const devLog = (...args: unknown[]) => {
  if (isDev) console.log(...args);
};
const devErr = (...args: unknown[]) => {
  if (isDev) console.error(...args);
};

export interface PrepWindowStation {
  id: string;
  name: string;
  color: string;
  branch: string;
  branch_name: string;
}

export interface PrepWindowSessionConfig {
  displayToken: string;
  branchId: string;
  stationId: string;
  station: PrepWindowStation;
}

try {
  const session = ipcRenderer.sendSync("prep-window:get-session") as PrepWindowSessionConfig | null;
  if (session?.displayToken) {
    localStorage.setItem("prep-window-session", JSON.stringify(session));
    devLog("[Prep Window Preload] Oturum localStorage'a yazıldı.");
  }
} catch (e) {
  devErr("[Prep Window Preload] Oturum enjeksiyonu başarısız:", e);
}

contextBridge.exposeInMainWorld("electronAPI", {
  getApiBaseUrl: () => ipcRenderer.sendSync("prep-window:get-api-base-url") as string | null,
  getPrepWindowConfig: () => ipcRenderer.invoke("prep-window:get-config"),
  savePrepWindowConfig: (session: PrepWindowSessionConfig) =>
    ipcRenderer.invoke("prep-window:save-config", session),
  resetPrepWindowConfig: () => ipcRenderer.invoke("prep-window:reset-config"),
  saveApiUrl: (payload: { apiUrl: string; locale?: string }) =>
    ipcRenderer.invoke("prep-window:save-api-url", payload),
  quit: () => ipcRenderer.send("app:quit"),
  toggleKiosk: () => ipcRenderer.send("kiosk:toggle"),
});
