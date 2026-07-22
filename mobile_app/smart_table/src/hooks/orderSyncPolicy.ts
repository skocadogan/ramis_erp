export function payloadTargetsAnotherTable(
  payload: Record<string, unknown>,
  currentTableId: string | null,
): boolean {
  const payloadTableId = payload.table_id ?? payload.tableId;
  if (payloadTableId == null || String(payloadTableId) === "") return false;
  if (!currentTableId) return true;
  return String(payloadTableId) !== String(currentTableId);
}
