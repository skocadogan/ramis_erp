// ============================================================
// Stock Man — Offline queue SQLite layer (P5)
//
// Single shared `SQLiteDatabase` instance for the offline mutation
// queue. Uses expo-sqlite v11+ async API (`openDatabaseAsync`,
// `execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`).
//
// Schema is intentionally tiny — we only need O(1) writes so
// AsyncStorage would bottleneck under heavy load. The `dbInstance`
// is module-scoped and process-singleton; all callers must go
// through `withDb()` to share the connection safely on Android.
//
// On boot, `migrate()` runs `CREATE TABLE IF NOT EXISTS` so the
// schema is fully self-healing — no separate migration table is
// needed for P5 (we only have one table).
// ============================================================

import * as SQLite from "expo-sqlite";

const DB_NAME = "stockman-offline.db";
const DB_OPEN_OPTIONS: SQLite.SQLiteOpenOptions = { useNewConnection: false };

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initInFlight: Promise<SQLite.SQLiteDatabase> | null = null;
let opQueue: Promise<unknown> = Promise.resolve();

const MAX_DB_INIT_RETRIES = 3;
const DB_INIT_RETRY_DELAY_MS = 1000;

/** Android'de eşzamanlı prepareAsync NPE'sini önlemek için sorguları sıraya alır. */
function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = opQueue.then(fn, fn);
  opQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function safeCloseDb(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    await db.closeAsync();
  } catch {
    // Kapatma hatası yeniden denemeyi engellemesin.
  }
}

/** Returns the singleton database, opening + migrating on first call. */
async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  if (initInFlight) return initInFlight;

  initInFlight = _openDatabaseWithRetry();

  try {
    const db = await initInFlight;
    dbInstance = db;
    return db;
  } catch (err) {
    initInFlight = null;
    throw err;
  }
}

/**
 * Tek giriş noktası: bağlantıyı açar ve sorguyu Android'de güvenli
 * biçimde sıraya alarak çalıştırır.
 */
export async function withDb<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  return runSerialized(async () => {
    const db = await getDb();
    return fn(db);
  });
}

/**
 * Ensure database is initialized. Call once at app startup.
 * Safe — errors are caught so app startup is not blocked.
 */
export async function initDatabase(): Promise<void> {
  try {
    await getDb();
  } catch (err) {
    console.warn("[OfflineDB] Database init failed — offline queue unavailable:", err);
  }
}

async function _openDatabaseWithRetry(): Promise<SQLite.SQLiteDatabase> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_DB_INIT_RETRIES; attempt++) {
    let db: SQLite.SQLiteDatabase | null = null;
    try {
      db = await SQLite.openDatabaseAsync(DB_NAME, DB_OPEN_OPTIONS);
      await migrate(db);
      return db;
    } catch (err) {
      lastErr = err;
      if (db) {
        await safeCloseDb(db);
      }
      console.warn(
        `[OfflineDB] Failed to open database (attempt ${attempt}/${MAX_DB_INIT_RETRIES}):`,
        err
      );
      if (attempt < MAX_DB_INIT_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, DB_INIT_RETRY_DELAY_MS * attempt)
        );
      }
    }
  }
  throw lastErr;
}

/**
 * Apply the offline-queue schema. Idempotent — safe to call on
 * every cold start. We keep this in one place so the column list
 * stays in sync with the TypeScript model in `types.ts`.
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS pending_mutations (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      payload TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      feature TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE INDEX IF NOT EXISTS idx_pm_status_created ON pending_mutations(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_pm_feature ON pending_mutations(feature);
  `);
}

/**
 * For tests / "clear all data" actions. Closes the singleton and
 * forgets the reference so the next call to `getDb()` re-opens
 * a fresh database. Callers are responsible for also calling
 * `offlineQueue.clear()` if they want rows gone.
 * @internal
 */
export function _resetDbForTesting(): void {
  dbInstance = null;
  initInFlight = null;
  opQueue = Promise.resolve();
}
