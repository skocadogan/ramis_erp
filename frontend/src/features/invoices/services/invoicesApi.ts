import api, { skipInterceptorToast } from "@/lib/api";
import type { PaginatedResponse } from "@/lib/types";

export interface InvoiceDto {
  id: string;
  sale: string;
  sale_id: string;
  branch: string;
  branch_name: string;
  invoice_number: string;
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  subtotal: string;
  tax_amount: string;
  tax_rate: string;
  total_amount: string;
  issued_at: string;
  pdf_url: string | null;
}

export async function fetchInvoices(params?: {
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  has_pdf?: string;
  search?: string;
  page?: number;
  page_size?: number;
}) {
  const { data } = await api.get<PaginatedResponse<InvoiceDto> | InvoiceDto[]>("/invoices/", { params });
  if (Array.isArray(data)) {
    return { results: data, count: data.length, next: null, previous: null } satisfies PaginatedResponse<InvoiceDto>;
  }
  return {
    results: data.results ?? [],
    count: data.count ?? 0,
    next: data.next ?? null,
    previous: data.previous ?? null,
  } satisfies PaginatedResponse<InvoiceDto>;
}

export async function createInvoice(payload: {
  sale_id: string;
  customer_name?: string;
  customer_tax_id?: string;
  customer_address?: string;
}) {
  const { data } = await api.post<InvoiceDto>("/invoices/", payload, { ...skipInterceptorToast });
  return data;
}
