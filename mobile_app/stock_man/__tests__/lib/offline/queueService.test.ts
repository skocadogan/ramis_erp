// ============================================================
// Stock Man — Offline queue service birim testleri
// ============================================================
//
// `offlineQueue` SQLite üzerinde takılı; jest.setup.ts'in
// sağladığı trivial `jest.fn()` mock'u yetersiz olduğu için
// bu testte `expo-sqlite`'ı modül-seviyesinde yeniden mock'larız
// (in-memory tablo: basit bir Map<id, row>).
//
// NOT: jest.mock factory'si hoist edilir; dış kapsamdaki
// değişkenlere erişim kısıtlıdır. State'i `globalThis` üzerinden
// paylaşıyoruz ki factory ve testler aynı Map'i kullansın.
// ============================================================

type Row = {
  id: string;
  endpoint: string;
  method: string;
  payload: string;
  idempotency_key: string;
  feature: string;
  description: string | null;
  created_at: number;
  attempts: number;
  last_error: string | null;
  status: string;
};

interface SqliteMockState {
  table: Map<string, Row>;
  calls: { method: string; sql: string; params: any[] }[];
  reset: () => void;
}

const STATE_KEY = "__stockman_sqlite_mock__";

function getState(): SqliteMockState {
  const g = globalThis as { [STATE_KEY]?: SqliteMockState };
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      table: new Map(),
      calls: [],
      reset() {
        this.table = new Map();
        this.calls = [];
      },
    };
  }
  return g[STATE_KEY]!;
}

jest.mock("expo-sqlite", () => {
  const handle = async (sql: string, params: any[] = []) => {
    const g = globalThis as { [STATE_KEY]?: SqliteMockState };
    const state = g[STATE_KEY]!;
    state.calls.push({ method: "run", sql, params });
    const n = sql.trim().toLowerCase();

    if (n.startsWith("insert into pending_mutations")) {
      const [id, endpoint, method, payload, idempotency_key, feature, description, created_at, attempts, status] = params;
      if (state.table.has(id)) return;
      state.table.set(id, {
        id, endpoint, method, payload, idempotency_key, feature,
        description, created_at, attempts, last_error: null, status,
      });
      return;
    }

    if (n.startsWith("update pending_mutations set status='syncing'")) {
      const [id] = params;
      const r = state.table.get(id);
      if (r) r.status = "syncing";
      return;
    }

    if (n.startsWith("update pending_mutations set attempts=")) {
      const [attempts, last_error, status, id] = params;
      const r = state.table.get(id);
      if (r) {
        r.attempts = attempts;
        r.last_error = last_error;
        r.status = status;
      }
      return;
    }

    if (n.startsWith("delete from pending_mutations where id=")) {
      const [id] = params;
      state.table.delete(id);
      return;
    }

    if (n === "delete from pending_mutations") {
      state.table = new Map();
      return;
    }
  };

  return {
    openDatabaseAsync: jest.fn(async () => ({
      execAsync: jest.fn(async (sql: string) => {
        const g = globalThis as { [STATE_KEY]?: SqliteMockState };
        const state = g[STATE_KEY]!;
        state.calls.push({ method: "exec", sql, params: [] });
        const n = (sql || "").trim().toLowerCase();
        if (n === "delete from pending_mutations") {
          state.table = new Map();
          return;
        }
        // PRAGMA / CREATE TABLE / IF NOT EXISTS — sessizce geç
        return;
      }),
      runAsync: jest.fn((sql: string, params?: any[]) => handle(sql, params)),
      getAllAsync: jest.fn(async (sql: string) => {
        const g = globalThis as { [STATE_KEY]?: SqliteMockState };
        const state = g[STATE_KEY]!;
        state.calls.push({ method: "getAll", sql, params: [] });
        const n = sql.trim().toLowerCase();
        if (n.startsWith("select * from pending_mutations where status in ('pending','failed')")) {
          return [...state.table.values()]
            .filter((r) => r.status === "pending" || r.status === "failed")
            .sort((a, b) => a.created_at - b.created_at);
        }
        return [];
      }),
      getFirstAsync: jest.fn(async (sql: string, params: any[] = []) => {
        const g = globalThis as { [STATE_KEY]?: SqliteMockState };
        const state = g[STATE_KEY]!;
        state.calls.push({ method: "getFirst", sql, params });
        const n = sql.trim().toLowerCase();

        if (n.startsWith("select count(*) as c from pending_mutations where status in ('pending','failed')")) {
          const c = [...state.table.values()].filter(
            (r) => r.status === "pending" || r.status === "failed"
          ).length;
          return { c };
        }

        if (n.startsWith("select attempts from pending_mutations where id=")) {
          const [id] = params;
          const r = state.table.get(id);
          return r ? { attempts: r.attempts } : null;
        }

        return null;
      }),
    })),
    __esModule: true,
    default: {},
  };
});

// Import after mock — store açılırken getDb() yeni mock'a bağlanır
// eslint-disable-next-line import/first
import { _resetDbForTesting } from "@/lib/offline/db";
// eslint-disable-next-line import/first
import { offlineQueue, type EnqueueInput } from "@/lib/offline/queueService";

const baseInput: EnqueueInput = {
  endpoint: "/warehouse/purchase-orders/",
  method: "POST",
  payload: { supplier_id: "x", items: [] },
  feature: "purchase-order",
  description: "Test sipariş",
};

beforeEach(() => {
  _resetDbForTesting();
  getState().reset();
});

describe("offlineQueue.enqueue", () => {
  it("yeni satır ekler ve QueuedMutation döner", async () => {
    const item = await offlineQueue.enqueue(baseInput);
    expect(item.id).toBeDefined();
    expect(item.endpoint).toBe(baseInput.endpoint);
    expect(item.method).toBe(baseInput.method);
    expect(item.feature).toBe(baseInput.feature);
    expect(item.status).toBe("pending");
    expect(item.attempts).toBe(0);
    expect(item.created_at).toBeGreaterThan(0);
    expect(typeof item.idempotency_key).toBe("string");
  });

  it("payload JSON.stringify edilmiş olarak saklanır", async () => {
    await offlineQueue.enqueue(baseInput);
    const row = [...getState().table.values()][0]!;
    expect(row.payload).toBe(JSON.stringify(baseInput.payload));
  });

  it("custom idempotencyKey override edilir", async () => {
    const item = await offlineQueue.enqueue({
      ...baseInput,
      idempotencyKey: "my-stable-key-123",
    });
    expect(item.idempotency_key).toBe("my-stable-key-123");
  });

  it("description opsiyonel: undefined → null DB", async () => {
    await offlineQueue.enqueue({ ...baseInput, description: undefined });
    const row = [...getState().table.values()][0]!;
    expect(row.description).toBeNull();
  });
});

describe("offlineQueue.listPending", () => {
  it("sadece pending + failed döner (syncing/synced Hariç)", async () => {
    await offlineQueue.enqueue(baseInput); // pending
    const a = await offlineQueue.enqueue({ ...baseInput, feature: "feature-a" });
    const b = await offlineQueue.enqueue({ ...baseInput, feature: "feature-b" });
    await offlineQueue.markSyncing(a.id);
    await offlineQueue.markSynced(b.id); // silinir

    const list = await offlineQueue.listPending();
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("pending");
  });

  it("created_at artan sırada döner (FIFO)", async () => {
    const a = await offlineQueue.enqueue(baseInput);
    await new Promise((r) => setTimeout(r, 2));
    const b = await offlineQueue.enqueue({ ...baseInput, feature: "b" });
    const list = await offlineQueue.listPending();
    expect(list[0]!.id).toBe(a.id);
    expect(list[1]!.id).toBe(b.id);
  });

  it("failed satırları da listeye dahildir", async () => {
    const a = await offlineQueue.enqueue(baseInput);
    for (let i = 0; i < 5; i++) {
      await offlineQueue.markFailed(a.id, "hata", 5);
    }
    const list = await offlineQueue.listPending();
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("failed");
    expect(list[0]!.attempts).toBe(5);
  });
});

describe("offlineQueue.count", () => {
  it("boş tablo → 0", async () => {
    const c = await offlineQueue.count();
    expect(c).toBe(0);
  });

  it("tüm pending + failed sayılır", async () => {
    await offlineQueue.enqueue(baseInput);
    await offlineQueue.enqueue({ ...baseInput, feature: "x" });
    const a = await offlineQueue.enqueue({ ...baseInput, feature: "y" });
    await offlineQueue.markSyncing(a.id);
    expect(await offlineQueue.count()).toBe(2);
  });
});

describe("offlineQueue.markSyncing / markSynced", () => {
  it("markSyncing status='syncing' yapar", async () => {
    const item = await offlineQueue.enqueue(baseInput);
    await offlineQueue.markSyncing(item.id);
    const r = getState().table.get(item.id);
    expect(r?.status).toBe("syncing");
  });

  it("markSynced satırı siler", async () => {
    const item = await offlineQueue.enqueue(baseInput);
    await offlineQueue.markSynced(item.id);
    expect(getState().table.has(item.id)).toBe(false);
  });
});

describe("offlineQueue.markFailed", () => {
  it("attempts sayısını artırır, last_error set eder", async () => {
    const item = await offlineQueue.enqueue(baseInput);
    await offlineQueue.markFailed(item.id, "500 server error", 5);
    const r = getState().table.get(item.id);
    expect(r?.attempts).toBe(1);
    expect(r?.last_error).toBe("500 server error");
    expect(r?.status).toBe("pending");
  });

  it("attempts < maxRetries iken status='pending' kalır", async () => {
    const item = await offlineQueue.enqueue(baseInput);
    await offlineQueue.markFailed(item.id, "hata", 5);
    await offlineQueue.markFailed(item.id, "hata2", 5);
    const r = getState().table.get(item.id);
    expect(r?.status).toBe("pending");
    expect(r?.attempts).toBe(2);
  });

  it("attempts >= maxRetries → status='failed' olur", async () => {
    const item = await offlineQueue.enqueue(baseInput);
    for (let i = 0; i < 5; i++) {
      await offlineQueue.markFailed(item.id, "tekrar", 5);
    }
    const r = getState().table.get(item.id);
    expect(r?.attempts).toBe(5);
    expect(r?.status).toBe("failed");
  });

  it("olmayan id ile çağrı sessizce geçer (crash etmez)", async () => {
    await expect(
      offlineQueue.markFailed("nonexistent-id", "x", 3)
    ).resolves.toBeUndefined();
  });
});

describe("offlineQueue.clear", () => {
  it("tüm satırları siler", async () => {
    await offlineQueue.enqueue(baseInput);
    await offlineQueue.enqueue({ ...baseInput, feature: "x" });
    expect(getState().table.size).toBe(2);
    await offlineQueue.clear();
    expect(getState().table.size).toBe(0);
  });
});

describe("row → QueuedMutation dönüşümü", () => {
  it("payload JSON.parse ile orijinal objeye dönüşür", async () => {
    const original = { supplier_id: "abc", items: [{ id: 1, qty: 5 }] };
    await offlineQueue.enqueue({ ...baseInput, payload: original });
    const [row] = await offlineQueue.listPending();
    expect(row!.payload).toEqual(original);
  });

  it("description null → undefined (UI için)", async () => {
    await offlineQueue.enqueue({ ...baseInput, description: undefined });
    const [row] = await offlineQueue.listPending();
    expect(row!.description).toBeUndefined();
  });

  it("last_error null → undefined", async () => {
    const item = await offlineQueue.enqueue(baseInput);
    const [row] = await offlineQueue.listPending();
    expect(row!.last_error).toBeUndefined();
    await offlineQueue.markFailed(item.id, "boom", 5);
    const [row2] = await offlineQueue.listPending();
    expect(row2!.last_error).toBe("boom");
  });
});
