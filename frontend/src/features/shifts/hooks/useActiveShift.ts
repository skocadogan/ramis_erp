"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { getPosSyncWsUrl, posSyncHubKey, subscribeSharedWebSocket } from "@/lib/ws";
import { usePosStore } from "@/store/usePosStore";
import { fetchActiveShift } from "../services/shiftsApi";
import type { ShiftDto } from "../types";

export function useActiveShift(branchId: string | null | undefined, terminalId?: string | null) {
  return useQuery<ShiftDto | null>({
    queryKey: ["active-shift", branchId, terminalId],
    queryFn: () => fetchActiveShift(branchId as string, terminalId),
    enabled: !!branchId,
    staleTime: 30_000,
  });
}

export function useInvalidateActiveShift() {
  const qc = useQueryClient();
  return (branchId?: string | null) => {
    // Invalidate the specific branch if provided, otherwise all
    if (branchId) {
      void qc.invalidateQueries({ queryKey: ["active-shift", branchId] });
    } else {
      void qc.invalidateQueries({ queryKey: ["active-shift"] });
    }
    
    // Always invalidate all shift lists to be safe across branches if needed
    void qc.invalidateQueries({ queryKey: ["shifts-list"] });
    
    void qc.invalidateQueries({ queryKey: ["pos-terminals"] });

    // Signal other tabs to also invalidate
    localStorage.setItem("shifts_updated_signal", Date.now().toString());
  };
}

/**
 * Listens for shift updates from other tabs (via localStorage) and other machines (via WebSockets)
 * and refetches accordingly.
 */
export function useSyncShiftsAcrossTabs(branchId?: string | null) {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    // 1. Cross-tab sync via localStorage (same browser)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "shifts_updated_signal") {
        void queryClient.invalidateQueries({ queryKey: ["active-shift"] });
        void queryClient.invalidateQueries({ queryKey: ["shifts-list"] });
        void queryClient.invalidateQueries({ queryKey: ["pos-terminals"] });
      }
      if (e.key === "pos_terminals_updated_signal") {
        void queryClient.invalidateQueries({ queryKey: ["pos-terminals"] });
      }
    };
    window.addEventListener("storage", handleStorage);

    // 2. Cross-machine sync via WebSockets (Django Channels)
    if (!token) return () => window.removeEventListener("storage", handleStorage);

    const terminalId = usePosStore.getState().posTerminalUuid || undefined;
    const cleanupWs = subscribeSharedWebSocket(posSyncHubKey(branchId || undefined, terminalId, "web"), {
      tag: "shift-sync",
      enabled: !!token,
      getUrl: () => getPosSyncWsUrl(branchId || undefined, terminalId, "web"),
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "shift_event") {
            // Broad invalidation on signal from server
            void queryClient.invalidateQueries({ queryKey: ["active-shift"] });
            void queryClient.invalidateQueries({ queryKey: ["shifts-list"] });
            void queryClient.invalidateQueries({ queryKey: ["pos-terminals"] });
          }
        } catch (error) {
          console.error("[ShiftSync] WS Parse error", error);
        }
      },
    });

    return () => {
      window.removeEventListener("storage", handleStorage);
      cleanupWs();
    };
  }, [queryClient, token, branchId]);
}
