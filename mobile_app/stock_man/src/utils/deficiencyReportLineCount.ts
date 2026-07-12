import type { DeficiencyReport } from "@/types";
import { getActiveDeficiencyTransfers } from "@/utils/deficiencyTransfers";
export function getDeficiencyReportLineCount(
  r: Pick<DeficiencyReport, "items" | "transfers">
): number {
  const itemCount = r.items?.length ?? 0;
  if (itemCount > 0) return itemCount;
  let fromTransfers = 0;
  for (const t of getActiveDeficiencyTransfers(r)) {
    fromTransfers += t.items?.length ?? 0;
  }
  return fromTransfers;
}


