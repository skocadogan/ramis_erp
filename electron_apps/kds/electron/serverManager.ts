import { spawn, type ChildProcess } from "child_process";
import path from "path";
import net from "net";
import fs from "fs";
import fsPromises from "fs/promises";
import { app } from "electron";
import { getServerDir } from "./constants";
import { log, error, warn } from "./logger";

export interface ServerInfo {
  port: number;
  process: ChildProcess;
}

export type ServerCrashHandler = (code: number | null) => void;

let crashHandler: ServerCrashHandler | null = null;

export function setServerCrashHandler(handler: ServerCrashHandler | null): void {
  crashHandler = handler;
}

/** Finds a random free port allocated by the OS */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "string" ? 0 : address?.port ?? 0;
      server.close(() => {
        resolve(port);
      });
    });
    server.on("error", (err) => {
      reject(err);
    });
  });
}

/** Packaged apps use Electron's embedded Node runtime instead of system node */
function getNodeExecutable(): string {
  return app.isPackaged ? process.execPath : "node";
}

/** Next.js standalone `.next/BUILD_ID` — frontend rebuild ile değişir, package version aynı kalsa bile. */
function readNextBuildId(serverDir: string): string | null {
  try {
    const buildIdPath = path.join(serverDir, ".next", "BUILD_ID");
    if (!fs.existsSync(buildIdPath)) {
      return null;
    }
    const id = fs.readFileSync(buildIdPath, "utf-8").trim();
    return id || null;
  } catch {
    return null;
  }
}

/** `appVersion:nextBuildId` — sürüm sabit kalsa bile yeni AppImage frontend'i userData'ya yenilenir. */
function buildServerStamp(appVersion: string, buildId: string | null): string {
  return `${appVersion}:${buildId ?? "missing"}`;
}

async function ensureServerCopied(
  sourceDir: string,
  targetDir: string,
  currentVersion: string,
): Promise<void> {
  const versionFile = path.join(targetDir, ".version");
  const serverScript = path.join(targetDir, "server.js");
  const sourceBuildId = readNextBuildId(sourceDir);
  const desiredStamp = buildServerStamp(currentVersion, sourceBuildId);

  let shouldCopy = false;
  if (!fs.existsSync(targetDir) || !fs.existsSync(versionFile) || !fs.existsSync(serverScript)) {
    shouldCopy = true;
  } else {
    const installedStamp = fs.readFileSync(versionFile, "utf-8").trim();
    if (installedStamp !== desiredStamp) {
      shouldCopy = true;
      log(
        `[Next.js Server] Cache güncellenecek (kurulu=${installedStamp}, beklenen=${desiredStamp}).`,
      );
    }
  }

  if (!shouldCopy) {
    return;
  }

  log("[Next.js Server] Standalone sunucu dosyaları kopyalanıyor...");
  const stagingDir = `${targetDir}.staging`;

  try {
    await fsPromises.rm(stagingDir, { recursive: true, force: true });
    await fsPromises.mkdir(stagingDir, { recursive: true });
    await fsPromises.cp(sourceDir, stagingDir, { recursive: true });

    const prodModules = path.join(stagingDir, "node_modules_prod");
    const targetModules = path.join(stagingDir, "node_modules");
    if (fs.existsSync(prodModules)) {
      await fsPromises.rename(prodModules, targetModules);
    }

    await fsPromises.writeFile(path.join(stagingDir, ".version"), desiredStamp, "utf-8");

    await fsPromises.rm(targetDir, { recursive: true, force: true });
    await fsPromises.rename(stagingDir, targetDir);
    log(`[Next.js Server] Kopyalama tamamlandı (stamp=${desiredStamp}).`);
  } catch (err) {
    await fsPromises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    error("[Next.js Server] Kopyalama hatası:", err);
    throw new Error(
      `Next.js sunucu dosyaları kopyalanamadı: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Dev modunda ESM çözümlemesi için node_modules_prod -> node_modules symlink */
function ensureDevNodeModules(serverDir: string): void {
  if (app.isPackaged) {
    return;
  }

  const prodModules = path.join(serverDir, "node_modules_prod");
  const nodeModules = path.join(serverDir, "node_modules");
  if (!fs.existsSync(prodModules)) {
    return;
  }

  try {
    if (fs.existsSync(nodeModules)) {
      return;
    }
    fs.symlinkSync(prodModules, nodeModules, "dir");
    log("[Next.js Server] Dev symlink oluşturuldu: node_modules -> node_modules_prod");
  } catch (err) {
    warn("[Next.js Server] node_modules symlink oluşturulamadı:", err);
  }
}

/**
 * Next.js standalone sunucuyu child process olarak başlatır.
 */
export async function startNextServer(apiUrl: string): Promise<ServerInfo> {
  const port = await getFreePort();
  let serverDir = getServerDir();

  if (app.isPackaged) {
    const sourceDir = serverDir;
    const targetDir = path.join(app.getPath("userData"), "next-server");
    await ensureServerCopied(sourceDir, targetDir, app.getVersion());
    serverDir = targetDir;
  }

  ensureDevNodeModules(serverDir);

  const serverScript = path.join(serverDir, "server.js");
  if (!fs.existsSync(serverScript)) {
    throw new Error(`Next.js sunucu betiği bulunamadı: ${serverScript}`);
  }

  const baseApi = apiUrl.replace(/\/$/, "");
  const apiBaseUrl = `${baseApi}/api/v1`;
  const runtimeConfigPath = path.join(app.getPath("userData"), "runtime-config.json");
  try {
    const configData = {
      apiBaseUrl: apiBaseUrl,
      posOfflineQueue: true,
      apiInterceptorToasts: false,
    };
    fs.writeFileSync(runtimeConfigPath, JSON.stringify(configData, null, 2), "utf-8");
    log(`[Next.js Server] Runtime config file created at: ${runtimeConfigPath} with apiBaseUrl: ${apiBaseUrl}`);
  } catch (err) {
    error("[Next.js Server] Failed to create runtime config file:", err);
  }

  return new Promise((resolve, reject) => {
    let nodePath = process.env.NODE_PATH || "";
    if (!app.isPackaged) {
      const devModules = path.join(serverDir, "node_modules_prod");
      nodePath = nodePath ? `${devModules}${path.delimiter}${nodePath}` : devModules;
    }

    const spawnEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(port),
      NEXT_PUBLIC_API_URL: apiUrl,
      RAMIS_RUNTIME_CONFIG_PATH: runtimeConfigPath,
      NODE_ENV: process.env.NODE_ENV ?? "production",
      ...(nodePath ? { NODE_PATH: nodePath } : {}),
    };

    if (app.isPackaged) {
      spawnEnv.ELECTRON_RUN_AS_NODE = "1";
    }

    const nodeExec = getNodeExecutable();
    log(`[Next.js Server] Başlatılıyor: Node=${nodeExec}, Script=${serverScript}, Dir=${serverDir}, Port=${port}, API_URL=${apiUrl}`);

    const child = spawn(nodeExec, [serverScript], {
      cwd: serverDir,
      env: spawnEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      shell: false,
    });

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        reject(new Error("Next.js standalone sunucusu 30 saniye içinde yanıt vermedi."));
      }
    }, 30_000);

    const onData = (data: Buffer) => {
      const text = data.toString();
      log(`[Next.js stdout] ${text.trim()}`);

      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ port, process: child });
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", (data) => {
      error(`[Next.js stderr] ${data.toString().trim()}`);
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Next.js sunucusu beklenmedik şekilde sonlandı (exit code: ${code})`));
      } else if (code !== 0 && code !== null) {
        error(`[Next.js Server] Sunucu çalışırken sonlandı (exit code: ${code})`);
        crashHandler?.(code);
      }
    });
  });
}

/**
 * Next.js sunucusunu durdurur.
 */
export function stopNextServer(serverInfo: ServerInfo): void {
  if (serverInfo.process && !serverInfo.process.killed) {
    serverInfo.process.kill("SIGTERM");
    setTimeout(() => {
      if (!serverInfo.process.killed) {
        serverInfo.process.kill("SIGKILL");
      }
    }, 5000);
  }
}
