// ============================================================
// Stock Man — Supplier service
//
// Endpoints covered (docs/wiki/Stock_Man_App.md →
// "inventory — suppliers"):
//   - GET    /inventory/suppliers/                       list
//   - GET    /inventory/suppliers/{id}/                  detail
//   - GET    /inventory/suppliers/{id}/performance/      perf summary
//   - POST   /inventory/suppliers/                       create
//   - PATCH  /inventory/suppliers/{id}/                  update
//   - DELETE /inventory/suppliers/{id}/                  soft delete
// ============================================================

import { axiosClient } from "@/api/client";
import type { Supplier, SupplierPerformance, Paginated, UUID } from "@/types";

export const supplierService = {
  list: async (params?: {
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<Paginated<Supplier>> => {
    const res = await axiosClient.get("/inventory/suppliers/", { params });
    return res.data;
  },

  get: async (id: UUID): Promise<Supplier> => {
    const res = await axiosClient.get<Supplier>(`/inventory/suppliers/${id}/`);
    return res.data;
  },

  performance: async (id: UUID, days = 30): Promise<SupplierPerformance> => {
    const res = await axiosClient.get<SupplierPerformance>(
      `/inventory/suppliers/${id}/performance/`,
      { params: { days } }
    );
    return res.data;
  },

  create: async (data: Omit<Supplier, "id" | "created_at" | "updated_at">): Promise<Supplier> => {
    const res = await axiosClient.post<Supplier>("/inventory/suppliers/", data);
    return res.data;
  },

  update: async (id: UUID, data: Partial<Supplier>): Promise<Supplier> => {
    const res = await axiosClient.patch<Supplier>(`/inventory/suppliers/${id}/`, data);
    return res.data;
  },

  remove: async (id: UUID): Promise<void> => {
    await axiosClient.delete(`/inventory/suppliers/${id}/`);
  },
};
