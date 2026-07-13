"use client";

import { startTransition, useEffect, useState } from "react";
import { AlertCircle, Clock, X, Package, ListOrdered, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDeficiencyReports } from "@/features/warehouse/hooks/useWarehouse";
import { StatusBadge } from "@/features/warehouse/components/StatusBadge";
import { type DeficiencyReport } from "@/features/warehouse/types";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VerticalStatusTimeline,
  type VerticalStatusTimelineStep,
} from "@/components/ui/vertical-status-timeline";
import { KdsDeficiencyReportItemsList } from "./KdsDeficiencyReportItemsList";
import { DeficiencyTransferFulfilledLines } from "@/features/warehouse/components/DeficiencyTransferFulfilledLines";
import { formatDate } from "@/lib/formatters";

interface Props {
  activeStationId: string;
  collapsed?: boolean;
}

function formatReportInstant(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("tr-TR"),
    time: d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** API’de bağlı transfer varsa karşılama depo transferi ile yapılmıştır (satın alma/sipariş değil). */
function isTransferFulfillment(report: DeficiencyReport): boolean {
  return (report.transfers?.length ?? 0) > 0;
}

function pickPrimaryTransfer(report: DeficiencyReport) {
  const list = report.transfers ?? [];
  return (
    list.find((t) => t.status === "COMPLETED") ??
    list.find((t) => t.status === "IN_TRANSIT") ??
    list[0] ??
    null
  );
}

function formatTransferDate(isoDate: string | undefined): { date: string; time: string } | null {
  if (!isoDate) return null;
  const iso = isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`;
  return formatReportInstant(iso);
}

/**
 * Ana depo → mutfak deposu transferi ile karşılama (satın alma / mal kabul süreci yok).
 */
function buildTransferDeficiencyTimelineSteps(
  report: DeficiencyReport,
  steps: VerticalStatusTimelineStep[],
  t: (key: string, values?: Record<string, string | number>) => string
): VerticalStatusTimelineStep[] {
  if (report.approved_at) {
    const ap = formatReportInstant(report.approved_at);
    steps.push({
      id: "step-2",
      phase: 2,
      state: "completed",
      label: t('deficiency.timeline.step2Transfer'),
      date: report.approved_by_name ? `${ap.date} · ${report.approved_by_name}` : ap.date,
      time: ap.time,
    });
  } else {
    steps.push({
      id: "step-2",
      phase: 2,
      state: "completed",
      label: t('deficiency.timeline.step2Transfer'),
    });
  }

  const primary = pickPrimaryTransfer(report);
  const transferCount = report.transfers?.length ?? 0;
  const multiSuffix = transferCount > 1 ? ` (+${transferCount - 1} transfer)` : "";

  if (report.status === "APPROVED") {
    steps.push({
      id: "step-3",
      phase: 3,
      state: "pending",
      label: t('deficiency.timeline.step3TransferPending'),
    });
    steps.push({
      id: "step-4",
      phase: 4,
      state: "pending",
      label: t('deficiency.timeline.step4Target'),
    });
    return steps;
  }

  if (report.status === "ORDERED") {
    const u = formatReportInstant(report.updated_at);
    const td = primary ? formatTransferDate(primary.transfer_date) : null;
    steps.push({
      id: "step-3",
      phase: 3,
      state: "completed",
      label: primary
        ? t('deficiency.timeline.step3TransferStarted', { number: primary.transfer_number }) + multiSuffix
        : t('deficiency.timeline.step3TransferGeneric') + multiSuffix,
      date: td?.date ?? u.date,
      time: td?.time ?? u.time,
    });
    steps.push({
      id: "step-4",
      phase: 4,
      state: "pending",
      label: t('deficiency.timeline.step4InTransit'),
    });
    return steps;
  }

  if (report.status === "PARTIALLY_COMMITTED") {
    const u = formatReportInstant(report.updated_at);
    steps.push({
      id: "step-3",
      phase: 3,
      state: "completed",
      label: t('deficiency.timeline.step3Partially'),
      date: u.date,
      time: u.time,
    });
    steps.push({
      id: "step-4",
      phase: 4,
      state: "pending",
      label: t('deficiency.timeline.step5Pending'),
    });
    return steps;
  }

  if (report.status === "COMMITTED") {
    const u = formatReportInstant(report.updated_at);
    const td = primary ? formatTransferDate(primary.transfer_date) : null;
    const cd = primary ? formatTransferDate(primary.completed_date ?? undefined) : null;

    steps.push({
      id: "step-3",
      phase: 3,
      state: "completed",
      label: primary
        ? t('deficiency.timeline.step3Exit', { number: primary.transfer_number }) + multiSuffix
        : t('deficiency.timeline.step3ExitGeneric') + multiSuffix,
      date: td?.date ?? u.date,
      time: td?.time ?? u.time,
    });
    steps.push({
      id: "step-4",
      phase: 4,
      state: "completed",
      label: t('deficiency.timeline.step4Fulfilled'),
      date: cd?.date ?? u.date,
      time: cd?.time ?? u.time,
    });
    return steps;
  }

  return steps;
}

/**
 * Depo işlem sırası
 */
function buildDeficiencyTimelineSteps(report: DeficiencyReport, t: (key: string, values?: Record<string, string | number>) => string): VerticalStatusTimelineStep[] {
  const steps: VerticalStatusTimelineStep[] = [];

  const created = formatReportInstant(report.created_at);
  steps.push({
    id: "step-1",
    phase: 1,
    state: "completed",
    label: t('deficiency.timeline.step1'),
    date: report.created_by_name ? `${created.date} · ${report.created_by_name}` : created.date,
    time: created.time,
  });

  if (report.status === "CANCELLED") {
    if (report.approved_at) {
      const ap = formatReportInstant(report.approved_at);
      steps.push({
        id: "step-2",
        phase: 2,
        state: "completed",
        label: t('deficiency.timeline.step2Approved'),
        date: report.approved_by_name ? `${ap.date} · ${report.approved_by_name}` : ap.date,
        time: ap.time,
      });
    }
    const end = formatReportInstant(report.updated_at);
    steps.push({
      id: "cancelled",
      phase: "cancelled",
      state: "completed",
      label: t('deficiency.timeline.cancelled'),
      date: end.date,
      time: end.time,
    });
    return steps;
  }

  const afterDeficiencyApproval = new Set<string>(["APPROVED", "ORDERED", "PARTIALLY_COMMITTED", "COMMITTED"]);

  if (report.status === "DRAFT") {
    steps.push({
      id: "step-2",
      phase: 2,
      state: "pending",
      label: t('deficiency.timeline.step2Draft'),
    });
    return steps;
  }

  if (report.status === "PENDING") {
    steps.push({
      id: "step-2",
      phase: 2,
      state: "pending",
      label: t('deficiency.timeline.step2Pending'),
    });
    return steps;
  }

  if (!afterDeficiencyApproval.has(report.status)) {
    return steps;
  }

  if (isTransferFulfillment(report)) {
    return buildTransferDeficiencyTimelineSteps(report, steps, t);
  }

  if (report.approved_at) {
    const ap = formatReportInstant(report.approved_at);
    steps.push({
      id: "step-2",
      phase: 2,
      state: "completed",
      label: t('deficiency.timeline.step2Order'),
      date: report.approved_by_name ? `${ap.date} · ${report.approved_by_name}` : ap.date,
      time: ap.time,
    });
  } else {
    steps.push({
      id: "step-2",
      phase: 2,
      state: "completed",
      label: t('deficiency.timeline.step2Order'),
    });
  }

  if (report.status === "APPROVED") {
    steps.push({
      id: "step-3",
      phase: 3,
      state: "pending",
      label: t('deficiency.timeline.step3Approved'),
    });
    steps.push({
      id: "step-4",
      phase: 4,
      state: "pending",
      label: t('deficiency.timeline.step4OrderedPending'),
    });
    steps.push({
      id: "step-5",
      phase: 5,
      state: "pending",
      label: t('deficiency.timeline.step5FinalPending'),
    });
    return steps;
  }

  if (report.status === "ORDERED") {
    const u = formatReportInstant(report.updated_at);
    steps.push({
      id: "step-3",
      phase: 3,
      state: "completed",
      label: t('deficiency.timeline.step3Ordered'),
      date: u.date,
      time: u.time,
    });
    steps.push({
      id: "step-4",
      phase: 4,
      state: "pending",
      label: t('deficiency.timeline.step4OrderedPending'),
    });
    steps.push({
      id: "step-5",
      phase: 5,
      state: "pending",
      label: t('deficiency.timeline.step5FinalPending'),
    });
    return steps;
  }

  if (report.status === "PARTIALLY_COMMITTED") {
    const u = formatReportInstant(report.updated_at);
    steps.push({
      id: "step-3",
      phase: 3,
      state: "completed",
      label: t('deficiency.timeline.step3OrderedReady'),
    });
    steps.push({
      id: "step-4",
      phase: 4,
      state: "completed",
      label: t('deficiency.timeline.step4Partially'),
      date: u.date,
      time: u.time,
    });
    steps.push({
      id: "step-5",
      phase: 5,
      state: "pending",
      label: t('deficiency.timeline.step5Pending'),
    });
    return steps;
  }

  if (report.status === "COMMITTED") {
    const u = formatReportInstant(report.updated_at);
    steps.push({
      id: "step-3",
      phase: 3,
      state: "completed",
      label: t('deficiency.timeline.step3PurchaseApproved'),
    });
    steps.push({
      id: "step-4",
      phase: 4,
      state: "completed",
      label: t('deficiency.timeline.step4OrderedArrived'),
    });
    steps.push({
      id: "step-5",
      phase: 5,
      state: "completed",
      label: t('deficiency.timeline.step5Done'),
      date: u.date,
      time: u.time,
    });
    return steps;
  }

  return steps;
}

export function KdsDeficiencyStatusDrawer({
  activeStationId,
  collapsed = false,
}: Props) {
  const t = useTranslations("kds");
  const tw = useTranslations("warehouse");
  const translateTransferStatus = (code: string) =>
    (tw as unknown as (k: string) => string)(`status.transfer.${code}`);
  const translateDeficiencyStatus = (code: string) =>
    (tw as unknown as (k: string) => string)(`status.deficiency.${code}`);

  const [isOpen, setIsOpen] = useState(false);
  const [detailReport, setDetailReport] = useState<DeficiencyReport | null>(null);

  const { data: reports = [], isLoading } = useDeficiencyReports(
    { kitchen_station_id: activeStationId },
    {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    }
  );

  const stationReports = reports
    .filter((r) => r.kitchen_station === activeStationId)
    .slice(0, 10);

  const detailTimelineSteps = detailReport
    ? buildDeficiencyTimelineSteps(detailReport, t)
    : [];

  const detailHasReportItems = (detailReport?.items?.length ?? 0) > 0;
  const detailHasTransferLineItems =
    detailReport?.transfers?.some((t) => (t.items?.length ?? 0) > 0) ?? false;

  useEffect(() => {
    setDetailReport((prev) => {
      if (!prev) return prev;
      const fresh = reports.find((r) => r.id === prev.id);
      return fresh ?? null;
    });
  }, [reports]);

  const buttonContent = (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex shrink-0 items-center rounded-xl transition-colors duration-200",
        isOpen ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10",
        collapsed ? "size-11 justify-center p-0" : "h-11 gap-2 px-3"
      )}
      title={t('deficiency.tooltip')}
    >
      <History size={28} className="shrink-0" />
      {!collapsed && (
        <span className="max-w-[10rem] truncate text-xs font-semibold sm:text-sm">{t('deficiency.sidebarLabel')}</span>
      )}
    </button>
  );

  return (
    <div className="relative shrink-0">
      {collapsed ? (
        <TooltipProvider delay={0}>
          <Tooltip>
            <TooltipTrigger render={buttonContent} />
            <TooltipContent side="top" sideOffset={8} className="bg-popover text-popover-foreground border-border font-semibold text-xs">
              {t('deficiency.sidebarLabel')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        buttonContent
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label={t('inventory.close')}
            onClick={() => setIsOpen(false)}
          />
          <aside
            className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-lg"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted px-4 py-3">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-amber-500" />
                <h3 className="font-bold text-sm text-foreground">{t('deficiency.title')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="hover:bg-muted rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={t('inventory.close')}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3 bg-background">
              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="h-8 w-8 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
                  <span className="text-xs text-muted-foreground">{t('loading')}</span>
                </div>
              ) : stationReports.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
                  <AlertCircle size={40} className="opacity-20 mb-4" />
                  <span className="text-sm font-medium italic">{t('deficiency.emptyHistory')}</span>
                </div>
              ) : (
                stationReports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-muted border border-border hover:border-primary/30 rounded-xl p-3 shadow-sm flex flex-col gap-2 transition-[colors,border-color] group"
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="font-mono text-xs font-bold text-amber-400 truncate">
                        {report.report_number}
                      </span>
                      <StatusBadge domain="deficiency" status={report.status} />
                    </div>
                    
                    <div className="flex items-center justify-between gap-2 text-sub min-w-0">
                      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 shrink">
                        <Clock size={13} className="shrink-0" />
                        <span className="truncate">
                          {new Date(report.created_at).toLocaleDateString("tr-TR")} {new Date(report.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-foreground font-bold tabular-nums">
                          {t('deficiency.itemsCount', { count: report.items?.length ?? 0 })}
                        </span>
                      </div>
                    </div>

                    {report.transfers && report.transfers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {report.transfers.map((xfer) => (
                          <span
                            key={xfer.id}
                            className="text-2xs rounded px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/20 font-medium"
                          >
                            {xfer.transfer_number}: {translateTransferStatus(xfer.status)}
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        startTransition(() => setDetailReport(report));
                      }}
                      className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/5 hover:bg-amber-100 dark:hover:bg-amber-500/15 border border-amber-200 dark:border-amber-500/10 hover:border-amber-300 dark:hover:border-amber-500/30 transition-[colors,border-color]"
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                      {t('deficiency.viewDetails')}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-border bg-muted/50 text-sub text-muted-foreground font-medium italic text-center">
              {t('deficiency.limitNote')}
            </div>
          </aside>
        </div>
      )}

      {detailReport ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDetailReport(null);
          }}
        >
          <DialogContent
            backdropClassName="!backdrop-blur-none bg-black/60 motion-reduce:bg-black/70"
            showCloseButton
            className="flex h-[min(85vh,720px)] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl sm:w-full bg-background border-border shadow-lg"
          >
            <DialogHeader className="shrink-0 space-y-1 border-b border-border px-6 py-4 pr-10 bg-muted/50">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                <span className="font-mono text-amber-500">
                  {detailReport.report_number}
                </span>
                <StatusBadge domain="deficiency" status={detailReport.status} />
              </DialogTitle>
              <DialogDescription className="line-clamp-2 text-left text-xs font-medium text-muted-foreground">
                <span className="text-foreground">
                  {translateDeficiencyStatus(detailReport.status)}
                </span>
                <span className="mx-1.5">·</span>
                <span>{formatDate(detailReport.created_at)}</span>
                {detailReport.target_warehouse_name ? (
                  <>
                    <span className="mx-1.5">·</span>
                    <span>{detailReport.target_warehouse_name}</span>
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 min-h-[12rem] flex-1 flex-col md:grid md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(13rem,21rem)] md:divide-x md:divide-border">
              <div className="flex min-h-0 min-h-[200px] flex-1 flex-col md:min-h-0 bg-background">
                {detailHasReportItems ? (
                  <KdsDeficiencyReportItemsList items={detailReport.items ?? []} />
                ) : null}
                {detailHasTransferLineItems && detailReport.transfers ? (
                  <DeficiencyTransferFulfilledLines transfers={detailReport.transfers} variant="kds" />
                ) : null}
                {detailReport.transfers &&
                detailReport.transfers.length > 0 &&
                !detailHasTransferLineItems ? (
                  <div className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
                    <p className="text-2xs font-bold text-muted-foreground">{t('deficiency.transfersTitle')}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {detailReport.transfers.map((xfer) => (
                        <span
                          key={xfer.id}
                          className="text-2xs rounded-md border border-border bg-muted px-2 py-0.5 font-bold text-foreground"
                        >
                          {xfer.transfer_number}: {translateTransferStatus(xfer.status)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {!detailHasReportItems && !detailHasTransferLineItems ? (
                  <KdsDeficiencyReportItemsList
                    items={[]}
                    emptyDetailHint={
                      detailReport.status === "COMMITTED"
                        ? t('deficiency.allFulfilled')
                        : undefined
                    }
                  />
                ) : null}
              </div>
              <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden border-t border-border bg-muted/20 p-3 md:border-t-0 md:p-4">
                <VerticalStatusTimeline
                  title={t('deficiency.timelineTitle')}
                  steps={detailTimelineSteps}
                  className="border-0 bg-transparent p-0 shadow-none dark:bg-transparent dark:border-transparent"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
