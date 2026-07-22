import type { Table } from "../types/models";

export type TableUpdateAction = "upsert" | "delete" | string | undefined;

export function applyTableUpdate(
  tables: Table[],
  data: Record<string, unknown>,
  action: TableUpdateAction
): Table[] {
  const rawId = data.id ?? data.table_id;
  if (rawId == null || String(rawId) === "") return tables;

  const id = String(rawId);
  const index = tables.findIndex((table) => String(table.id) === id);

  if (action === "delete") {
    return index === -1 ? tables : tables.filter((_, tableIndex) => tableIndex !== index);
  }

  if (index === -1) {
    return [...tables, data as unknown as Table];
  }

  return tables.map((table, tableIndex) =>
    tableIndex === index ? ({ ...table, ...data } as Table) : table
  );
}

export function reconcilePendingCallIds(
  previousIds: Set<string>,
  calls: Array<{ call_id?: unknown }>
): { pendingIds: Set<string>; newIds: Set<string>; staleIds: string[] } {
  const pendingIds = new Set(
    calls
      .map((call) => (call.call_id == null ? "" : String(call.call_id)))
      .filter(Boolean)
  );
  return {
    pendingIds,
    newIds: new Set([...pendingIds].filter((id) => !previousIds.has(id))),
    staleIds: [...previousIds].filter((id) => !pendingIds.has(id)),
  };
}
