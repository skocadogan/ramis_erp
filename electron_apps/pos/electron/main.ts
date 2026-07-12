import { app, BrowserWindow, ipcMain, globalShortcut, Notification, session, screen } from "electron";
process.env.ELECTRON_IS_PACKAGED = app.isPackaged ? "1" : "0";
import path from "path";
import fs from "fs";

// Force scale factor to 1 to prevent Linux high-DPI scaling from causing UI cutoffs
app.commandLine.appendSwitch("force-device-scale-factor", "1");

import { startNextServer, stopNextServer, setServerCrashHandler, type ServerInfo } from "./serverManager";
import {
  APP_NAME,
  POS_BASE_PATH,
  POS_REQUIRED_PERMISSION,
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
} from "./constants";
import { createTray, destroyTray } from "./tray";
import { enterKioskMode, exitKioskMode, isKioskMode, markKioskActive } from "./kiosk";
import {
  boundsForDisplay,
  getDisplayForWindow,
  getSecondaryDisplay,
  logAllDisplays,
  showWindowOnDisplay,
} from "./displays";
import type { Display } from "electron";
import { log, error, warn } from "./logger";
import { permissionDeniedMessage } from "./messages";

process.on("uncaughtException", (err) => {
  error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  error("Unhandled Rejection at:", promise, "reason:", reason);
});

let mainWindow: BrowserWindow | null = null;
let loginWindow: BrowserWindow | null = null;
let serverInfo: ServerInfo | null = null;
let activeSession: { token: string; user: any; apiUrl: string } | null = null;

let displayWindow: BrowserWindow | null = null;
let customerDisplayTarget: Display | null = null;
let currentTerminalId: string | null = null;
let currentBranchId: string | null = null;
let currentLocale: string | undefined;

let requestMonitorApiUrl: string | null = null;
let requestMonitorRegistered = false;

// Config file path to store credentials
const configPath = path.join(app.getPath("userData"), "config.json");

interface UserCredentials {
  apiUrl: string;
  username: string;
  pass?: string;
  pin?: string;
  locale?: string;
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (loginWindow) {
      if (loginWindow.isMinimized()) loginWindow.restore();
      loginWindow.focus();
    }
  });
}

/** Read credentials from local config.json */
function loadCredentials(): UserCredentials | null {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(data) as UserCredentials;
    }
  } catch (err) {
    error("Config okuma hatası:", err);
  }
  return null;
}

/** Save credentials to local config.json */
function saveCredentials(creds: UserCredentials): void {
  try {
    fs.writeFileSync(configPath, JSON.stringify(creds, null, 2), "utf-8");
  } catch (err) {
    error("Config yazma hatası:", err);
  }
}

interface AuthUser {
  is_superuser?: boolean;
  permissions?: string[];
}

function userHasPermission(user: AuthUser, permission: string): boolean {
  if (user.is_superuser) {
    return true;
  }
  return (user.permissions ?? []).includes(permission);
}

/** Delete credentials config.json */
function clearCredentials(): void {
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      log("Config dosyası silindi (logout).");
    }
  } catch (err) {
    error("Config silme hatası:", err);
  }
}

/** Validate credentials against Django Backend API */
async function validateLogin(
  apiUrl: string,
  username: string,
  pass?: string,
  pin?: string,
  locale?: string,
): Promise<{ success: boolean; token?: string; user?: any; error?: string; errorCode?: string }> {
  try {
    const baseApi = apiUrl.replace(/\/$/, "");
    const tokenUrl = pin 
      ? `${baseApi}/api/v1/auth/token/pin/`
      : `${baseApi}/api/v1/auth/token/`;
    log(`[Auth Validation] İstek atılıyor: ${tokenUrl}`);

    const payload = pin 
      ? { username, pin, remember_me: true }
      : { username, password: pass, remember_me: true };

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as any;
      return { success: false, error: errData.detail || errData.error || "Geçersiz kullanıcı adı veya şifre." };
    }

    const tokenData = await res.json() as { access: string; refresh: string };
    
    // Fetch full user profile
    const meRes = await fetch(`${baseApi}/api/v1/auth/me/`, {
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenData.access}` 
      }
    });

    if (!meRes.ok) {
      return { success: false, error: "Kullanıcı profili alınamadı." };
    }

    const userData = (await meRes.json()) as any;

    const user = {
      id: userData.id,
      username: userData.username,
      first_name: userData.first_name,
      last_name: userData.last_name,
      branch_id: userData.branch,
      branch_name: userData.branch_name,
      available_branches: userData.available_branches,
      is_superuser: userData.is_superuser,
      permissions: userData.all_permissions || [],
    };

    if (!userHasPermission(user, POS_REQUIRED_PERMISSION)) {
      log(`[Auth Validation] ${username} kullanıcısında ${POS_REQUIRED_PERMISSION} izni yok.`);
      return {
        success: false,
        errorCode: "permission_denied",
        error: permissionDeniedMessage(locale),
      };
    }

    return {
      success: true,
      token: tokenData.access,
      user,
    };
  } catch (err: any) {
    error("[Auth Validation] Hata:", err);
    return { success: false, error: `Sunucuya bağlanılamadı: ${err.message}` };
  }
}

let pendingLoginErrorCode: string | null = null;

/** Show the custom login form window */
function showLoginWindow() {
  if (loginWindow) {
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 460,
    height: 720,
    resizable: false,
    autoHideMenuBar: true,
    title: "Ramis POS — Giriş Yap",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loginWindow.loadFile(path.join(__dirname, "login.html"));

  loginWindow.webContents.on("did-finish-load", () => {
    const creds = loadCredentials();
    const locale = creds?.locale || DEFAULT_LOCALE;
    const errorCode = pendingLoginErrorCode;
    pendingLoginErrorCode = null;
    loginWindow?.webContents.executeJavaScript(
      `setLocale(${JSON.stringify(locale)});` +
        (errorCode ? `showLoginError(${JSON.stringify(errorCode)});` : ""),
    );
  });

  loginWindow.on("closed", () => {
    loginWindow = null;
  });
}

/** Single webRequest handler; port/apiUrl updated per session */
function ensureRequestMonitoring(): void {
  if (requestMonitorRegistered) {
    return;
  }
  requestMonitorRegistered = true;

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["*://localhost:*/*", "*://127.0.0.1:*/*", "*://*/media/*", "*://*/_next/image*", "*://*/api/v1/auth/logout/"] },
    (details, callback) => {
      const urlStr = details.url;

      if (urlStr.includes("/api/v1/auth/logout/")) {
        log("[Request Monitor] Çıkış isteği yakalandı, kimlik bilgileri siliniyor...");
        setTimeout(() => {
          handleLogout();
        }, 10);
        callback({ cancel: false });
        return;
      }

      const baseApi = requestMonitorApiUrl?.replace(/\/$/, "") ?? "";
      if (!baseApi) {
        callback({ cancel: false });
        return;
      }

      try {
        const parsed = new URL(urlStr);

        if (parsed.pathname.startsWith("/media/")) {
          const redirectTarget = `${baseApi}${parsed.pathname}${parsed.search}`;
          if (urlStr === redirectTarget) {
            callback({ cancel: false });
            return;
          }
          log(`[Request Monitor] Doğrudan medya yönlendirmesi: ${urlStr} -> ${redirectTarget}`);
          callback({ redirectURL: redirectTarget });
          return;
        }

        if (parsed.pathname === "/_next/image") {
          const imageUrl = parsed.searchParams.get("url");
          if (imageUrl && imageUrl.startsWith("/media/")) {
            const redirectTarget = `${baseApi}${imageUrl}`;
            if (urlStr === redirectTarget) {
              callback({ cancel: false });
              return;
            }
            log(`[Request Monitor] Next.js medya yönlendirmesi: ${urlStr} -> ${redirectTarget}`);
            callback({ redirectURL: redirectTarget });
            return;
          }
        }
      } catch {
        // Parse error
      }

      callback({ cancel: false });
    },
  );
}

function setupRequestMonitoring(_port: number, apiUrl: string): void {
  ensureRequestMonitoring();
  requestMonitorApiUrl = apiUrl;
}

function teardownRequestMonitoring(): void {
  requestMonitorApiUrl = null;
}

function buildAuthInjectionScript(user: unknown, token: string, label: string, basePath: string): string {
  return `
    try {
      const authData = {
        state: {
          user: ${JSON.stringify(user)},
          token: ${JSON.stringify(token)},
          rememberMe: true
        },
        version: 0
      };
      localStorage.setItem("auth-storage", JSON.stringify(authData));
      document.cookie = "ramis_auth=1;path=/;max-age=2592000;SameSite=Lax";
      ${!app.isPackaged ? `console.log("[${label}] Kimlik bilgileri başarıyla sayfaya enjekte edildi.");` : ""}
      const routeSegment = ${JSON.stringify(basePath)};
      const onAppRoute = window.location.pathname === routeSegment
        || window.location.pathname.startsWith(routeSegment + "/")
        || new RegExp("^/([a-z]{2})" + routeSegment.replace(/\\//g, "\\\\/") + "(\\\\/|$)").test(window.location.pathname);
      if (!onAppRoute) {
        window.location.replace(routeSegment);
      }
    } catch(e) {
      ${!app.isPackaged ? `console.error("[${label}] Enjeksiyon hatası:", e);` : ""}
    }
  `;
}

function redirectToAppHome(win: BrowserWindow, port: number, basePath: string): void {
  win.loadURL(`http://localhost:${port}${basePath}`);
}

function attachWebContentsRecovery(win: BrowserWindow): void {
  win.webContents.on("render-process-gone", (_event, details) => {
    error("[POS Electron] Renderer process gone:", details.reason);
    if (!win.isDestroyed()) {
      win.reload();
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    error("[POS Electron] Sayfa yüklenemedi:", errorCode, errorDescription, validatedURL);
  });
}

async function handleServerCrash(code: number | null): Promise<void> {
  error(`[POS Electron] Next.js sunucusu çöktü (exit code: ${code})`);
  if (!activeSession || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const { apiUrl, token, user } = activeSession;
  if (serverInfo) {
    stopNextServer(serverInfo);
    serverInfo = null;
  }

  try {
    serverInfo = await startNextServer(apiUrl);
    setupRequestMonitoring(serverInfo.port, apiUrl);
    const url = `http://localhost:${serverInfo.port}${POS_BASE_PATH}`;
    await mainWindow.loadURL(url);
    await mainWindow.webContents.executeJavaScript(
      buildAuthInjectionScript(user, token, "POS Electron", POS_BASE_PATH),
    );
  } catch (err) {
    error("[POS Electron] Sunucu yeniden başlatılamadı:", err);
    handleLogout();
  }
}

setServerCrashHandler((code) => {
  void handleServerCrash(code);
});

function closeCustomerDisplay(): void {
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.destroy();
  }
  displayWindow = null;
  customerDisplayTarget = null;
  currentTerminalId = null;
  currentBranchId = null;
}

/** Handle user logout */
function handleLogout() {
  clearCredentials();
  activeSession = null;
  currentLocale = undefined;

  globalShortcut.unregisterAll();
  destroyTray();
  teardownRequestMonitoring();
  
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }

  closeCustomerDisplay();
  
  if (serverInfo) {
    stopNextServer(serverInfo);
    serverInfo = null;
  }

  showLoginWindow();
}

/** Launch POS View in Main Window */
async function launchPOSWindow(apiUrl: string, token: string, user: any, locale?: string) {
  activeSession = { token, user, apiUrl };
  currentLocale = locale;
  // Start the local Next.js Standalone server
  try {
    serverInfo = await startNextServer(apiUrl);
    log(`[POS Electron] Next.js sunucu port ${serverInfo.port} üzerinde başladı`);
  } catch (err) {
    error("[POS Electron] Sunucu başlatılamadı:", err);
    app.quit();
    return;
  }

  // Close Login Window if open
  if (loginWindow) {
    loginWindow.close();
    loginWindow = null;
  }

  logAllDisplays("POS Electron");
  const primaryDisplay = screen.getPrimaryDisplay();
  const primaryBounds = boundsForDisplay(primaryDisplay);

  mainWindow = new BrowserWindow({
    ...primaryBounds,
    kiosk: true,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  // Birincil monitörde tam ekran: oluşturucuda kiosk + maximize (Linux'ta setFullScreen sonradan yetersiz kalıyor)
  mainWindow.maximize();
  markKioskActive();

  attachWebContentsRecovery(mainWindow);

  // Setup monitor for logout and media url proxying
  setupRequestMonitoring(serverInfo.port, apiUrl);

  // Set session cookie before loading URL
  try {
    await session.defaultSession.cookies.set({
      url: `http://localhost:${serverInfo.port}`,
      name: "ramis_auth",
      value: "1",
      path: "/",
      expirationDate: Math.floor(Date.now() / 1000) + 2592000
    });
    log("[POS Electron] Session cookie 'ramis_auth=1' set successfully.");
  } catch (cookieErr) {
    error("[POS Electron] Cookie set error:", cookieErr);
  }

  // Set locale cookie for next-intl
  const effectiveLocale = locale || DEFAULT_LOCALE;
  try {
    await session.defaultSession.cookies.set({
      url: `http://localhost:${serverInfo.port}`,
      name: LOCALE_COOKIE_NAME,
      value: effectiveLocale,
      path: "/",
      expirationDate: Math.floor(Date.now() / 1000) + 2592000
    });
    log(`[POS Electron] NEXT_LOCALE cookie '${effectiveLocale}' set successfully.`);
  } catch (localeCookieErr) {
    error("[POS Electron] NEXT_LOCALE cookie set error:", localeCookieErr);
  }

  // Monitor navigation: login → logout; diğer yetkisiz sayfalar → POS'a dön
  mainWindow.webContents.on("did-navigate", (_event, url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes("/login")) {
      log(`[Logout Monitor] Login sayfasına yönlendirme algılandı: ${url}`);
      handleLogout();
      return;
    }
    if (serverInfo && parsed.hostname === "localhost" && parseInt(parsed.port, 10) === serverInfo.port) {
      if (!isPosRoute(url, serverInfo.port)) {
        warn(`[Security Monitor] Yetkisiz sayfa algılandı, POS'a dönülüyor: ${url}`);
        redirectToAppHome(mainWindow!, serverInfo.port, POS_BASE_PATH);
      }
    }
  });

  // Enforce POS-only route restriction on hard navigation
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isPosRoute(navigationUrl, serverInfo!.port)) {
      warn(`[Security Monitor] Yetkisiz dış gezinti engellendi: ${navigationUrl}`);
      event.preventDefault();
      redirectToAppHome(mainWindow!, serverInfo!.port, POS_BASE_PATH);
    }
  });

  // Enforce POS-only route restriction on client-side router navigation
  mainWindow.webContents.on("did-navigate-in-page", (_event, navigationUrl) => {
    if (!isPosRoute(navigationUrl, serverInfo!.port)) {
      warn(`[Security Monitor] Sayfa içi yetkisiz gezinti engellendi. POS'a geri dönülüyor: ${navigationUrl}`);
      redirectToAppHome(mainWindow!, serverInfo!.port, POS_BASE_PATH);
    }
  });



  // Load POS page
  const url = `http://localhost:${serverInfo.port}${POS_BASE_PATH}`;
  log(`[POS Electron] Yükleniyor: ${url}`);
  await mainWindow.loadURL(url);

  // Inject session cookie & Zustand state
  await mainWindow.webContents.executeJavaScript(
    buildAuthInjectionScript(user, token, "POS Electron", POS_BASE_PATH),
  );

  mainWindow.focus();

  // Oturum enjekte edildikten sonra müşteri ekranı terminal seçimini kontrol et
  mainWindow.webContents.send("pos:check-terminal-selection");

  // Window Focus/Blur triggers
  mainWindow.on("focus", () => {
    mainWindow?.webContents.send("window:focus");
  });

  mainWindow.on("blur", () => {
    mainWindow?.webContents.send("window:blur");
  });

  mainWindow.on("close", () => {
    closeCustomerDisplay();
  });

  // Prevent escape from full screen
  (mainWindow as any).on("leave-full-screen", (event: any) => {
    if (isKioskMode()) {
      event.preventDefault();
      mainWindow?.setKiosk(true);
    }
  });

  createTray(mainWindow);
  registerKioskShortcuts();
}

app.whenReady().then(async () => {
  logAllDisplays("POS Startup");

  // Check if credentials exist for auto-login
  const creds = loadCredentials();
  if (creds) {
    log(`[Auto-login] Kayıtlı kimlik bilgileri bulundu (${creds.username}). Doğrulanıyor...`);
    const validation = await validateLogin(
      creds.apiUrl,
      creds.username,
      creds.pass,
      creds.pin,
      creds.locale,
    );
    if (validation.success && validation.token && validation.user) {
      log("[Auto-login] Doğrulama başarılı! POS açılıyor...");
      await launchPOSWindow(creds.apiUrl, validation.token, validation.user, creds.locale);
      return;
    } else {
      log(`[Auto-login] Doğrulama başarısız: ${validation.error}. Giriş ekranı açılıyor.`);
      if (validation.errorCode === "permission_denied") {
        pendingLoginErrorCode = "permission_denied";
      }
    }
  }

  // Show login form if auto-login is not possible
  showLoginWindow();
}).catch((err) => {
  error("[POS Electron] Uygulama başlatılamadı:", err);
  app.quit();
});

// IPC Handler for Login request from loginWindow
ipcMain.handle("auth:login", async (_event, credentials: UserCredentials) => {
  log(`[Auth IPC] Giriş talebi alındı: URL=${credentials.apiUrl}, User=${credentials.username}`);
  const result = await validateLogin(
    credentials.apiUrl,
    credentials.username,
    credentials.pass,
    credentials.pin,
    credentials.locale,
  );
  if (result.success && result.token && result.user) {
    saveCredentials(credentials);
    await launchPOSWindow(credentials.apiUrl, result.token, result.user, credentials.locale);
    return { success: true };
  } else {
    return { success: false, error: result.error, errorCode: result.errorCode };
  }
});

// IPC Handler to check if cashier has a PIN assigned
ipcMain.handle("auth:check-pin", async (_event, { apiUrl, username }) => {
  try {
    const baseApi = apiUrl.replace(/\/$/, "");
    const res = await fetch(`${baseApi}/api/v1/auth/check-pin/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    error("Check PIN error:", err);
  }
  return { has_pin: false, has_cashier_role: false };
});

// IPC Handler to return current session details synchronously to preload script
ipcMain.on("auth:get-current-session", (event) => {
  event.returnValue = activeSession;
});

// IPC Handler for terminal selection changes to update secondary screen
ipcMain.on("pos:terminal-selected", (_event, payload) => {
  void (async () => {
    try {
      const { terminalId, branchId, token } = payload ?? {};
      if (!terminalId || !branchId || !token || !serverInfo) {
        return;
      }
      if (currentTerminalId === terminalId && currentBranchId === branchId && displayWindow) {
        return;
      }
      currentTerminalId = terminalId;
      currentBranchId = branchId;
      await updateCustomerDisplay(terminalId, branchId, token);
    } catch (err) {
      error("[POS Display] Terminal seçimi işlenirken hata:", err);
    }
  })();
});

/** Create the Customer Display window on the secondary monitor if available */
function createDisplayWindow(): Display | null {
  if (displayWindow && customerDisplayTarget) {
    return customerDisplayTarget;
  }

  logAllDisplays("POS Display");

  const posDisplayId =
    mainWindow && !mainWindow.isDestroyed()
      ? getDisplayForWindow(mainWindow).id
      : screen.getPrimaryDisplay().id;

  const secondaryDisplay = getSecondaryDisplay(posDisplayId);
  if (!secondaryDisplay) {
    log("[POS Display] Tek monitör algılandı, müşteri ekranı oluşturulmuyor.");
    return null;
  }

  const secondaryBounds = boundsForDisplay(secondaryDisplay);
  log(
    `[POS Display] Müşteri ekranı monitörü: id=${secondaryDisplay.id} ` +
      `bounds=${JSON.stringify(secondaryBounds)} (POS displayId=${posDisplayId})`,
  );

  displayWindow = new BrowserWindow({
    ...secondaryBounds,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false,
    },
  });

  customerDisplayTarget = secondaryDisplay;

  displayWindow.on("closed", () => {
    displayWindow = null;
    customerDisplayTarget = null;
  });

  return secondaryDisplay;
}

/** Fetch display token and update customer display URL */
async function updateCustomerDisplay(terminalId: string, branchId: string, token: string) {
  const displays = screen.getAllDisplays();
  if (displays.length < 2) {
    return;
  }

  try {
    const baseApi = activeSession?.apiUrl || "";
    const tokenUrl = `${baseApi.replace(/\/$/, "")}/api/v1/pos-display/ws-subscribe-token/?terminal_id=${encodeURIComponent(terminalId)}&branch_id=${encodeURIComponent(branchId)}`;
    log(`[POS Display] Token alınıyor: ${tokenUrl}`);

    const res = await fetch(tokenUrl, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      error("[POS Display] Token alınamadı:", res.statusText);
      return;
    }

    const data = await res.json() as { display_token: string };
    const displayToken = data.display_token;

    // e.g. /pos/display/kasa-01?terminal=kasa-01&t=token&branch_id=uuid
    const port = serverInfo?.port;
    if (!port) {
      return;
    }

    const displayUrl = `http://localhost:${port}/pos/display/${encodeURIComponent(terminalId)}?terminal=${encodeURIComponent(terminalId)}&t=${encodeURIComponent(displayToken)}&branch_id=${encodeURIComponent(branchId)}`;

    const targetDisplay = createDisplayWindow();
    if (displayWindow && targetDisplay) {
      log(`[POS Display] Müşteri ekranı yükleniyor: ${displayUrl}`);
      await displayWindow.loadURL(displayUrl);
      showWindowOnDisplay(displayWindow, targetDisplay, "fullscreen");
    }
  } catch (err) {
    error("[POS Display] Müşteri ekranı güncellenirken hata:", err);
  }
}

// IPC Window controls
ipcMain.on("app:quit", () => {
  app.quit();
});

ipcMain.on("window:minimize", () => {
  const win = BrowserWindow.getFocusedWindow();
  win?.minimize();
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

ipcMain.on("notification:show", (_event, payload) => {
  const title = payload?.title ?? "Ramis POS";
  const body = payload?.body ?? "";
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body, silent: true });
    notif.show();
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
  closeCustomerDisplay();
  if (serverInfo) {
    stopNextServer(serverInfo);
    serverInfo = null;
  }
  globalShortcut.unregisterAll();
});

function registerKioskShortcuts() {
  globalShortcut.unregisterAll();

  // Ctrl+Shift+K → kiosk toggle
  globalShortcut.register("CommandOrControl+Shift+K", () => {
    if (mainWindow) {
      if (isKioskMode()) {
        exitKioskMode(mainWindow);
      } else {
        enterKioskMode(mainWindow);
      }
    }
  });

  // Ctrl+Shift+Q → Force exit
  globalShortcut.register("CommandOrControl+Shift+Q", () => {
    app.quit();
  });

  // Ctrl+Shift+D → Toggle DevTools (development only)
  if (!app.isPackaged) {
    globalShortcut.register("CommandOrControl+Shift+D", () => {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }
}

/**
 * Validates if the target local URL is a valid POS path.
 * Only POS routes and static assets are allowed on localhost.
 */
function isPosRoute(urlStr: string, port: number): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname !== "localhost" || parseInt(parsed.port, 10) !== port) {
      return true; // Allow API/External resource requests
    }

    const pathname = parsed.pathname;

    // Allow Next.js static, public assets, and runtime configurations
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

    // Regex to match locale prefixed or raw POS routes
    // Example: /pos, /tr/pos, /en/pos/display/3
    const posRegex = /^\/([a-z]{2}\/)?pos(\/.*)?$/;
    return posRegex.test(pathname);
  } catch {
    return false;
  }
}
