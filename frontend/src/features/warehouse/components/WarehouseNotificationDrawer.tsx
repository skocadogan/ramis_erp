"use client";

import { useState } from "react";
import { Bell, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDeficiencyReports } from "@/features/warehouse/hooks/useWarehouse";
import { useApproveDeficiencyReport } from "@/features/warehouse/hooks/useWarehouseActions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function WarehouseNotificationDrawer() {
  const t = useTranslations("warehouse.notifications");
  const [isOpen, setIsOpen] = useState(false);
  const { data: reports = [], isLoading } = useDeficiencyReports({ status: "PENDING" });
  const approveMut = useApproveDeficiencyReport();

  const pendingCount = reports.length;

  const handleApprove = async (id: string) => {
    try {
      await approveMut.mutateAsync(id);
      toast.success(t("approveSuccess"));
    } catch {
      toast.error(t("approveError"));
    }
  };

  return (
    <>
      <div className="fixed right-6 bottom-6 z-50">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={cn(
            "relative flex size-12 items-center justify-center rounded-lg border shadow-md",
            pendingCount > 0
              ? "border-amber-600 bg-amber-600 text-white"
              : "   border-input",
          )}
          aria-label={t("drawerTitle")}
        >
          <Bell size={22} aria-hidden />
          {pendingCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-rose-600 text-2xs font-bold text-white ring-2">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent layout="scroll" size="md" className="max-h-[70vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell size={18} className="opacity-90" aria-hidden />
              {t("drawerTitle")}
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-2 p-0">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              </div>
            ) : pendingCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <AlertCircle size={28} className="mb-2 opacity-30" aria-hidden />
                <span className="text-sm">{t("drawerEmpty")}</span>
              </div>
            ) : (
              reports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
                >
                  <div className="min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-2xs font-semibold text-muted-foreground">
                        {report.report_number}
                      </span>
                      <span className="truncate text-sub font-medium text-muted-foreground">
                        {report.kitchen_station_name}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-foreground">
                      {t("lineItemsCount", { count: report.items?.length || 0 })}
                    </span>
                    <div className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
                      <Clock size={12} aria-hidden />
                      {new Date(report.created_at).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void handleApprove(report.id)}
                    disabled={approveMut.isPending}
                    title={t("approveButtonTitle")}
                  >
                    <CheckCircle size={18} />
                  </Button>
                </div>
              ))
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
