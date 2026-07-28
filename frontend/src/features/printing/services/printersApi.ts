import type { PaginatedResponse } from "@/types/user.types"
import api, { skipInterceptorToast } from "@/lib/api"

/** POS / admin yazıcı kaydı — adminApi’den ayrıldı (POS chunk şişmesin). */
export interface Printer {
  id: string
  branch: string
  name: string
  connection_type: "NETWORK" | "USB"
  connection_type_display: string
  ip_address: string | null
  port: number
  device_path: string | null
  printer_type: string
  printer_type_display: string
  usage_type: "KITCHEN" | "POS"
  usage_type_display: string
  kitchen_station: string | null
  kitchen_station_name: string | null
  receipt_template_slug: string | null
  is_active: boolean
  status_info: {
    online: boolean
    paper: "ok" | "low" | "out" | "unknown"
    error?: string
  }
  last_seen: string | null
  created_at: string
  updated_at: string
}

export interface PrinterForm {
  branch: string
  name: string
  connection_type: "NETWORK" | "USB"
  ip_address?: string
  port?: number
  device_path?: string
  printer_type: string
  usage_type: "KITCHEN" | "POS"
  kitchen_station?: string | null
  receipt_template_slug?: string | null
  is_active: boolean
}

type ReceiptCategory = "POS_RECEIPT" | "KITCHEN_TICKET" | "WAITER_TICKET"

export type ReceiptBlockType =
  | "text" | "divider" | "key_value" | "item_loop"
  | "feed" | "cut" | "qr" | "date" | "time" | "branch_logo" | "branch_info"

export interface ReceiptBlock {
  type: ReceiptBlockType
  content?: string
  align?: "left" | "center" | "right"
  bold?: boolean
  size?: "normal" | "double" | "triple" | "quadruple"
  margin_left?: number
  margin_right?: number
  char?: string
  left?: string
  right?: string
  variable?: string
  columns?: {
    field: string
    width: number
    align: string
    format?: string
    prefix?: string
    suffix?: string
  }[]
  lines?: number
  data?: string
  width_px?: number
  branch_id?: string
  fields?: string[]
  hide_if_empty?: boolean
}

export interface ReceiptTemplate {
  id: string
  name: string
  slug: string
  category: ReceiptCategory
  category_display: string
  paper_width: number
  layout_json: ReceiptBlock[]
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export const printersApi = {
  getPrinters: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Printer>>("/printing/printers/", { params }).then((r) => r.data),

  createPrinter: (data: PrinterForm) =>
    api.post<Printer>("/printing/printers/", data).then((r) => r.data),

  updatePrinter: (id: string, data: Partial<PrinterForm>) =>
    api.patch<Printer>(`/printing/printers/${id}/`, data).then((r) => r.data),

  deletePrinter: (id: string) => api.delete(`/printing/printers/${id}/`),

  testPrint: (id: string) =>
    api.post(`/printing/printers/${id}/test_print/`).then((r) => r.data),

  syncPrinterStatus: (id: string) =>
    api.post<Printer>(`/printing/printers/${id}/sync_status/`).then((r) => r.data),

  getReceiptTemplates: (params?: Record<string, unknown>) =>
    api
      .get<ReceiptTemplate[] | PaginatedResponse<ReceiptTemplate>>("reporting/receipts/", { params })
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.results ?? []))),

  printReceiptThermal: (
    slug: string,
    printerId: string,
    context?: Record<string, unknown>,
    options?: { idempotencyKey?: string },
  ) =>
    api
      .post<{ status: string; message?: string; print_job_id?: string }>(
        `reporting/receipts/${slug}/print_thermal/`,
        {
          printer_id: printerId,
          ...(context ? { context } : {}),
          ...(options?.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
        },
        { ...skipInterceptorToast },
      )
      .then((r) => r.data),
}
