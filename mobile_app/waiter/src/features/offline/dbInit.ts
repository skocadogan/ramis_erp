import * as SQLite from "expo-sqlite";

export const DB_NAME = "ramis_waiter_offline.db";
export const DB_OPEN_OPTIONS: SQLite.SQLiteOpenOptions = { useNewConnection: true };

export const MAX_DB_INIT_RETRIES = 3;
export const DB_INIT_RETRY_DELAY_MS = 1000;

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initInFlight: Promise<SQLite.SQLiteDatabase> | null = null;
let opQueue: Promise<unknown> = Promise.resolve();

export function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
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

export function _resetDatabaseForTesting(): void {
  dbInstance = null;
  initInFlight = null;
  opQueue = Promise.resolve();
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  if (initInFlight) return initInFlight;

  initInFlight = openDatabaseWithRetry();

  try {
    const db = await initInFlight;
    dbInstance = db;
    return db;
  } catch (err) {
    initInFlight = null;
    throw err;
  }
}

async function openDatabaseWithRetry(): Promise<SQLite.SQLiteDatabase> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_DB_INIT_RETRIES; attempt++) {
    let db: SQLite.SQLiteDatabase | null = null;
    try {
      db = await SQLite.openDatabaseAsync(DB_NAME, DB_OPEN_OPTIONS);

      await db.execAsync("PRAGMA journal_mode = WAL;");
      await db.execAsync("PRAGMA synchronous = NORMAL;");

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS offline_queue (
          id TEXT PRIMARY KEY NOT NULL,
          client_op_id TEXT NOT NULL,
          type TEXT NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE,
          endpoint TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          branch_id TEXT NOT NULL,
          label TEXT NOT NULL,
          meta TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_queue_status ON offline_queue(status);
        CREATE INDEX IF NOT EXISTS idx_queue_created ON offline_queue(created_at);
        CREATE INDEX IF NOT EXISTS idx_queue_branch ON offline_queue(branch_id);
      `);

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
        await new Promise((resolve) => setTimeout(resolve, DB_INIT_RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw lastErr;
}

export async function initDatabase(): Promise<void> {
  try {
    await getDatabase();
  } catch (err) {
    console.warn("[OfflineDB] Database init failed — offline queue unavailable:", err);
  }
}
