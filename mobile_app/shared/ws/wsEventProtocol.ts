/** Paylaşımlı WebSocket olay zarfı — backend snake_case + istemci camelCase. */

export type NormalizedWsMessage = {
  type: string;
  eventId?: string;
  sequence?: number;
  branchId?: string;
  tableId?: string;
  orderId?: string;
  itemId?: string;
  data: Record<string, unknown>;
  version?: number;
};

export type SequenceGapInfo = {
  aggregateKey: string;
  expected: number;
  received: number;
};

const DEDUP_MAX = 200;
const DEDUP_TTL_MS = 5 * 60 * 1000;

type DedupEntry = { seenAt: number };

const eventIdCache = new Map<string, DedupEntry>();
const lastSequenceByKey = new Map<string, number>();
let onSequenceGapCallback: ((info: SequenceGapInfo) => void) | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value != null && value !== "") {
      return String(value);
    }
  }
  return undefined;
}

function pickNumber(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function pruneEventIdCache(now: number): void {
  for (const [key, entry] of eventIdCache) {
    if (now - entry.seenAt > DEDUP_TTL_MS) {
      eventIdCache.delete(key);
    }
  }
  while (eventIdCache.size > DEDUP_MAX) {
    const oldest = eventIdCache.keys().next().value;
    if (oldest === undefined) break;
    eventIdCache.delete(oldest);
  }
}

export function parseWsMessage(raw: string | unknown): NormalizedWsMessage | null {
  let obj: Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const record = asRecord(parsed);
      if (!record) return null;
      obj = record;
    } catch {
      return null;
    }
  } else {
    const record = asRecord(raw);
    if (!record) return null;
    obj = record;
  }

  const type = pickString(obj, "type");
  if (!type) return null;

  const data = asRecord(obj.data) ?? asRecord(obj.message) ?? {};
  const merged = { ...obj, ...data };

  return {
    type,
    eventId:
      pickString(obj, "event_id", "eventId") ??
      pickString(data, "event_id", "eventId"),
    sequence:
      pickNumber(obj, "sequence", "seq") ?? pickNumber(data, "sequence", "seq"),
    branchId: pickString(merged, "branch_id", "branchId"),
    tableId: pickString(merged, "table_id", "tableId"),
    orderId: pickString(merged, "order_id", "orderId"),
    itemId: pickString(merged, "item_id", "itemId"),
    data,
    version: pickNumber(obj, "version") ?? pickNumber(data, "version"),
  };
}

/** true = ilk kez görülen event_id; false = TTL penceresinde tekrar. event_id yoksa true. */
export function dedupByEventId(eventId: string | undefined): boolean {
  if (!eventId) return true;

  const now = Date.now();
  pruneEventIdCache(now);

  if (eventIdCache.has(eventId)) {
    return false;
  }

  eventIdCache.set(eventId, { seenAt: now });
  pruneEventIdCache(now);
  return true;
}

export function setOnSequenceGap(
  callback: ((info: SequenceGapInfo) => void) | null
): void {
  onSequenceGapCallback = callback;
}

/** Sıra numarası yoksa true; eski/tekrarlı sıra false; atlama varsa hook tetiklenir. */
export function shouldApplySequence(
  aggregateKey: string,
  sequence: number | undefined
): boolean {
  if (sequence == null || !Number.isFinite(sequence)) {
    return true;
  }

  const seq = Math.trunc(sequence);
  const last = lastSequenceByKey.get(aggregateKey);

  if (last === undefined) {
    lastSequenceByKey.set(aggregateKey, seq);
    return true;
  }

  if (seq <= last) {
    return false;
  }

  if (seq > last + 1) {
    onSequenceGapCallback?.({
      aggregateKey,
      expected: last + 1,
      received: seq,
    });
  }

  lastSequenceByKey.set(aggregateKey, seq);
  return true;
}

/** Test ve hot-reload için dahili durumu sıfırlar. */
export function resetWsEventProtocolState(): void {
  eventIdCache.clear();
  lastSequenceByKey.clear();
  onSequenceGapCallback = null;
}
