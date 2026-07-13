"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useBranchContext } from "@/hooks/useBranchContext";
import api from "@/lib/api";
import { useTranslations } from "next-intl";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import { Activity, HelpCircle, RotateCcw } from "lucide-react";
import { PageLoadingState, AsyncStatePanel } from "@/components/ui/async-state";
import { SalesPeriodFilter, type SalesPeriodFilterI18n, type SalesPeriodPresetId } from "@/features/sales/components/SalesPeriodFilter";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { DashboardChartsSectionProps } from "@/app/dashboard/DashboardChartsSection";
import { DashboardAnomalies, type Anomaly } from "@/app/dashboard/DashboardAnomalies";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Dashboard bileşenleri — lazy load (sadece sayfa açıldığında yüklenir)
const DashboardKPIGrid = dynamic(
  () => import("@/features/dashboard/components/DashboardKPIGrid").then(m => m.DashboardKPIGrid),
  { ssr: false, loading: () => <PageLoadingState className="py-8" /> }
);
const DashboardBranchPerformance = dynamic(
  () => import("@/features/dashboard/components/DashboardBranchPerformance").then(m => m.DashboardBranchPerformance),
  { ssr: false, loading: () => <PageLoadingState className="py-8" /> }
);
const DashboardWarehouseStock = dynamic(
  () => import("@/features/dashboard/components/DashboardWarehouseStock").then(m => m.DashboardWarehouseStock),
  { ssr: false, loading: () => <PageLoadingState className="py-8" /> }
);
const DashboardConsumption = dynamic(
  () => import("@/features/dashboard/components/DashboardConsumption").then(m => m.DashboardConsumption),
  { ssr: false, loading: () => <PageLoadingState className="py-8" /> }
);
const DashboardWaste = dynamic(
  () => import("@/features/dashboard/components/DashboardWaste").then(m => m.DashboardWaste),
  { ssr: false, loading: () => <PageLoadingState className="py-8" /> }
);
const DashboardPaymentBreakdown = dynamic(
  () => import("@/features/dashboard/components/DashboardPaymentBreakdown").then(m => m.DashboardPaymentBreakdown),
  { ssr: false, loading: () => <PageLoadingState className="py-8" /> }
);

const DashboardChartsSection = dynamic(
  () =>
    import("@/app/dashboard/DashboardChartsSection").then((m) => ({
      default: m.DashboardChartsSection,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <PageLoadingState className="py-16" />
        <PageLoadingState className="py-16" />
      </div>
    ),
  },
);


/**
 * Anlık veri açıkken yoklama sıklığı. Sekme odakta değilken veya özellik kapalıyken ek istek yok
 * (refetchIntervalInBackground: false; interval false iken devre dışı).
 */
const DASHBOARD_LIVE_POLL_MS = 45_000;
const DASHBOARD_LIVE_POLL_SEC = Math.round(DASHBOARD_LIVE_POLL_MS / 1000);
const LIVE_DATA_SESSION_KEY = "ramis_dashboard_live_data";

const PAYMENT_BREAKDOWN_ORDER = ["CASH", "CARD", "OTHER"] as const;

function DashboardPageContent() {
  const t = useTranslations("dashboard");
  const canViewAmounts = useCanViewAmounts();
  const queryClient = useQueryClient();
  const { effectiveBranchId, branchName, showBranchPicker, branchList, setBranchOverride } =
    useBranchContext({ queryKey: "dashboard-bc" });
  const [dateRangePreset, setDateRangePreset] = useState<SalesPeriodPresetId>("today");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  /** Kapalıyken ek ağ yükü yok; açıkken yalnızca periyodik GET (DASHBOARD_LIVE_POLL_MS). Tercih oturum için sessionStorage'da tutulur. */
  const [liveData, setLiveData] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);

  const periodI18n = useMemo<SalesPeriodFilterI18n>(
    () => ({
      periodLabel: t("periodFilter.label"),
      selectPlaceholder: t("periodFilter.selectPlaceholder"),
      groupAriaLabel: t("periodFilter.groupAria"),
      selectAriaLabel: t("periodFilter.selectAria"),
      presets: {
        today: t("presets.today"),
        this_week: t("presets.this_week"),
        last_week: t("presets.last_week"),
        this_month: t("presets.this_month"),
        last_month: t("presets.last_month"),
        last_3_months: t("presets.last_3_months"),
        last_6_months: t("presets.last_6_months"),
        last_9_months: t("presets.last_9_months"),
        this_year: t("presets.this_year"),
        custom: t("presets.custom"),
      },
    }),
    [t]
  );

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage.getItem(LIVE_DATA_SESSION_KEY) === "1") {
        setLiveData(true);
      }
    } catch {
      /* gizli mod / depolama kapalı */
    }
  }, []);

  useEffect(() => {
    if (!liveData || !effectiveBranchId) return;
    void queryClient.invalidateQueries({ queryKey: ["dash-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["dash-chart"] });
  }, [liveData, effectiveBranchId, queryClient]);

  const livePollOptions = {
    refetchInterval: liveData ? DASHBOARD_LIVE_POLL_MS : false,
    refetchIntervalInBackground: false,
  } as const;

  const summary = useQuery({
    queryKey: ["dash-summary", effectiveBranchId, startDate, endDate],
    queryFn: async () => {
      const bid = effectiveBranchId === "ALL" ? undefined : (effectiveBranchId || undefined);
      const { data } = await api.get("/dashboard/summary/", {
        params: { branch_id: bid, start_date: startDate, end_date: endDate },
      });
      return data as {
        revenue: { today: number; yesterday: number; change_pct: number; sparkline_data?: { date: string; value: number }[] };
        order_count: { today: number; yesterday: number; change_pct: number; sparkline_data?: { date: string; value: number }[] };
        avg_order_value: number;
        target_stats: { month_revenue: number; target_revenue: number; percentage: number };
        top_products: { name: string; quantity: number; revenue: number }[];
        category_breakdown?: { category: string; revenue: number }[];
        payment_breakdown: Record<string, number>;
        active_shift: { id: string; opened_at: string; opening_cash: number; branch_id: string } | null;
        branch_revenue?: { branch_id: string; branch_name: string; revenue: number }[];
        anomalies?: Anomaly[];
      };
    },
    enabled: !!effectiveBranchId,
    ...livePollOptions,
  });

  const chart = useQuery({
    queryKey: ["dash-chart", effectiveBranchId, startDate, endDate],
    queryFn: async () => {
      const bid = effectiveBranchId === "ALL" ? undefined : (effectiveBranchId || undefined);
      const { data } = await api.get("/dashboard/revenue-chart/", {
        params: { branch_id: bid, start_date: startDate, end_date: endDate },
      });
      return data as { date: string; revenue: number }[];
    },
    enabled: !!effectiveBranchId,
    ...livePollOptions,
  });

  const inventory = useQuery({
    queryKey: ["dash-inv", effectiveBranchId, startDate, endDate],
    queryFn: async () => {
      const bid = effectiveBranchId === "ALL" ? undefined : (effectiveBranchId || undefined);
      const { data } = await api.get("/dashboard/inventory/", {
        params: {
          branch_id: bid,
          start_date: startDate,
          end_date: endDate,
          limit: 10,
        },
      });
      return data as {
        low_stock_count: number;
        stock_value: number;
        warehouse_values: { warehouse_id: string; warehouse_name: string; warehouse_code: string; value: number }[];
        waste_ratio: number;
        consumption_top: { stock_item_id: string; name: string; sku: string; unit: string; consumed: number }[];
        waste_top: { stock_item_id: string; name: string; sku: string; unit: string; waste: number }[];
      };
    },
    enabled: !!effectiveBranchId,
    ...livePollOptions,
  });

  const chartsProps = useMemo<DashboardChartsSectionProps>(
    () => ({
      revenueSeries: chart.data ?? [],
      categoryRows: summary.data?.category_breakdown ?? [],
      canViewAmounts,
    }),
    [chart.data, summary.data?.category_breakdown, canViewAmounts],
  );

  const payData = useMemo(() => {
    const p = summary.data?.payment_breakdown;
    if (!p) return [];
    const methodLabel = (code: string) => {
      if (code === "CASH") return t("paymentMethods.cash");
      if (code === "CARD") return t("paymentMethods.card");
      if (code === "OTHER") return t("paymentMethods.other");
      return code;
    };
    const rows: { key: string; label: string; value: number }[] = [];
    const seen = new Set<string>();
    for (const k of PAYMENT_BREAKDOWN_ORDER) {
      if (k in p) {
        rows.push({ key: k, label: methodLabel(k), value: Number(p[k]) });
        seen.add(k);
      }
    }
    for (const k of Object.keys(p)) {
      if (!seen.has(k)) {
        rows.push({ key: k, label: methodLabel(k), value: Number(p[k]) });
      }
    }
    return rows;
  }, [summary.data, t]);

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-auto p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("subtitle", {
                branch: effectiveBranchId === "ALL" ? t("allBranches") : (branchName ?? ""),
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showBranchPicker && (
              (() => {
                const selLabel = effectiveBranchId === "ALL"
                  ? t("allBranches")
                  : (branchList.find(b => b.id === effectiveBranchId)?.name || effectiveBranchId);
                return (
              <Select value={effectiveBranchId} onValueChange={(val) => { if (val) setBranchOverride(val); }}>
                <SelectTrigger className="w-fit rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">
                  <span className="truncate">{selLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  {branchList.length > 1 && (
                    <SelectItem value="ALL">{t("allBranches")}</SelectItem>
                  )}
                  {branchList.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
                );
              })()
            )}
            <SalesPeriodFilter
              activePreset={dateRangePreset}
              onSelect={(preset, range) => {
                if (preset !== "custom") {
                  setStartDate(range.start);
                  setEndDate(range.end);
                }
                setDateRangePreset(preset);
              }}
              variant="list"
              i18n={periodI18n}
            />
            {dateRangePreset === "custom" && (
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                  className="h-9 rounded-md border border-border bg-card px-2 py-1 text-sm text-card-foreground"
                />
                <span className="text-muted-foreground text-sm">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="h-9 rounded-md border border-border bg-card px-2 py-1 text-sm text-card-foreground"
                />
              </div>
            )}
            {dateRangePreset !== "today" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  setStartDate(today);
                  setEndDate(today);
                  setDateRangePreset("today");
                }}
                className="h-9 px-2 text-muted-foreground hover:text-destructive"
              >
                <RotateCcw size={14} className="mr-1.5" />
                {t("resetToToday")}
              </Button>
            )}
            <TooltipProvider delay={400}>
              <div className="flex items-center rounded-lg border border-border bg-card">
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                  <Activity
                    size={16}
                    className={`shrink-0 ${liveData ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                    aria-hidden
                  />
                  <span className="whitespace-nowrap text-foreground">{t("liveData.label")}</span>
                  <Switch
                    checked={liveData}
                    onCheckedChange={(on) => {
                      setLiveData(on);
                      try {
                        if (typeof window !== "undefined") {
                          if (on) window.sessionStorage.setItem(LIVE_DATA_SESSION_KEY, "1");
                          else window.sessionStorage.removeItem(LIVE_DATA_SESSION_KEY);
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                    size="sm"
                    aria-label={t("liveData.ariaSwitch")}
                  />
                </label>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        className="mr-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={t("liveData.helpAria")}
                      >
                        <HelpCircle size={16} aria-hidden />
                      </button>
                    }
                  />
                  <TooltipContent
                    side="bottom"
                    sideOffset={8}
                    className="max-w-xs text-left text-xs font-normal leading-snug"
                  >
                    {t("liveData.tooltip", { seconds: DASHBOARD_LIVE_POLL_SEC })}
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </div>

        {!effectiveBranchId ? (
          <p className="text-sm text-amber-700">{t("branchRequired")}</p>
        ) : summary.isLoading ? (
          <PageLoadingState />
        ) : summary.isError ? (
          <AsyncStatePanel
            variant="error"
            description={t("loadError")}
            onRetry={() => void summary.refetch()}
          />
        ) : (
          <>
            <DashboardAnomalies 
              anomalies={summary.data?.anomalies || []} 
              onSelectAnomaly={setSelectedAnomaly} 
            />

            <Dialog open={!!selectedAnomaly} onOpenChange={(o) => !o && setSelectedAnomaly(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{selectedAnomaly?.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t.rich("anomalyDialog.intro", {
                      bold: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                  <div className="rounded-xl bg-muted p-4">
                    <p className="mb-2 font-bold text-foreground">{t("anomalyDialog.ruleTitle")}</p>
                    <ul className="list-inside list-disc space-y-2 text-xs text-muted-foreground">
                      <li>{t("anomalyDialog.rule1")}</li>
                      <li>
                        {t.rich("anomalyDialog.rule2", {
                          bold: (chunks) => <strong>{chunks}</strong>,
                        })}
                      </li>
                      <li>{t("anomalyDialog.rule3")}</li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <DashboardKPIGrid
              revenue={summary.data?.revenue}
              orderCount={summary.data?.order_count}
              targetStats={summary.data?.target_stats}
              avgOrderValue={summary.data?.avg_order_value}
              activeShift={summary.data?.active_shift}
              canViewAmounts={canViewAmounts}
              dateRangePreset={dateRangePreset}
              lowStockCount={inventory.data?.low_stock_count}
              stockValue={inventory.data?.stock_value}
              wasteRatio={inventory.data?.waste_ratio}
              inventoryLoading={inventory.isLoading}
            />


            {(effectiveBranchId === "ALL" || (summary.data?.branch_revenue?.length ?? 0) > 1) && (
              <DashboardBranchPerformance
                branchRevenue={summary.data?.branch_revenue}
                isLoading={summary.isLoading}
                canViewAmounts={canViewAmounts}
                className="mb-6"
              />
            )}
            <DashboardWarehouseStock
              warehouseValues={inventory.data?.warehouse_values}
              isLoading={inventory.isLoading}
              canViewAmounts={canViewAmounts}
              className="mb-6"
            />

            <DashboardConsumption
              consumptionTop={inventory.data?.consumption_top}
              isLoading={inventory.isLoading}
              className="mb-6"
            />

            <DashboardWaste
              wasteTop={inventory.data?.waste_top}
              isLoading={inventory.isLoading}
              className="mb-6"
            />

            <DashboardChartsSection
              key={`charts-${effectiveBranchId}-${startDate}-${endDate}`}
              {...chartsProps}
            />

            <DashboardPaymentBreakdown
              payData={payData}
              topProducts={summary.data?.top_products}
              canViewAmounts={canViewAmounts}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard module="dashboard">
      <DashboardPageContent />
    </AuthGuard>
  );
}
