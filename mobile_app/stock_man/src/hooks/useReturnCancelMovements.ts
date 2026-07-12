// ============================================================
// Stock Man — Return / Cancel hooks
//
// React Query wrappers for returnCancelService.
// Cache keys: ["return-cancel-movements", filters]
// ============================================================

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createOfflineMutationFn, isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import {
  returnCancelService,
  type ReturnCancelCreatePayload,
  type ReturnCancelFilters,
} from "@/services/returnCancelService";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { StockMovement, UUID } from "@/types";

export { isOfflineQueued, showOfflineQueuedToast };
export {
  defaultReturnCancelDateRange,
  summarizeReturnCancelRows,
} from "@/utils/returnCancelReason";

export function useReturnCancelReasonCodes() {
  return useQuery({
    queryKey: ["return-cancel-reason-codes"],
    queryFn: () => returnCancelService.reasonCodes(),
    staleTime: 300_000,
  });
}

export function useInfiniteReturnCancelMovements(filters: ReturnCancelFilters) {
  const debouncedSearch = useDebouncedValue(filters.search ?? "", 400);

  return useInfiniteQuery({
    queryKey: [
      "return-cancel-movements",
      "infinite",
      {
        ...filters,
        search: debouncedSearch || undefined,
      },
    ],
    queryFn: ({ pageParam = 1 }) =>
      returnCancelService.list({
        ...filters,
        search: debouncedSearch || undefined,
        page: pageParam,
        page_size: filters.page_size ?? 50,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.next) return undefined;
      const match = lastPage.next.match(/page=(\d+)/);
      const page = match?.[1];
      return page ? parseInt(page, 10) : undefined;
    },
    staleTime: 30_000,
  });
}

export function useCreateReturnCancelMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOfflineMutationFn<StockMovement, ReturnCancelCreatePayload>(
      (payload) => ({
        endpoint: "/inventory/stock-movements/",
        method: "POST",
        payload,
        feature: "return-cancel",
        description: `Return/Cancel ${payload.movement_type}`,
      })
    ),
    onSuccess: (data) => {
      if (isOfflineQueued(data)) return;
      void qc.invalidateQueries({ queryKey: ["return-cancel-movements"] });
      void qc.invalidateQueries({ queryKey: ["stock-movements"] });
      void qc.invalidateQueries({ queryKey: ["stock-items"] });
    },
  });
}

export function useDeleteReturnCancelMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOfflineMutationFn<void, UUID>((id) => ({
      endpoint: `/inventory/stock-movements/${id}/`,
      method: "DELETE",
      payload: {},
      feature: "return-cancel",
      description: "Delete return/cancel movement",
    })),
    onSuccess: (data) => {
      if (isOfflineQueued(data)) return;
      void qc.invalidateQueries({ queryKey: ["return-cancel-movements"] });
      void qc.invalidateQueries({ queryKey: ["stock-movements"] });
      void qc.invalidateQueries({ queryKey: ["stock-items"] });
    },
  });
}
