import { contextBridge, ipcRenderer } from "electron";

let isDev = false;
try {
  isDev = process.env.ELECTRON_IS_PACKAGED !== "1";
} catch {
  // sandboxed context, default to production
}

const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devErr = (...args: unknown[]) => { if (isDev) console.error(...args); };

// Oturum verisini sayfa yüklenmeden önce senkron enjekte et (AuthGuard / KDS kilidi için gerekli)
try {
  const sessionData = ipcRenderer.sendSync("auth:get-current-session");
  if (sessionData && sessionData.token && sessionData.user) {
    const authData = {
      state: {
        user: sessionData.user,
        token: sessionData.token,
        rememberMe: true,
      },
      version: 0,
    };
    (globalThis as { localStorage?: { setItem: (k: string, v: string) => void } }).localStorage?.setItem(
      "auth-storage",
      JSON.stringify(authData),
    );
    devLog("[KDS Electron Preload] localStorage session injected successfully.");
  }
} catch (e) {
  devErr("[KDS Electron Preload] Preload localStorage injection failed:", e);
}

contextBridge.exposeInMainWorld("electronAPI", {
  // ---------- Oturum / Giriş İşlemleri ----------
  /** Giriş yapmayı dene */
  login: (credentials: { apiUrl: string; username: string; pass: string }) =>
    ipcRenderer.invoke("auth:login", credentials),

  // ---------- Pencere Kontrolleri ----------
  quit: () => ipcRenderer.send("app:quit"),
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleKiosk: () => ipcRenderer.send("kiosk:toggle"),

  // ---------- Bildirimler ----------
  showNotification: (title: string, body: string) => {
    ipcRenderer.send("notification:show", { title, body });
  },

  // ---------- Pencere Odaklanma Olayları ----------
  onWindowFocus: (callback: () => void) => {
    ipcRenderer.on("window:focus", () => callback());
  },
  onWindowBlur: (callback: () => void) => {
    ipcRenderer.on("window:blur", () => callback());
  },
});
