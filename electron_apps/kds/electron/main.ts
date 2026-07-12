import { app, BrowserWindow, ipcMain, globalShortcut, Notification, session, screen } from "electron";
process.env.ELECTRON_IS_PACKAGED = app.isPackaged ? "1" : "0";
import path from "path";
import fs from "fs";
import { startNextServer, stopNextServer, setServerCrashHandler, type ServerInfo } from "./serverManager";
import {
  APP_NAME,
  KDS_BASE_PATH,
  KDS_REQUIRED_PERMISSION,
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
} from "./constants";
import { createTray, destroyTray } from "./tray";
import { enterKioskMode, exitKioskMode, isKioskMode } from "./kiosk";
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
let currentLocale: string | undefined;

let logoutMonitorRegistered = false;

// Config file path to store credentials
const configPath = path.join(app.getPath("userData"), "config.json");

interface UserCredentials {
  apiUrl: string;
  username: string;
  pass: string;
  locale?: string;
}

const LOG_OUT_CLI_FLAG = "--log-out";

function isLogOutRequested(argv: string[] = process.argv): boolean {
  return argv.includes(LOG_OUT_CLI_FLAG);
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
  pass: string,
  locale?: string,
): Promise<{ success: boolean; token?: string; user?: any; error?: string; errorCode?: string }> {
  try {
    // Normalize API URL: trailing slashes removed
    const baseApi = apiUrl.replace(/\/$/, "");
    const tokenUrl = `${baseApi}/api/v1/auth/token/`;
    log(`[Auth Validation] İstek atılıyor: ${tokenUrl}`);

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: pass, remember_me: true }),
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

    if (!userHasPermission(user, KDS_REQUIRED_PERMISSION)) {
      log(`[Auth Validation] ${username} kullanıcısında ${KDS_REQUIRED_PERMISSION} izni yok.`);
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
    title: "Ramis KDS",
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

function ensureLogoutMonitoring(): void {
  if (logoutMonitorRegistered) {
    return;
  }
  logoutMonitorRegistered = true;

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["*://*/api/v1/auth/logout/"] },
    (_details, callback) => {
      log("[Logout Monitor] Çıkış isteği yakalandı, kimlik bilgileri siliniyor...");
      handleLogout();
      callback({ cancel: false });
    },
  );
}

function setupLogoutMonitoring(_port: number): void {
  ensureLogoutMonitoring();
}

function teardownLogoutMonitoring(): void {
  // Single global handler; nothing to detach
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
    error("[KDS Electron] Renderer process gone:", details.reason);
    if (!win.isDestroyed()) {
      win.reload();
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    error("[KDS Electron] Sayfa yüklenemedi:", errorCode, errorDescription, validatedURL);
  });
}

async function handleServerCrash(code: number | null): Promise<void> {
  error(`[KDS Electron] Next.js sunucusu çöktü (exit code: ${code})`);
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
    setupLogoutMonitoring(serverInfo.port);
    const url = `http://localhost:${serverInfo.port}${KDS_BASE_PATH}`;
    await mainWindow.loadURL(url);
    await mainWindow.webContents.executeJavaScript(
      buildAuthInjectionScript(user, token, "KDS Electron", KDS_BASE_PATH),
    );
    await mainWindow.webContents.executeJavaScript(`
      document.documentElement.setAttribute('data-theme', 'dark');
    `);
  } catch (err) {
    error("[KDS Electron] Sunucu yeniden başlatılamadı:", err);
    handleLogout();
  }
}

setServerCrashHandler((code) => {
  void handleServerCrash(code);
});

/** Handle user logout */
function handleLogout() {
  clearCredentials();
  activeSession = null;
  currentLocale = undefined;

  globalShortcut.unregisterAll();
  destroyTray();
  teardownLogoutMonitoring();
  
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  
  if (serverInfo) {
    stopNextServer(serverInfo);
    serverInfo = null;
  }

  showLoginWindow();
}

/** CLI --log-out: oturumu kapat, pencere açmadan uygulamayı sonlandır */
function forceLogOutAndExit(): void {
  clearCredentials();
  activeSession = null;
  currentLocale = undefined;

  globalShortcut.unregisterAll();
  destroyTray();
  teardownLogoutMonitoring();

  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.destroy();
    loginWindow = null;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }

  if (serverInfo) {
    stopNextServer(serverInfo);
    serverInfo = null;
  }

  app.quit();
}

// Single instance lock
const logOutRequested = isLogOutRequested();
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  if (logOutRequested) {
    clearCredentials();
    log("[CLI] --log-out: Kimlik bilgileri silindi.");
  }
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (isLogOutRequested(commandLine)) {
      log("[CLI] --log-out: Çalışan uygulama oturumu kapatılıyor.");
      forceLogOutAndExit();
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (loginWindow) {
      if (loginWindow.isMinimized()) loginWindow.restore();
      loginWindow.focus();
    }
  });
}

function attachChildWindowHandler(win: BrowserWindow, port: number): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (
        parsed.hostname === "localhost" &&
        parseInt(parsed.port, 10) === port &&
        isKdsRoute(url, port)
      ) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: {
              preload: path.join(__dirname, "preload.js"),
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: false,
              webSecurity: false,
            },
          },
        };
      }
    } catch {
      /* geçersiz URL */
    }
    warn(`[KDS Electron] Pop-up engellendi: ${url}`);
    return { action: "deny" };
  });
}

/** Launch KDS View in Main Window */
async function launchKdsWindow(apiUrl: string, token: string, user: any, locale?: string) {
  activeSession = { token, user, apiUrl };
  currentLocale = locale;
  // Start the local Next.js Standalone server
  try {
    serverInfo = await startNextServer(apiUrl);
    log(`[KDS Electron] Next.js sunucu port ${serverInfo.port} üzerinde başladı`);
  } catch (err) {
    error("[KDS Electron] Sunucu başlatılamadı:", err);
    app.quit();
    return;
  }

  // Close Login Window if open
  if (loginWindow) {
    loginWindow.close();
    loginWindow = null;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;
  log("width:"+ width + " height:" + height);




  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    kiosk:true,
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
  attachChildWindowHandler(mainWindow, serverInfo.port);

   // Setup monitor for logout url
  setupLogoutMonitoring(serverInfo.port);

  // Set session cookie before loading URL
  try {
    await session.defaultSession.cookies.set({
      url: `http://localhost:${serverInfo.port}`,
      name: "ramis_auth",
      value: "1",
      path: "/",
      expirationDate: Math.floor(Date.now() / 1000) + 2592000
    });
    log("[KDS Electron] Session cookie 'ramis_auth=1' set successfully.");
  } catch (cookieErr) {
    error("[KDS Electron] Cookie set error:", cookieErr);
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
    log(`[KDS Electron] NEXT_LOCALE cookie '${effectiveLocale}' set successfully.`);
  } catch (localeCookieErr) {
    error("[KDS Electron] NEXT_LOCALE cookie set error:", localeCookieErr);
  }

  // Monitor navigation: login → logout; diğer yetkisiz sayfalar → KDS'ye dön
  mainWindow.webContents.on("did-navigate", (_event, url) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes("/login")) {
      log(`[Logout Monitor] Login sayfasına yönlendirme algılandı: ${url}`);
      handleLogout();
      return;
    }
    if (serverInfo && parsed.hostname === "localhost" && parseInt(parsed.port, 10) === serverInfo.port) {
      if (!isKdsRoute(url, serverInfo.port)) {
        warn(`[Security Monitor] Yetkisiz sayfa algılandı, KDS'ye dönülüyor: ${url}`);
        redirectToAppHome(mainWindow!, serverInfo.port, KDS_BASE_PATH);
      }
    }
  });

  // Enforce KDS-only route restriction on hard navigation
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isKdsRoute(navigationUrl, serverInfo!.port)) {
      warn(`[Security Monitor] Yetkisiz dış gezinti engellendi: ${navigationUrl}`);
      event.preventDefault();
      redirectToAppHome(mainWindow!, serverInfo!.port, KDS_BASE_PATH);
    }
  });

  // Enforce KDS-only route restriction on client-side router navigation
  mainWindow.webContents.on("did-navigate-in-page", (_event, navigationUrl) => {
    if (!isKdsRoute(navigationUrl, serverInfo!.port)) {
      warn(`[Security Monitor] Sayfa içi yetkisiz gezinti engellendi. KDS'ye geri dönülüyor: ${navigationUrl}`);
      redirectToAppHome(mainWindow!, serverInfo!.port, KDS_BASE_PATH);
    }
  });



  // Load KDS page
  const url = `http://localhost:${serverInfo.port}${KDS_BASE_PATH}`;
  log(`[KDS Electron] Yükleniyor: ${url}`);
  await mainWindow.loadURL(url);

  // Inject session cookie & Zustand state
  await mainWindow.webContents.executeJavaScript(
    buildAuthInjectionScript(user, token, "KDS Electron", KDS_BASE_PATH),
  );

  // Force dark theme as recommended for kitchen display screens
  await mainWindow.webContents.executeJavaScript(`
    document.documentElement.setAttribute('data-theme', 'dark');
  `);

  // Window Focus/Blur triggers
  mainWindow.on("focus", () => {
    mainWindow?.webContents.send("window:focus");
  });

  mainWindow.on("blur", () => {
    mainWindow?.webContents.send("window:blur");
  });

  // Prevent escape from full screen
  (mainWindow as any).on("leave-full-screen", (event: any) => {
    if (isKioskMode()) {
      event.preventDefault();
      mainWindow?.setFullScreen(true);
    }
  });

  createTray(mainWindow);
  registerKioskShortcuts();
}

app.whenReady().then(async () => {
  if (logOutRequested) {
    log("[CLI] --log-out parametresi algılandı. Oturum kapatılıyor...");
    forceLogOutAndExit();
    return;
  }

  // Check if credentials exist for auto-login
  const creds = loadCredentials();
  if (creds) {
    log(`[Auto-login] Kayıtlı kimlik bilgileri bulundu (${creds.username}). Doğrulanıyor...`);
    const validation = await validateLogin(creds.apiUrl, creds.username, creds.pass, creds.locale);
    if (validation.success && validation.token && validation.user) {
      log("[Auto-login] Doğrulama başarılı! KDS açılıyor...");
      await launchKdsWindow(creds.apiUrl, validation.token, validation.user, creds.locale);
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
  error("[KDS Electron] Uygulama başlatılamadı:", err);
  app.quit();
});

// IPC Handler for Login request from loginWindow
ipcMain.handle("auth:login", async (_event, credentials: UserCredentials) => {
  log(`[Auth IPC] Giriş talebi alındı: URL=${credentials.apiUrl}, User=${credentials.username}`);
  const result = await validateLogin(credentials.apiUrl, credentials.username, credentials.pass, credentials.locale);
  if (result.success && result.token && result.user) {
    // Save credentials for next run
    saveCredentials(credentials);
    // Launch KDS Window
    await launchKdsWindow(credentials.apiUrl, result.token, result.user, credentials.locale);
    return { success: true };
  } else {
    return { success: false, error: result.error, errorCode: result.errorCode };
  }
});

// IPC Handler to return current session details synchronously to preload script
ipcMain.on("auth:get-current-session", (event) => {
  event.returnValue = activeSession;
});

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
  const title = payload?.title ?? "Ramis KDS";
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
 * Validates if the target local URL is a valid KDS path.
 * Only KDS routes and static assets are allowed on localhost.
 */
function isKdsRoute(urlStr: string, port: number): boolean {
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

    // Regex to match locale prefixed or raw KDS routes
    // Example: /kds, /tr/kds, /en/kds/station-display/3
    const kdsRegex = /^\/([a-z]{2}\/)?kds(\/.*)?$/;
    return kdsRegex.test(pathname);
  } catch {
    return false;
  }
}
