import type { DeficiencyReport } from "@/features/warehouse/types";

type DeficiencyReportRow = Pick<
  DeficiencyReport,
  "id" | "status" | "items" | "transfers" | "purchase_orders_count"
>;

export interface DeficiencyReportRowActionOptions {
  /** Detay modalından işlem önizleme / onay / kuyruk aşamasındaki raporlar */
  pendingItemActionReportIds?: ReadonlySet<string>;
}

/** Tablodan toplu satın alma veya transfer başlatıldı (detay modalı tekrar işlem açmasın). */
function deficiencyReportHasBulkTableActions(r: DeficiencyReportRow): boolean {
  const itemCount = r.items?.length ?? 0;
  const hasTransfers = (r.transfers?.length ?? 0) > 0;

  if (r.status === "ORDERED" && itemCount > 0) return true;
  if (hasTransfers && r.status === "APPROVED") return true;

  return false;
}

/** Detay modalındaki satır bazlı işlem akışı (tabloda yalnızca detay gösterilir). */
function deficiencyReportHasItemActionsFlow(
  r: DeficiencyReportRow,
  opts?: DeficiencyReportRowActionOptions,
): boolean {
  if (opts?.pendingItemActionReportIds?.has(r.id)) return true;

  const itemCount = r.items?.length ?? 0;

  if (r.status === "PARTIALLY_COMMITTED" || r.status === "COMMITTED") return true;
  if (r.status === "ORDERED" && itemCount === 0) return true;
  if ((r.transfers?.length ?? 0) > 0 && r.status !== "APPROVED") return true;

  return false;
}

export function shouldShowDeficiencyDetailButton(
  r: DeficiencyReportRow,
  opts?: DeficiencyReportRowActionOptions,
): boolean {
  if (deficiencyReportHasItemActionsFlow(r, opts)) return true;
  return !deficiencyReportHasBulkTableActions(r);
}

export function shouldShowDeficiencyTableActionsExceptDetail(
  r: DeficiencyReportRow,
  opts?: DeficiencyReportRowActionOptions,
): boolean {
  return !deficiencyReportHasItemActionsFlow(r, opts);
}
