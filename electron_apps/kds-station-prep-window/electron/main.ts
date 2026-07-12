import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  session,
  screen,
} from "electron";
process.env.ELECTRON_IS_PACKAGED = app.isPackaged ? "1" : "0";
import path from "path";
import fs from "fs";
import {
  startNextServer,
  stopNextServer,
  setServerCrashHandler,
  validatePrepDisplayApi,
  toApiBaseUrl,
  type ServerInfo,
} from "./serverManager";
import {
  APP_NAME,
  PREP_WINDOW_BASE_PATH,
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  RESET_SETUP_CLI_FLAG,
} from "./constants";
import { createTray, destroyTray } from "./tray";
import { enterKioskMode, exitKioskMode, isKioskMode } from "./kiosk";
import { log, error, warn } from "./logger";

process.on("uncaughtException", (err) => {
  error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  error("Unhandled Rejection at:", promise, "reason:", reason);
});

interface PrepWindowStation {
  id: string;
  name: string;
  color: string;
  branch: string;
  branch_name: string;
}

interface PrepWindowConfig {
  apiUrl: string;
  locale?: string;
  displayToken?: string;
  branchId?: string;
  stationId?: string;
  station?: PrepWindowStation;
}

let mainWindow: BrowserWindow | null = null;
let setupWindow: BrowserWindow | null = null;
let serverInfo: ServerInfo | null = null;
let activeConfig: PrepWindowConfig | null = null;

const configPath = path.join(app.getPath("userData"), "config.json");

function loadConfig(): PrepWindowConfig | null {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8")) as PrepWindowConfig;
    }
  } catch (err) {
    error("Config okuma hatası:", err);
  }
  return null;
}

function saveConfig(config: PrepWindowConfig): void {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    activeConfig = config;
  } catch (err) {
    error("Config yazma hatası:", err);
  }
}

function clearSessionFields(config: PrepWindowConfig): PrepWindowConfig {
  const next = { ...config };
  delete next.displayToken;
  delete next.branchId;
  delete next.stationId;
  delete next.station;
  return next;
}

/** config.json ve runtime-config.json dahil tüm yerel yapılandırmayı siler. */
function clearAllConfig(): void {
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      log("Config dosyası silindi.");
    }
  } catch (err) {
    error("Config silme hatası:", err);
  }

  const runtimeConfigPath = path.join(app.getPath("userData"), "runtime-config.json");
  try {
    if (fs.existsSync(runtimeConfigPath)) {
      fs.unlinkSync(runtimeConfigPath);
      log("Runtime config dosyası silindi.");
    }
  } catch (err) {
    error("Runtime config silme hatası:", err);
  }

  activeConfig = null;
}

function isResetSetupRequested(argv: string[] = process.argv): boolean {
  return argv.includes(RESET_SETUP_CLI_FLAG);
}

function showSetupWindow(existingApiUrl?: string): void {
  if (setupWindow) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    autoHideMenuBar: true,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  setupWindow.loadFile(path.join(__dirname, "setup.html"));

  setupWindow.webContents.on("did-finish-load", () => {
    if (existingApiUrl) {
      setupWindow?.webContents.executeJavaScript(
        `document.getElementById("apiUrl").value = ${JSON.stringify(existingApiUrl)};`,
      );
    }
  });

  setupWindow.on("closed", () => {
    setupWindow = null;
    if (!mainWindow && !setupWindow) {
      app.quit();
    }
  });
}

function redirectToAppHome(win: BrowserWindow, port: number): void {
  win.loadURL(`http://localhost:${port}${PREP_WINDOW_BASE_PATH}`);
}

function attachWebContentsRecovery(win: BrowserWindow): void {
  win.webContents.on("render-process-gone", (_event, details) => {
    error("[Prep Window] Renderer process gone:", details.reason);
    if (!win.isDestroyed()) {
      win.reload();
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    error("[Prep Window] Sayfa yüklenemedi:", errorCode, errorDescription, validatedURL);
  });
}

function isPrepWindowRoute(urlStr: string, port: number): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname !== "localhost" || parseInt(parsed.port, 10) !== port) {
      return true;
    }

    const pathname = parsed.pathname;
    if (
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/static/") ||
      pathname.startsWith("/public/") ||
      pathname.startsWith("/sounds/") ||
      pathname.startsWith("/ramis/runtime-config") ||
      pathname === "/favicon.ico"
    ) {
      return true;
    }

    const prepRegex = /^\/([a-z]{2}\/)?kds\/prep-window(\/.*)?$/;
    return prepRegex.test(pathname);
  } catch {
    return false;
  }
}

async function handleServerCrash(code: number | null): Promise<void> {
  error(`[Prep Window] Next.js sunucusu çöktü (exit code: ${code})`);
  if (!activeConfig?.apiUrl || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (serverInfo) {
    stopNextServer(serverInfo);
    serverInfo = null;
  }

  try {
    serverInfo = await startNextServer(activeConfig.apiUrl);
    await mainWindow.loadURL(`http://localhost:${serverInfo.port}${PREP_WINDOW_BASE_PATH}`);
    await mainWindow.webContents.executeJavaScript(`
      document.documentElement.setAttribute('data-theme', 'dark');
    `);
  } catch (err) {
    error("[Prep Window] Sunucu yeniden başlatılamadı:", err);
    app.quit();
  }
}

setServerCrashHandler((code) => {
  void handleServerCrash(code);
});

async function launchPrepWindow(config: PrepWindowConfig): Promise<void> {
  activeConfig = config;

  try {
    serverInfo = await startNextServer(config.apiUrl);
    log(`[Prep Window] Next.js sunucu port ${serverInfo.port} üzerinde başladı`);
  } catch (err) {
    error("[Prep Window] Sunucu başlatılamadı:", err);
    app.quit();
    return;
  }

  if (setupWindow) {
    setupWindow.close();
    setupWindow = null;
  }

  const { width, height } = screen.getPrimaryDisplay().bounds;

  mainWindow = new BrowserWindow({
    width,
    height,
    kiosk: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  mainWindow.maximize();
  attachWebContentsRecovery(mainWindow);

  const locale = config.locale || DEFAULT_LOCALE;
  try {
    await session.defaultSession.cookies.set({
      url: `http://localhost:${serverInfo.port}`,
      name: LOCALE_COOKIE_NAME,
      value: locale,
      path: "/",
      expirationDate: Math.floor(Date.now() / 1000) + 2592000,
    });
  } catch (localeCookieErr) {
    error("[Prep Window] NEXT_LOCALE cookie hatası:", localeCookieErr);
  }

  mainWindow.webContents.on("did-navigate", (_event, url) => {
    if (!serverInfo) return;
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" && parseInt(parsed.port, 10) === serverInfo.port) {
      if (!isPrepWindowRoute(url, serverInfo.port)) {
        warn(`[Security] Yetkisiz sayfa, prep-window'a dönülüyor: ${url}`);
        redirectToAppHome(mainWindow!, serverInfo.port);
      }
    }
  });

  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!serverInfo) return;
    if (!isPrepWindowRoute(navigationUrl, serverInfo.port)) {
      warn(`[Security] Dış gezinti engellendi: ${navigationUrl}`);
      event.preventDefault();
      redirectToAppHome(mainWindow!, serverInfo.port);
    }
  });

  mainWindow.webContents.on("did-navigate-in-page", (_event, navigationUrl) => {
    if (!serverInfo) return;
    if (!isPrepWindowRoute(navigationUrl, serverInfo.port)) {
      warn(`[Security] Sayfa içi yetkisiz gezinti engellendi: ${navigationUrl}`);
      redirectToAppHome(mainWindow!, serverInfo.port);
    }
  });

  const url = `http://localhost:${serverInfo.port}${PREP_WINDOW_BASE_PATH}`;
  log(`[Prep Window] Yükleniyor: ${url}`);
  await mainWindow.loadURL(url);

  await mainWindow.webContents.executeJavaScript(`
    document.documentElement.setAttribute('data-theme', 'dark');
  `);

  (mainWindow as any).on("leave-full-screen", (event: any) => {
    if (isKioskMode()) {
      event.preventDefault();
      mainWindow?.setFullScreen(true);
    }
  });

  createTray(mainWindow);
  registerShortcuts();
}

function resetSetupAndRelaunch(): void {
  clearAllConfig();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }

  if (serverInfo) {
    stopNextServer(serverInfo);
    serverInfo = null;
  }

  destroyTray();
  globalShortcut.unregisterAll();

  showSetupWindow();
}

const resetSetupRequested = isResetSetupRequested();
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  if (resetSetupRequested) {
    clearAllConfig();
    log("[CLI] --reset-setup: Tüm konfigürasyon silindi.");
  }
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (isResetSetupRequested(commandLine)) {
      log("[CLI] --reset-setup: Tüm konfigürasyon sıfırlanıyor.");
      resetSetupAndRelaunch();
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (setupWindow) {
      if (setupWindow.isMinimized()) setupWindow.restore();
      setupWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  if (resetSetupRequested) {
    log("[CLI] --reset-setup parametresi algılandı. Tüm konfigürasyon siliniyor.");
    resetSetupAndRelaunch();
    return;
  }

  const config = loadConfig();
  if (config?.apiUrl) {
    await launchPrepWindow(config);
    return;
  }

  showSetupWindow();
}).catch((err) => {
  error("[Prep Window] Uygulama başlatılamadı:", err);
  app.quit();
});

ipcMain.handle("prep-window:save-api-url", async (_event, payload: { apiUrl: string; locale?: string }) => {
  const rawUrl = (payload.apiUrl || "").trim();
  if (!rawUrl) {
    return { success: false, error: "API adresi gerekli." };
  }

  const validation = await validatePrepDisplayApi(rawUrl);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const config: PrepWindowConfig = {
    apiUrl: validation.apiOrigin,
    locale: payload.locale || DEFAULT_LOCALE,
  };
  saveConfig(config);
  await launchPrepWindow(config);
  return { success: true };
});

ipcMain.on("prep-window:get-api-base-url", (event) => {
  const config = loadConfig();
  event.returnValue = config?.apiUrl ? toApiBaseUrl(config.apiUrl) : null;
});

ipcMain.handle("prep-window:get-config", () => {
  const config = loadConfig();
  if (!config?.displayToken || !config.branchId || !config.stationId || !config.station) {
    return null;
  }
  return {
    displayToken: config.displayToken,
    branchId: config.branchId,
    stationId: config.stationId,
    station: config.station,
  };
});

ipcMain.on("prep-window:get-session", (event) => {
  const config = loadConfig();
  if (!config?.displayToken || !config.branchId || !config.stationId || !config.station) {
    event.returnValue = null;
    return;
  }
  event.returnValue = {
    displayToken: config.displayToken,
    branchId: config.branchId,
    stationId: config.stationId,
    station: config.station,
  };
});

ipcMain.handle(
  "prep-window:save-config",
  (_event, session: {
    displayToken: string;
    branchId: string;
    stationId: string;
    station: PrepWindowStation;
  }) => {
    const current = loadConfig();
    if (!current?.apiUrl) {
      return { success: false };
    }
    saveConfig({
      ...current,
      displayToken: session.displayToken,
      branchId: session.branchId,
      stationId: session.stationId,
      station: session.station,
    });
    return { success: true };
  },
);

ipcMain.handle("prep-window:reset-config", () => {
  const current = loadConfig();
  if (current) {
    saveConfig(clearSessionFields(current));
  }
  return { success: true };
});

ipcMain.on("app:quit", () => {
  app.quit();
});

ipcMain.on("kiosk:toggle", () => {
  if (mainWindow) {
    if (isKioskMode()) {
      exitKioskMode(mainWindow);
    } else {
      enterKioskMode(mainWindow);
    }
  }
});

app.on("window-all-closed", () => {
  if (serverInfo) {
    stopNextServer(serverInfo);
    serverInfo = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverInfo) {
    stopNextServer(serverInfo);
    serverInfo = null;
  }
  globalShortcut.unregisterAll();
});

function registerShortcuts() {
  globalShortcut.unregisterAll();

  globalShortcut.register("CommandOrControl+Shift+K", () => {
    if (mainWindow) {
      if (isKioskMode()) {
        exitKioskMode(mainWindow);
      } else {
        enterKioskMode(mainWindow);
      }
    }
  });

  globalShortcut.register("CommandOrControl+Shift+Q", () => {
    app.quit();
  });

  if (!app.isPackaged) {
    globalShortcut.register("CommandOrControl+Shift+D", () => {
      mainWindow?.webContents.toggleDevTools();
    });
  }
}
