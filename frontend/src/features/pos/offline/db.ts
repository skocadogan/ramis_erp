import type { QueuedOperation } from "./types";

const DB_NAME = "ramis-pos-offline-v1";
const DB_VERSION = 1;
const STORE = "operations";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      dbPromise = null;
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("by_status", "status", { unique: false });
        store.createIndex("by_created", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("IndexedDB open failed"));
    };
  });
  return dbPromise;
}

function txMode(mode: IDBTransactionMode) {
  return openDb().then(
    (db) =>
      new Promise<{ store: IDBObjectStore; done: Promise<void> }>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE, mode);
          const store = tx.objectStore(STORE);
          const done = new Promise<void>((res, rej) => {
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error ?? new Error("IndexedDB tx failed"));
            tx.onabort = () => rej(tx.error ?? new Error("IndexedDB tx aborted"));
          });
          resolve({ store, done });
        } catch (e) {
          // Bağlantı kapanmış olabilir — bir kez yeniden aç
          dbPromise = null;
          reject(e);
        }
      })
  ).catch(async () => {
    dbPromise = null;
    const db = await openDb();
    return new Promise<{ store: IDBObjectStore; done: Promise<void> }>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const done = new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error ?? new Error("IndexedDB tx failed"));
        tx.onabort = () => rej(tx.error ?? new Error("IndexedDB tx aborted"));
      });
      resolve({ store, done });
    });
  });
}

export async function dbPutOperation(op: QueuedOperation): Promise<void> {
  const { store, done } = await txMode("readwrite");
  store.put(op);
  await done;
}

export async function dbDeleteOperation(id: string): Promise<void> {
  const { store, done } = await txMode("readwrite");
  store.delete(id);
  await done;
}

export async function dbListOperations(): Promise<QueuedOperation[]> {
  const { store, done } = await txMode("readonly");
  const req = store.getAll();
  const rows = await new Promise<QueuedOperation[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as QueuedOperation[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  await done;
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}
