import type { QueryClient, Query } from "@tanstack/react-query";
import type { PrepTask } from "../types";
import type { PrepTaskListMode } from "../types";

export type PrepWsMessagePayload = {
  refresh_all?: boolean;
  removed_task_id?: string | null;
  task?: PrepTask | null;
};

function isPrepTasksQuery(query: Query): boolean {
  const k = query.queryKey;
  return Array.isArray(k) && k[0] === "prep-tasks";
}

function queryListMode(key: readonly unknown[]): PrepTaskListMode {
  const m = key[3];
  return m === "full" ? "full" : "operational";
}

/** Kısa listeyi API ile aynı kural: dünkü (veya eski) tamamlanmış satır tahtada olmasın. */
function shouldKeepInOperationalList(t: PrepTask): boolean {
  if (t.status === "CANCELLED") return false;
  if (t.status !== "COMPLETED") return true;
  const c = t.created_at;
  if (!c) return true;
  const d = new Date(c);
  const n = new Date();
  d.setHours(0, 0, 0, 0);
  n.setHours(0, 0, 0, 0);
  return d >= n;
}

/** DRF/JSON bazen FK’yi düz id, bazen `{ id }` döndürebilir; sorgu anahtarı ile hizala. */
function idString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "id" in v) {
    return String((v as { id: unknown }).id);
  }
  return String(v);
}

function prepTaskBelongsToQueryKey(queryKey: readonly unknown[], task: PrepTask): boolean {
  const branch = queryKey[1] as string | undefined;
  const station = queryKey[2] as string | undefined;
  if (branch && idString((task as unknown as { branch?: unknown }).branch) !== String(branch)) {
    return false;
  }
  if (station) {
    const taskStation = idString((task as unknown as { station?: unknown }).station);
    if (!taskStation || taskStation !== String(station)) return false;
  }
  return true;
}

/** Bu görev, verilen sorgu önbelleğine güncellemeyle eklenebilir mi? (önbellek boş olsa da) */
function shouldApplyTaskToQuery(
  queryKey: readonly unknown[],
  task: PrepTask,
  mode: PrepTaskListMode
): boolean {
  if (!prepTaskBelongsToQueryKey(queryKey, task)) return false;
  if (mode === "operational" && !shouldKeepInOperationalList(task)) return false;
  return true;
}

function invalidatePrepTaskQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["prep-tasks"] });
  queryClient.invalidateQueries({ queryKey: ["prep-tasks-infinite"] });
  queryClient.invalidateQueries({ queryKey: ["prep-task-count"] });
}

/**
 * Mutfak WebSocket ``prep_update`` mesajına göre React Query ``prep-tasks`` önbelleğini günceller.
 */
export function applyPrepKitchenWsPayload(
  queryClient: QueryClient,
  payload: PrepWsMessagePayload
): void {
  if (payload.refresh_all) {
    invalidatePrepTaskQueries(queryClient);
    return;
  }

  const queries = queryClient.getQueryCache().findAll({ predicate: isPrepTasksQuery });

  if (payload.removed_task_id) {
    const rid = payload.removed_task_id;
    for (const q of queries) {
      queryClient.setQueryData<PrepTask[]>(q.queryKey, (old) => {
        if (!old) return old;
        return old.filter((t) => t.id !== rid);
      });
    }
  }

  const task = payload.task;
  if (!task) {
    // Backend bazen `serialize_prep_task_for_ws` ile null döner; kısmi merge yapılamaz — HTTP tazele.
    if (!payload.removed_task_id) {
      invalidatePrepTaskQueries(queryClient);
    }
    return;
  }

  let needRefetchBecauseEmptyCache = false;

  for (const q of queries) {
    const mode = queryListMode(q.queryKey);
    queryClient.setQueryData<PrepTask[]>(q.queryKey, (old) => {
      if (old === undefined) {
        if (shouldApplyTaskToQuery(q.queryKey, task, mode)) {
          needRefetchBecauseEmptyCache = true;
        }
        return old;
      }
      if (!prepTaskBelongsToQueryKey(q.queryKey, task)) {
        return old.filter((t) => t.id !== task.id);
      }
      if (mode === "operational" && !shouldKeepInOperationalList(task)) {
        return old.filter((t) => t.id !== task.id);
      }
      const idx = old.findIndex((t) => t.id === task.id);
      if (idx === -1) {
        if (mode === "operational" && !shouldKeepInOperationalList(task)) {
          return old;
        }
        return [...old, task];
      }
      const next = [...old];
      next[idx] = task;
      return next;
    });
  }

  if (needRefetchBecauseEmptyCache) {
    invalidatePrepTaskQueries(queryClient);
  }
}
