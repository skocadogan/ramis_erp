// ============================================================
// Stock Man — Expiry (SKT) hooks
//
// List / summary / action-types queries plus the
// `useRecordExpiryAction` mutation. The mutation invalidates
// both the warnings list and the action history so the next
// render of the dashboard / history panel reflects the change.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { expiryService } from "@/services/expiryService";
import type { ExpiryActionType, UUID } from "@/types";

export function useExpiryWarnings(params?: {
  warehouse_id?: UUID;
  days_ahead?: 3 | 7;
}) {
  return useQuery({
    queryKey: ["expiry-warnings", params],
    queryFn: () => expiryService.list(params),
    staleTime: 60_000,
  });
}

export function useExpirySummary(params?: { warehouse_id?: UUID }) {
  return useQuery({
    queryKey: ["expiry-warnings", "summary", params],
    queryFn: () => expiryService.summary(params),
    staleTime: 60_000,
  });
}

export function useExpiryActionTypes() {
  return useQuery({
    queryKey: ["expiry-warnings", "action-types"],
    queryFn: () => expiryService.actionTypes(),
    staleTime: 60 * 60_000,
  });
}

export function useRecordExpiryAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      lot_id: UUID;
      action_type: ExpiryActionType;
      notes?: string;
    }) => expiryService.recordAction(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expiry-warnings"] });
      void qc.invalidateQueries({
        queryKey: ["expiry-warnings", "actions", "history"],
      });
    },
  });
}

export function useAutoReturnCancelExpiredLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { lot_id: UUID; notes?: string }) =>
      expiryService.autoReturnCancel(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expiry-warnings"] });
      void qc.invalidateQueries({ queryKey: ["return-cancel-movements"] });
    },
  });
}


