// ============================================================
// Stock Man — WSPushHost (P5)
//
// Mounts warehouse WebSocket; pushes events to store + invalidates
// React Query caches. Shows toast on new deficiency reports.
// ============================================================

import { ReactNode, useCallback } from "react";
import { useWebSocket, type WarehouseWsEvent } from "@/hooks/useWebSocket";
import { useWSPushStore } from "@/store/useWSPushStore";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { useBranchStore } from "@/store/useBranchStore";
import { useToastStore } from "@/components/ui/Toast";
import { tSync } from "@/i18n";
import { useUIStore } from "@/store/useUIStore";

export function WSPushHost({ children }: { children: ReactNode }) {
  const push = useWSPushStore((s) => s.push);
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const branchId = useBranchStore((s) => s.activeBranchId);
  const language = useUIStore((s) => s.language);

  const onEvent = useCallback(
    (e: WarehouseWsEvent) => {
      push(e);

      if (e.type === "deficiency_created" || e.type === "deficiency_status_changed") {
        void qc.invalidateQueries({ queryKey: ["deficiency-reports"] });
        if (e.type === "deficiency_status_changed") {
          void qc.invalidateQueries({ queryKey: ["deficiency-reports", e.data.id] });
          void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
          void qc.invalidateQueries({ queryKey: ["transfers"] });
        }
      } else if (e.type === "stock_low_alert") {
        void qc.invalidateQueries({ queryKey: ["stock-items"] });
        void qc.invalidateQueries({ queryKey: ["warehouses"] });
      } else if (e.type === "transfer.status_changed") {
        void qc.invalidateQueries({ queryKey: ["transfers"] });
        void qc.invalidateQueries({ queryKey: ["transfers", e.data.transfer_id] });
        void qc.invalidateQueries({ queryKey: ["deficiency-reports"] });
        void qc.invalidateQueries({
          queryKey: ["deficiency-reports", e.data.deficiency_report_id],
        });
      }

      if (e.type === "deficiency_created") {
        useToastStore.getState().show({
          title: tSync("deficiency.notifications.createdTitle", language, {
            station: e.data.station_name,
          }),
          description: tSync("deficiency.notifications.createdDescription", language, {
            number: e.data.report_number,
          }),
          variant: "info",
          durationMs: 10_000,
        });
      }
    },
    [push, qc, language]
  );

  useWebSocket(onEvent, isAuthenticated && !!branchId);

  return <>{children}</>;
}

