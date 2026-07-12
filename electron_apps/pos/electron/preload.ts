import { contextBridge, ipcRenderer } from "electron";

let isDev = false;
try {
  isDev = process.env.ELECTRON_IS_PACKAGED !== "1";
} catch {
  // sandboxed context, default to production
}

const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devErr = (...args: unknown[]) => { if (isDev) console.error(...args); };

// Oturum verisini sayfa yüklenmeden önce senkron enjekte et (AuthGuard / POS kilidi için gerekli)
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
    devLog("[POS Electron Preload] localStorage session injected successfully.");
  }
} catch (e) {
  devErr("[POS Electron Preload] Preload localStorage injection failed:", e);
}

contextBridge.exposeInMainWorld("electronAPI", {
  // ---------- Oturum / Giriş İşlemleri ----------
  /** PIN Durumunu Kontrol Et */
  checkPin: (data: { apiUrl: string; username: string }) =>
    ipcRenderer.invoke("auth:check-pin", data),

  /** Giriş yapmayı dene (Parola veya PIN ile) */
  login: (credentials: { apiUrl: string; username: string; pass?: string; pin?: string }) =>
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

// Notify main process when terminal selection changes (event-driven, no polling)
const globalAny = globalThis as typeof globalThis & {
  localStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
  window?: {
    addEventListener: (type: string, listener: (event: { key: string | null }) => void) => void;
  };
};

function notifyTerminalSelection(): void {
  try {
    const storage = globalAny.localStorage;
    if (!storage) return;

    const posPrefsRaw = storage.getItem("pos_prefs");
    const authStorageRaw = storage.getItem("auth-storage");
    if (!posPrefsRaw || !authStorageRaw) return;

    const posPrefs = JSON.parse(posPrefsRaw) as { terminalId?: string };
    const authStorage = JSON.parse(authStorageRaw) as {
      state?: { user?: { branch_id?: string; branch?: string }; token?: string };
    };
    const terminalId = posPrefs.terminalId;
    const branchId = authStorage.state?.user?.branch_id || authStorage.state?.user?.branch;
    const token = authStorage.state?.token;
    if (terminalId && branchId && token) {
      ipcRenderer.send("pos:terminal-selected", { terminalId, branchId, token });
    }
  } catch {
    // Ignore when window/localStorage is not ready
  }
}

if (typeof globalAny.window !== "undefined" && globalAny.localStorage) {
  const storage = globalAny.localStorage;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = function (key: string, value: string) {
    originalSetItem(key, value);
    if (key === "pos_prefs" || key === "auth-storage") {
      notifyTerminalSelection();
    }
  };

  globalAny.window.addEventListener("storage", (event) => {
    if (event.key === "pos_prefs" || event.key === "auth-storage") {
      notifyTerminalSelection();
    }
  });

  globalAny.window.addEventListener("DOMContentLoaded", () => {
    notifyTerminalSelection();
  });

  // React/Zustand sayfa bağlamında localStorage yazdığı için hook her zaman tetiklenmez;
  // periyodik kontrol müşteri ekranının güvenilir açılması için gerekli.
  setInterval(() => {
    notifyTerminalSelection();
  }, 1000);
}

ipcRenderer.on("pos:check-terminal-selection", () => {
  notifyTerminalSelection();
});

devLog("[POS Electron Preload] Terminal selection listener registered.");
