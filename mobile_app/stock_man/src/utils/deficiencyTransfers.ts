import type { DeficiencyReport } from "@/types";

export type DeficiencyReportTransfer = NonNullable<DeficiencyReport["transfers"]>[number];

/** BaseModel soft delete: yalnızca is_active !== false kayıtlar. */
function isActiveRecord(row: { is_active?: boolean }): boolean {
  return row.is_active !== false;
}

function filterActiveRecords<T extends { is_active?: boolean }>(
  rows: T[] | undefined | null
): T[] {
  return (rows ?? []).filter(isActiveRecord);
}

export function getActiveDeficiencyTransfers(
  report: Pick<DeficiencyReport, "transfers">
): DeficiencyReportTransfer[] {
  return filterActiveRecords(report.transfers);
}
