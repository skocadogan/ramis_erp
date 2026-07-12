import api, { skipInterceptorToast } from "@/lib/api";
import type { Customer, CustomerType, CustomerSalesDetailResponse } from "../types";

export interface FetchCustomersParams {
  search?: string;
  customer_type?: CustomerType | 'ALL' | '';
  page?: number;
  page_size?: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const customersApi = {
  getCustomers: async (params?: FetchCustomersParams) => {
    const { data } = await api.get<PaginatedResponse<Customer>>("/customers/", {
      params,
    });
    return data;
  },

  getCustomer: async (id: string) => {
    const { data } = await api.get<Customer>(`/customers/${id}/`);
    return data;
  },

  createCustomer: async (payload: Partial<Customer>) => {
    const { data } = await api.post<Customer>("/customers/", payload, {
      ...skipInterceptorToast,
    });
    return data;
  },

  updateCustomer: async (id: string, payload: Partial<Customer>) => {
    const { data } = await api.patch<Customer>(`/customers/${id}/`, payload, {
      ...skipInterceptorToast,
    });
    return data;
  },

  deleteCustomer: async (id: string) => {
    await api.delete(`/customers/${id}/`, {
      ...skipInterceptorToast,
    });
  },

  getCustomerSales: async (id: string, params?: { page?: number; page_size?: number }) => {
    const { data } = await api.get<CustomerSalesDetailResponse>(`/customers/${id}/detail_sales/`, {
      params,
    });
    return data;
  },

  exportExcel: async (params?: FetchCustomersParams) => {
    const { data } = await api.get("/customers/export/excel/", {
      params,
      responseType: "blob",
    });
    return data as Blob;
  },

  exportPdf: async (params?: FetchCustomersParams) => {
    const { data } = await api.get("/customers/export/pdf/", {
      params,
      responseType: "blob",
    });
    return data as Blob;
  },

  exportCustomerSalesExcel: async (id: string) => {
    const { data } = await api.get(`/customers/${id}/export-sales/excel/`, {
      responseType: "blob",
    });
    return data as Blob;
  },

  exportCustomerSalesPdf: async (id: string) => {
    const { data } = await api.get(`/customers/${id}/export-sales/pdf/`, {
      responseType: "blob",
    });
    return data as Blob;
  },
};
