"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/store/useAuthStore";
import { getWarehouseNotificationsWsUrl, subscribeSharedWebSocket, warehouseNotificationsHubKey } from "@/lib/ws";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { playNotificationSound } from "@/lib/notificationSounds";

export function useWarehouseNotifications(branchId?: string) {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const t = useTranslations("warehouse");

  useEffect(() => {
    const cleanup = subscribeSharedWebSocket(warehouseNotificationsHubKey(branchId), {
      tag: "warehouse-notifications",
      enabled: !!token,
      getUrl: () => getWarehouseNotificationsWsUrl(branchId),
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "deficiency_created") {
            qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase });
            qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase });

            toast.info(
              t("notifications.deficiencyCreatedTitle", {
                station: payload.data.station_name as string,
              }),
              {
                description: t("notifications.deficiencyCreatedDescription", {
                  number: payload.data.report_number as string,
                }),
                duration: 10000,
              },
            );

            playNotificationSound("deficiency-arrived");
          }

          if (payload.type === "deficiency_status_changed") {
            qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase });
            qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase });
            qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase });
            qc.invalidateQueries({ queryKey: queryKeys.transfersBase });
          }

          if (payload.type === "expiry_transfer_draft_created") {
            qc.invalidateQueries({ queryKey: queryKeys.transfersBase });
            qc.invalidateQueries({ queryKey: queryKeys.expiryWarningsBase });
            qc.invalidateQueries({ queryKey: queryKeys.expirySummaryBase });

            toast.info(
              t("notifications.expiryTransferDraftTitle"),
              {
                description: t("notifications.expiryTransferDraftDescription", {
                  number: payload.data.transfer_number as string,
                  product: payload.data.stock_item_name as string,
                }),
                duration: 10000,
              },
            );
          }

          if (payload.type === "procurement_overdue_alert") {
            qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase });
            qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase });
            qc.invalidateQueries({ queryKey: ["procurement-alerts"] });

            const count = Number(payload.data.overdue_orders_count ?? 0);
            if (count > 0) {
              toast.warning(
                t("notifications.procurementOverdueTitle", { count }),
                {
                  description: t("notifications.procurementOverdueDescription"),
                  duration: 10000,
                },
              );
            }
          }
        } catch (err) {
          console.error("WS Message Error:", err);
        }
      },
    });

    return cleanup;
  }, [token, qc, branchId, t]);

  return null;
}
