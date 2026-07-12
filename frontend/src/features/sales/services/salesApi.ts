import api from "@/lib/api"
import type { Sale, CancellationRecord, CancellationListTotals } from "../types"
import type { PaginatedResponse } from "@/lib/types"

export const salesApi = {
  getSales: (params: Record<string, string | number>) =>
    api.get<PaginatedResponse<Sale>>("/sales/", { params }).then(r => r.data),

  getDeletedSales: (params: Record<string, string | number>) =>
    api.get<PaginatedResponse<Sale>>("/sales/deleted/", { params }).then(r => r.data),

  getSalesSummary: (params: Record<string, string>) =>
    api.get("/sales/summary/", { params }).then(r => r.data),

  updateSale: (id: string, data: { payment_method: string; notes: string; total_amount: string }) =>
    api.patch<Sale>(`/sales/${id}/`, data).then(r => r.data),

  deleteSale: (id: string) => api.delete(`/sales/${id}/`),

  bulkDeletePermanent: (ids: string[]) =>
    api.delete("/sales/bulk_delete_permanent/", { data: { ids } }),

  bulkRestore: (ids: string[]) =>
    api.post("/sales/bulk_restore/", { ids }),

  getCancellations: (params: Record<string, string | number>) =>
    api.get<PaginatedResponse<CancellationRecord> & { totals?: CancellationListTotals }>(
      "/sales/cancellations/",
      { params },
    ).then(r => r.data),

  exportCancellationsPdf: (params: Record<string, string | number | undefined>) =>
    api.get("/sales/cancellations/export/pdf/", { params, responseType: "blob" }).then(r => r.data),

  exportCancellationsExcel: (params: Record<string, string | number | undefined>) =>
    api.get("/sales/cancellations/export/excel/", { params, responseType: "blob" }).then(r => r.data),
}
