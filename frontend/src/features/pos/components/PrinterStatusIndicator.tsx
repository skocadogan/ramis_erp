"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Printer as PrinterIcon, XCircle, RefreshCw, Send, ChevronDown } from "lucide-react";
import { usePosStore } from "@/store/usePosStore";
import { useShallow } from "zustand/react/shallow";
import { printersApi, type Printer } from "@/features/printing/services/printersApi";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface PrinterStatusIndicatorProps {
  branchId: string;
  className?: string;
  /** POS: yazıcı adı/metni yalnızca 1920×1080+; varsayılan `lg` (garson başlığı) */
  labelBreakpoint?: "lg" | "fullhd";
}

function printersQueryKey(branchId: string) {
  return ["printers", branchId] as const;
}

function mergePrinterIntoList(allPrinters: Printer[], updated: Printer): Printer[] {
  const idx = allPrinters.findIndex((p) => p.id === updated.id);
  if (idx === -1) return allPrinters;
  const next = allPrinters.slice();
  next[idx] = updated;
  return next;
}

function buildConfiguredPrinterIds(
  allPrinters: Printer[],
  paymentPrinters: { printerId: string }[],
  autoPrintOrder: boolean,
): Set<string> {
  return new Set<string>(
    [
      ...paymentPrinters.map((p) => p.printerId),
      ...(autoPrintOrder
        ? allPrinters
            .filter(
              (p) =>
                p.usage_type === "KITCHEN" &&
                p.is_active &&
                p.kitchen_station &&
                p.receipt_template_slug,
            )
            .map((p) => p.id)
        : []),
    ].filter(Boolean),
  );
}

export function PrinterStatusIndicator({
  branchId,
  className,
  labelBreakpoint = "lg",
}: PrinterStatusIndicatorProps) {
  const t = useTranslations("pos.misc.printer");
  const queryClient = useQueryClient();
  const { autoPrintOrder, paymentPrinters } = usePosStore(
    useShallow((s) => ({
      autoPrintOrder: s.autoPrintOrder,
      paymentPrinters: s.paymentPrinters,
    }))
  );

  const queryKey = useMemo(() => printersQueryKey(branchId), [branchId]);

  const { data: allPrinters = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await printersApi.getPrinters({ branch_id: branchId, is_active: true });
      return "results" in data ? (data.results as Printer[]) : (data as unknown as Printer[]);
    },
    enabled: !!branchId,
    staleTime: 0,
    refetchOnMount: "always",
    structuralSharing: false,
    refetchInterval: 30_000,
  });

  const configuredPrinterIds = useMemo(
    () => buildConfiguredPrinterIds(allPrinters, paymentPrinters, autoPrintOrder),
    [allPrinters, paymentPrinters, autoPrintOrder],
  );

  const configuredIdsKey = useMemo(
    () => [...configuredPrinterIds].sort().join(","),
    [configuredPrinterIds],
  );

  const printers = useMemo(
    () => allPrinters.filter((p) => configuredPrinterIds.has(p.id)),
    [allPrinters, configuredPrinterIds],
  );

  // POS ayarları (localStorage / sunucu) yüklendikten sonra görünür yazıcı kümesi değişebilir.
  useEffect(() => {
    if (!branchId || configuredPrinterIds.size === 0) return;
    void queryClient.invalidateQueries({ queryKey });
  }, [branchId, configuredIdsKey, configuredPrinterIds.size, queryClient, queryKey]);

  const syncStatusMutation = useMutation({
    mutationFn: async (printerIds: string[]) => {
      const ids =
        printerIds.length > 0 ? printerIds : printers.map((p) => p.id);
      if (ids.length === 0) return;

      const results = await Promise.allSettled(
        ids.map((id) => printersApi.syncPrinterStatus(id)),
      );

      let successCount = 0;
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        successCount += 1;
        queryClient.setQueryData<Printer[]>(queryKey, (old) =>
          old ? mergePrinterIntoList(old, result.value) : old,
        );
      }

      const firstFailure = results.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (successCount === 0 && firstFailure) {
        throw firstFailure.reason;
      }

      await queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: () => {
      toast.success(t("syncSuccess"));
    },
    onError: (error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      toast.error(t("syncError") + (err?.response?.data?.message || err.message));
    },
  });

  const syncAllStatuses = () => {
    syncStatusMutation.mutate(printers.map((p) => p.id));
  };

  const testPrintMutation = useMutation({
    mutationFn: (printerId: string) => printersApi.testPrint(printerId),
    onSuccess: () => {
      toast.success(t("testPrintSuccess"));
    },
    onError: (error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      toast.error(t("testPrintError") + (err?.response?.data?.message || err.message));
    },
  });

  if (isLoading || printers.length === 0) return null;

  const getStatusColor = (printer: Printer) => {
    if (!printer.status_info?.online) return "bg-rose-500";
    if (printer.status_info?.paper === "out") return "bg-orange-500";
    if (printer.status_info?.paper === "low") return "bg-amber-400";
    return "bg-green-500";
  };

  const getStatusText = (printer: Printer) => {
    if (!printer.status_info?.online) return t("offline");
    if (printer.status_info?.paper === "out") return t("paperOut");
    if (printer.status_info?.paper === "low") return t("paperLow");
    return t("online");
  };

  const handleTestPrint = (e: React.MouseEvent, printerId: string) => {
    e.stopPropagation();
    testPrintMutation.mutate(printerId);
  };

  if (printers.length === 1) {
    const printer = printers[0];
    const colorClass = getStatusColor(printer);

    return (
      <button
        onClick={syncAllStatuses}
        disabled={syncStatusMutation.isPending}
        className={cn(
          "flex h-10 items-center gap-2 rounded-lg border border-border text-muted-foreground shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 border-border bg-card dark:hover:border-blue-700 dark:hover: dark:hover:text-blue-400",
          labelBreakpoint === "fullhd" ? "px-2 fullhd:px-3" : "px-3",
          className,
        )}
        title={`${printer.name} - ${getStatusText(printer)} - ${t("refresh")}`}
      >
        <div className="relative">
          <PrinterIcon size={18} />
          <div className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white ", colorClass)} />
        </div>
        <span
          className={cn(
            "hidden max-w-[100px] truncate text-xs font-semibold",
            labelBreakpoint === "fullhd" ? "fullhd:inline" : "lg:inline",
          )}
        >
          {printer.name}
        </span>
      </button>
    );
  }

  // Çoklu yazıcı durumu
  const allOnline = printers.every(p => p.status_info?.online);
  const anyPaperIssue = printers.some(p => p.status_info?.paper === "out" || p.status_info?.paper === "low");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-10 items-center gap-2 rounded-lg border border-border text-muted-foreground shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 border-border bg-card dark:hover:border-blue-700 dark:hover: dark:hover:text-blue-400",
          labelBreakpoint === "fullhd" ? "px-2 fullhd:px-3" : "px-3",
          className,
        )}
      >
        <div className="relative">
          <PrinterIcon size={18} />
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white ",
            !allOnline ? "bg-rose-500" : (anyPaperIssue ? "bg-amber-400" : "bg-green-500")
          )} />
        </div>
        <span
          className={cn(
            "hidden text-xs font-semibold",
            labelBreakpoint === "fullhd" ? "fullhd:inline" : "lg:inline",
          )}
        >
          {printers.length} {t("count", { count: printers.length })}
        </span>
        <ChevronDown size={14} className="opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-2xs font-bold tracking-widertext-muted-foreground">
            {t("statusTitle")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {printers.map((printer) => {
            const statusColor = getStatusColor(printer);
            const statusText = getStatusText(printer);

            return (
              <DropdownMenuItem
                key={printer.id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 focus: dark:focus:"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <PrinterIcon size={14} className="text-muted-foreground" />
                    <div className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white ", statusColor)} />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-bold text-foreground">
                      {printer.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-3xs font-bold",
                        !printer.status_info?.online ? "text-rose-500" : "text-muted-foreground"
                      )}>
                        {statusText}
                      </span>
                      <span className="text-3xs text-muted-foreground">•</span>
                      <span className="truncate text-3xs text-muted-foreground">
                        {printer.connection_type === "NETWORK" ? printer.ip_address : "USB"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {printer.status_info?.error && (
                    <div className="flex h-6 w-6 items-center justify-center text-rose-500" title={printer.status_info.error}>
                      <XCircle size={14} />
                    </div>
                  )}
                  <button
                    onClick={(e) => handleTestPrint(e, printer.id)}
                    disabled={testPrintMutation.isPending || !printer.status_info?.online}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                    title={t("testPrint")}
                  >
                    {testPrintMutation.isPending && testPrintMutation.variables === printer.id ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </div>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={syncAllStatuses}
            disabled={syncStatusMutation.isPending}
            className="justify-center py-2 text-2xs font-bold text-blue-600 dark:text-blue-400 focus:text-blue-700"
          >
            <RefreshCw size={12} className={cn("mr-1.5", syncStatusMutation.isPending && "animate-spin")} />
            {syncStatusMutation.isPending ? t("checking") : t("refreshAll")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
