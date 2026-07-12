"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { getWarehouseNotificationsWsUrl, runManagedWebSocket } from "@/lib/ws";
import { queryKeys } from "@/lib/queryKeys";
import { hasOperationalManageAccess } from "@/lib/constants";
import { useDeficiencyReports } from "./useWarehouse";

/** Sidebar Depo rozeti — bekleyen eksik listesi sayısı (tüm şubeler). */
export function usePendingDeficiencyCount(
  userPermissions?: string[],
  is_superuser?: boolean,
): number {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const canWarehouse = hasOperationalManageAccess(
    userPermissions,
    is_superuser,
    "warehouse",
  );
  const enabled = !!token && canWarehouse;

  useEffect(() => {
    if (!enabled) return;
    return runManagedWebSocket({
      tag: "sidebar-deficiency-badge",
      enabled: true,
      getUrl: () => getWarehouseNotificationsWsUrl(),
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (
            payload.type === "deficiency_created" ||
            payload.type === "deficiency_status_changed"
          ) {
            qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase });
          }
        } catch {
          // ignore malformed WS payload
        }
      },
    });
  }, [enabled, qc]);

  const { data: reports = [] } = useDeficiencyReports(
    { status: "PENDING" },
    { enabled, staleTime: 30_000 },
  );

  return enabled ? reports.length : 0;
}
