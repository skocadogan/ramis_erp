import type { DeficiencyReport } from "@/features/warehouse/types";

/** Aktif rapor kalemi yoksa (tamamlandı, satırlar silindi) transfer satırlarından toplam kalem sayısı. */
export function getDeficiencyReportLineCount(
  r: Pick<DeficiencyReport, "items" | "transfers">
): number {
  const itemCount = r.items?.length ?? 0;
  if (itemCount > 0) return itemCount;
  let fromTransfers = 0;
  for (const t of r.transfers ?? []) {
    fromTransfers += t.items?.length ?? 0;
  }
  return fromTransfers;
}

export function deficiencyReportHasTransferLineItems(
  r: Pick<DeficiencyReport, "transfers">
): boolean {
  return (r.transfers ?? []).some((t) => (t.items?.length ?? 0) > 0);
}

/** Depo modülü silme kuralları (backend `DeficiencyReportViewSet.destroy` ile uyumlu). */
export function canDeleteDeficiencyReport(
  r: Pick<DeficiencyReport, "status" | "transfers" | "purchase_orders_count">
): boolean {
  const st = r.status;
  if (st === "ORDERED" || st === "PARTIALLY_COMMITTED" || st === "COMMITTED") {
    return false;
  }
  if (st === "DRAFT" || st === "PENDING" || st === "CANCELLED") {
    return true;
  }
  if (st === "APPROVED") {
    const po = r.purchase_orders_count ?? 0;
    const tr = r.transfers?.length ?? 0;
    return po === 0 && tr === 0;
  }
  return false;
}
