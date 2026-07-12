/**
 * Offline queue database layer.
 *
 * Now uses SQLite (expo-sqlite) for O(1) writes instead of O(n) AsyncStorage.
 * Includes migration from legacy AsyncStorage on first boot.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueuedOperation, QueueSyncStatus } from "./types";
import {
  dbPutOperation as sqlitePut,
  dbDeleteOperation as sqliteDelete,
  dbListOperations as sqliteList,
  dbGetQueueCountsAggregated as sqliteGetQueueCountsAggregated,
} from "./sqliteDb";

export async function dbGetQueueCountsAggregated() {
  await migrateFromAsyncStorage();
  return sqliteGetQueueCountsAggregated();
}

const LEGACY_STORAGE_KEY = "ramis-waiter-offline-queue-v1";
const MIGRATION_KEY = "ramis-waiter-offline-migrated-v1";

let migrationDone = false;

/**
 * Reset migration flag (for testing only).
 * @internal
 */
function _resetMigrationForTesting(): void {
  migrationDone = false;
}

void _resetMigrationForTesting;

// ─── Migration from AsyncStorage ─────────────────────────────────────────────

async function migrateFromAsyncStorage(): Promise<void> {
  if (migrationDone) return;

  try {
    const alreadyMigrated = await AsyncStorage.getItem(MIGRATION_KEY);
    if (alreadyMigrated === "true") {
      migrationDone = true;
      return;
    }

    const raw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.debug(
          `[OfflineDB] Migrating ${parsed.length} operations from AsyncStorage to SQLite`
        );
        for (const op of parsed) {
          await sqlitePut(op);
        }
        console.debug(`[OfflineDB] Migration complete`);
      }
    }

    // Mark migration as done
    await AsyncStorage.setItem(MIGRATION_KEY, "true");
    // Clean up legacy data
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    migrationDone = true;
  } catch (err) {
    console.warn("[OfflineDB] Migration failed, continuing with SQLite only:", err);
    migrationDone = true; // Don't retry on every call
  }
}

// ─── Public API (same signature as before) ───────────────────────────────────

export async function dbPutOperation(op: QueuedOperation): Promise<void> {
  await migrateFromAsyncStorage();
  await sqlitePut(op);
}

export async function dbDeleteOperation(id: string): Promise<void> {
  await migrateFromAsyncStorage();
  await sqliteDelete(id);
}

export async function dbListOperations(): Promise<QueuedOperation[]> {
  await migrateFromAsyncStorage();
  return sqliteList();
}

async function dbListByStatuses(statuses: QueueSyncStatus[]): Promise<QueuedOperation[]> {
  await migrateFromAsyncStorage();
  const { dbListByStatuses: sqliteListByStatuses } = await import("./sqliteDb");
  return sqliteListByStatuses(statuses);
}

void dbListByStatuses;
