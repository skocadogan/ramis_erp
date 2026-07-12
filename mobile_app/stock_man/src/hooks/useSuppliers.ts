// ============================================================
// Stock Man — Supplier hooks
//
// List / detail / performance queries, plus the three CRUD
// mutations. Every mutation invalidates the `["suppliers"]`
// key so the list and detail queries refetch on the next
// render. The update mutation also invalidates the single
// supplier key so the detail screen reflects the change
// without a manual refetch.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supplierService } from "@/services/supplierService";
import type { Supplier, UUID } from "@/types";

export function useSuppliers(params?: { search?: string; page?: number }) {
  return useQuery({
    queryKey: ["suppliers", params],
    queryFn: () => supplierService.list(params),
    staleTime: 60_000,
  });
}

export function useSupplier(id: UUID | undefined) {
  return useQuery({
    queryKey: ["suppliers", id],
    queryFn: () => supplierService.get(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useSupplierPerformance(id: UUID | undefined, days = 30) {
  return useQuery({
    queryKey: ["suppliers", id, "performance", days],
    queryFn: () => supplierService.performance(id!, days),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Supplier, "id" | "created_at" | "updated_at">) =>
      supplierService.create(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}
