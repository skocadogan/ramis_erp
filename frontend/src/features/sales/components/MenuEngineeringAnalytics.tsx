"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
    AlertTriangle,
    ChessKnight,
    Dog,
    FileSpreadsheet,
    Filter,
    Loader2,
    Puzzle,
    RotateCcw,
    Sigma,
    Star,
    Target,
    TrendingUp,
    Layers,
} from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SalesPeriodFilter, type SalesPeriodFilterI18n, SalesPeriodPresetId } from "./SalesPeriodFilter";
import { ProductCategorySelect } from "./ProductCategorySelect";
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table";
import { adminApi } from "@/features/admin/services/adminApi";
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton";
import { AMOUNT_DISPLAY_MASK, formatAmount, formatDate, formatNumber } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import {
    formatStockMovementReference,
    getStockMovementTypeLabel,
    stockMovementTypeBadgeClass,
} from "@/lib/stockMovementDisplay";
import type {
    MenuEngineeringAction,
    MenuEngineeringAnalyticsData,
    MenuEngineeringClass,
    MenuEngineeringRow,
    StockVarianceItem,
} from "../types";
import { CombinedProductCompositionDialog } from "./CombinedProductCompositionDialog";

interface MenuEngineeringAnalyticsProps {
    branchId: string;
    startDate: string;
    endDate: string;
    dateRangePreset: SalesPeriodPresetId | null;
    periodI18n: SalesPeriodFilterI18n;
    onDateSelect: (preset: SalesPeriodPresetId, range: { start: string; end: string }) => void;
    onStartDateChange: (val: string) => void;
    onEndDateChange: (val: string) => void;
}

const MENU_CLASSES: MenuEngineeringClass[] = ["STAR", "PLOWHORSE", "PUZZLE", "DOG"];
const MENU_ACTIONS: MenuEngineeringAction[] = ["INCREASE_PRICE", "FEATURE", "REMOVE_FROM_MENU", "COST_INCREASED"];
type AnalysisMode = "estimated" | "actual";

function actionBadgeClass(action: MenuEngineeringAction): string {
    if (action === "INCREASE_PRICE") {
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
    }
    if (action === "FEATURE") {
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
    }
    if (action === "REMOVE_FROM_MENU") {
        return "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300";
    }
    return "bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300";
}

function formatPercent(value: number | null, canViewAmounts: boolean): string {
    if (!canViewAmounts) return AMOUNT_DISPLAY_MASK;
    if (value == null) return "—";
    return `%${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rowBadgeClass(menuClass: MenuEngineeringClass | null): string {
    if (menuClass === "STAR") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300";
    if (menuClass === "PLOWHORSE") return "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300";
    if (menuClass === "PUZZLE") return "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300";
    if (menuClass === "DOG") return "  bg-muted text-muted-foreground";
    return "  bg-muted text-muted-foreground";
}

function buildVarianceLine(item: StockVarianceItem): string {
    const parts: string[] = [];
    if (item.waste_qty > 0) parts.push(`W ${formatNumber(item.waste_qty, { maximumFractionDigits: 2 })}`);
    if (item.cancel_qty > 0) parts.push(`C ${formatNumber(item.cancel_qty, { maximumFractionDigits: 2 })}`);
    if (item.return_qty > 0) parts.push(`R ${formatNumber(item.return_qty, { maximumFractionDigits: 2 })}`);
    if (item.disposal_qty > 0) parts.push(`D ${formatNumber(item.disposal_qty, { maximumFractionDigits: 2 })}`);
    if (item.adjustment_qty > 0) parts.push(`A ${formatNumber(item.adjustment_qty, { maximumFractionDigits: 2 })}`);
    return parts.join(" • ");
}

function getClassCount(
    data: MenuEngineeringAnalyticsData | undefined,
    mode: AnalysisMode,
    menuClass: MenuEngineeringClass,
): number {
    const summary = mode === "actual" ? data?.actual_summary : data?.summary;
    if (menuClass === "STAR") return summary?.stars_count ?? 0;
    if (menuClass === "PLOWHORSE") return summary?.plowhorses_count ?? 0;
    if (menuClass === "PUZZLE") return summary?.puzzlers_count ?? 0;
    return summary?.dogs_count ?? 0;
}

function MenuClassIcon({
    menuClass,
    className,
}: {
    menuClass: MenuEngineeringClass;
    className?: string;
}) {
    const iconProps = { size: 16, className };

    if (menuClass === "STAR") return <Star {...iconProps} />;
    if (menuClass === "PLOWHORSE") return <ChessKnight {...iconProps} />;
    if (menuClass === "PUZZLE") return <Puzzle {...iconProps} />;
    if (menuClass === "DOG") return <Dog {...iconProps} />;

    return null;
}

function menuClassIconClass(menuClass: MenuEngineeringClass): string {
    if (menuClass === "STAR") return "text-emerald-500";
    if (menuClass === "PLOWHORSE") return "text-amber-500";
    if (menuClass === "PUZZLE") return "text-blue-500";
    return "";
}

export function MenuEngineeringAnalytics({
    branchId,
    startDate,
    endDate,
    dateRangePreset,
    periodI18n,
    onDateSelect,
    onStartDateChange,
    onEndDateChange,
}: MenuEngineeringAnalyticsProps) {
    const t = useTranslations("sales");
    const tInventory = useTranslations("inventory");
    const tInventoryReason = useTranslations("inventory.returnCancelReason");
    const canViewAmounts = useCanViewAmounts();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>("ALL");
    const [selectedMenuClass, setSelectedMenuClass] = useState<string>("ALL");
    const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("estimated");
    const [isExporting, setIsExporting] = useState(false);
    const [combinedProductRow, setCombinedProductRow] = useState<MenuEngineeringRow | null>(null);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: [
            "menu-engineering",
            branchId,
            startDate,
            endDate,
            selectedProductId,
            selectedCategoryId,
            selectedMenuClass,
            analysisMode,
        ],
        queryFn: async () => {
            const bid = branchId === "ALL" ? undefined : branchId;
            const response = await api.get("/dashboard/menu-engineering/", {
                params: {
                    branch_id: bid,
                    start_date: startDate,
                    end_date: endDate,
                    product_id: selectedProductId || undefined,
                    category_id: selectedCategoryId !== "ALL" ? selectedCategoryId : undefined,
                    menu_class: selectedMenuClass !== "ALL" ? selectedMenuClass : undefined,
                    limit: 5,
                },
            });
            return response.data as MenuEngineeringAnalyticsData;
        },
        enabled: !!branchId,
    });

    const categoryOptions = useMemo(
        () =>
            (data?.products ?? [])
                .reduce<Array<{ id: string; name: string }>>((acc, row) => {
                    if (!row.category_id || acc.some((item) => item.id === row.category_id)) {
                        return acc;
                    }
                    acc.push({ id: row.category_id, name: row.category_name });
                    return acc;
                }, [])
                .sort((a, b) => a.name.localeCompare(b.name, "tr")),
        [data?.products],
    );

    const filteredRows = useMemo(() => {
        const rows = data?.products ?? [];
        const search = searchTerm.trim().toLowerCase();
        if (!search) return rows;
        const filtered = rows.filter((row) =>
            row.product_name.toLowerCase().includes(search) ||
            row.category_name.toLowerCase().includes(search)
        );
        return filtered.toSorted((a, b) => {
            const profitA = analysisMode === "actual" ? (a.actual_gross_profit ?? -1) : (a.estimated_gross_profit ?? -1);
            const profitB = analysisMode === "actual" ? (b.actual_gross_profit ?? -1) : (b.estimated_gross_profit ?? -1);
            return profitB - profitA || b.revenue - a.revenue || a.product_name.localeCompare(b.product_name, "tr");
        });
    }, [analysisMode, data?.products, searchTerm]);

  const hasCustomFilters = Boolean(
    searchTerm.trim() ||
    selectedProductId ||
    selectedCategoryId !== "ALL" ||
    selectedMenuClass !== "ALL",
  );

  const exportParams = useMemo(() => ({
    branch_id: branchId === "ALL" ? undefined : branchId,
    start_date: startDate,
    end_date: endDate,
    product_id: selectedProductId || undefined,
    category_id: selectedCategoryId !== "ALL" ? selectedCategoryId : undefined,
    menu_class: selectedMenuClass !== "ALL" ? selectedMenuClass : undefined,
    analysis_mode: analysisMode,
    limit: 5,
  }), [branchId, startDate, endDate, selectedProductId, selectedCategoryId, selectedMenuClass, analysisMode]);

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading(t("export.excelLoading"));
    try {
      const blob = await adminApi.generateModuleReport("menu-engineering-analytics", exportParams, "excel");
      const url = window.URL.createObjectURL(new Blob([blob as BlobPart]));
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      link.setAttribute("download", t("export.menuEngineeringExcel", { date: dateStr }));
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t("export.excelSuccess"), { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error(t("export.excelError"), { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader2 className="animate-spin text-blue-600" size={32} />
                <span className="text-sm font-medium text-muted-foreground">
                    {t("menuEngineering.loading")}
                </span>
            </div>
        );
    }

    const summary = data?.summary;
    const actualSummary = data?.actual_summary;
    const variance = data?.stock_variance_summary;
    const activeSummary = analysisMode === "actual" ? actualSummary : summary;

    return (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-card border-border shrink-0">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                        <Filter size={16} />
                        <span className="text-ui font-medium">{t("menuEngineering.filterLabel")}</span>
                    </div>

                    <div className="w-full sm:w-64">
                        <ProductCategorySelect
                            value={selectedProductId}
                            onSelect={setSelectedProductId}
                        />
                    </div>

                    <select
                        value={selectedCategoryId}
                        onChange={(event) => setSelectedCategoryId(event.target.value)}
                        className="h-9 rounded-md border border-border px-3 text-sm bg-muted border-input text-foreground"
                    >
                        <option value="ALL">{t("menuEngineering.allCategories")}</option>
                        {categoryOptions.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={selectedMenuClass}
                        onChange={(event) => setSelectedMenuClass(event.target.value)}
                        className="h-9 rounded-md border border-border px-3 text-sm bg-muted border-input text-foreground"
                    >
                        <option value="ALL">{t("menuEngineering.allClasses")}</option>
                        {MENU_CLASSES.map((menuClass) => (
                            <option key={menuClass} value={menuClass}>
                                {t(`menuEngineering.classes.${menuClass}`)}
                            </option>
                        ))}
                    </select>

                    <SalesPeriodFilter
                        variant="list"
                        activePreset={dateRangePreset}
                        onSelect={onDateSelect}
                        i18n={periodI18n}
                    />

                    {dateRangePreset === "custom" && (
                        <div className="flex items-center gap-1.5 shrink-0">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(event) => onStartDateChange(event.target.value)}
                                max={endDate}
                                className="border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground h-9"
                            />
                            <span className="text-muted-foreground text-sm">-</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(event) => onEndDateChange(event.target.value)}
                                min={startDate}
                                className="border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground h-9"
                            />
                        </div>
                    )}

                    <input
                        type="search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder={t("menuEngineering.searchPlaceholder")}
                        className="h-9 w-full sm:w-56 rounded-md border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground"
                    />

                    {hasCustomFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearchTerm("");
                                setSelectedProductId(null);
                                setSelectedCategoryId("ALL");
                                setSelectedMenuClass("ALL");
                            }}
                            className="h-9 px-2 text-muted-foreground hover:text-blue-600"
                        >
                            <RotateCcw size={14} className="mr-1.5" />
                            {t("menuEngineering.clearFilters")}
                        </Button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isExporting || isFetching}
                        onClick={() => void handleExportExcel()}
                        className="h-9 px-2.5 text-emerald-600 border-emerald-100 hover:bg-emerald-50 dark:border-emerald-900/30 dark:hover:bg-emerald-950/20"
                    >
                        <FileSpreadsheet size={14} className="mr-1.5" />
                        {isExporting ? t("list.exportBusy") : t("productAnalytics.formatExcel")}
                    </Button>
                    <AsyncPdfExportButton
                        reportSlug="menu-engineering-analytics"
                        params={exportParams}
                        filename={t("export.menuEngineeringPdf", { date: new Date().toISOString().split("T")[0] })}
                        size="sm"
                        className="h-9 px-2.5 text-rose-600 border-rose-100 hover:bg-rose-50 dark:border-rose-900/30 dark:hover:bg-rose-950/20"
                    />
                </div>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-100">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="font-semibold">
                            {analysisMode === "actual"
                                ? t("menuEngineering.actualDisclaimerTitle")
                                : t("menuEngineering.disclaimerTitle")}
                        </div>
                        <div className="mt-1 text-blue-800/90 dark:text-blue-100/80">
                            {analysisMode === "actual"
                                ? t("menuEngineering.actualDisclaimerBody")
                                : t("menuEngineering.disclaimerBody")}
                        </div>
                    </div>
                    <div className="inline-flex rounded-lg border border-blue-200 bg-white/80 p-1 dark:border-blue-900/50 bg-card/30">
                        <button
                            type="button"
                            onClick={() => setAnalysisMode("estimated")}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
 analysisMode === "estimated"
 ? "bg-blue-600 text-white"
 : "text-blue-900 hover:bg-blue-100 dark:text-blue-100 dark:hover:bg-blue-900/40"
 }`}
                        >
                            {t("menuEngineering.analysisModes.estimated")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setAnalysisMode("actual")}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
 analysisMode === "actual"
 ? "bg-blue-600 text-white"
 : "text-blue-900 hover:bg-blue-100 dark:text-blue-100 dark:hover:bg-blue-900/40"
 }`}
                        >
                            {t("menuEngineering.analysisModes.actual")}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border p-4 shadow-sm bg-card border-border">
                    <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                        <Sigma size={16} />
                        <span className="text-2xs font-bold uppercase tracking-wider">{t("menuEngineering.stats.totalProducts")}</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{activeSummary?.total_products ?? 0}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t("menuEngineering.stats.classifiedProductsLine", { count: activeSummary?.classified_products ?? 0 })}
                    </p>
                </div>
                <div className="rounded-xl border border-border p-4 shadow-sm bg-card border-border">
                    <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                        <Target size={16} className="text-emerald-500" />
                        <span className="text-2xs font-bold uppercase tracking-wider">
                            {analysisMode === "actual"
                                ? t("menuEngineering.stats.totalActualProfit")
                                : t("menuEngineering.stats.totalEstimatedProfit")}
                        </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                        {formatAmount(
                            analysisMode === "actual"
                                ? actualSummary?.total_actual_profit ?? 0
                                : summary?.total_estimated_profit ?? 0,
                            canViewAmounts,
                        )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                            analysisMode === "actual"
                                ? "menuEngineering.stats.actualProfitThresholdLine"
                                : "menuEngineering.stats.profitThresholdLine",
                            {
                            amount: canViewAmounts
                                ? formatAmount(activeSummary?.profit_threshold_amount ?? 0, true)
                                : AMOUNT_DISPLAY_MASK,
                            },
                        )}
                    </p>
                </div>
                <div className="rounded-xl border border-border p-4 shadow-sm bg-card border-border">
                    <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                        <TrendingUp size={16} className="text-blue-500" />
                        <span className="text-2xs font-bold uppercase tracking-wider">
                            {analysisMode === "actual"
                                ? t("menuEngineering.stats.avgActualMargin")
                                : t("menuEngineering.stats.avgMargin")}
                        </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                        {formatPercent(
                            analysisMode === "actual"
                                ? actualSummary?.avg_actual_margin_pct ?? 0
                                : summary?.avg_estimated_margin_pct ?? 0,
                            canViewAmounts,
                        )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                            analysisMode === "actual"
                                ? "menuEngineering.stats.actualPopularityThresholdLine"
                                : "menuEngineering.stats.popularityThresholdLine",
                            {
                                qty: formatNumber(activeSummary?.popularity_threshold_qty ?? 0, { maximumFractionDigits: 2 }),
                            },
                        )}
                    </p>
                </div>
                <div className="rounded-xl border border-border p-4 shadow-sm bg-card border-border">
                    <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                        <AlertTriangle size={16} className="text-amber-500" />
                        <span className="text-2xs font-bold uppercase tracking-wider">
                            {analysisMode === "actual"
                                ? t("menuEngineering.stats.actualCoverage")
                                : t("menuEngineering.stats.stockVarianceCost")}
                        </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                        {analysisMode === "actual"
                            ? `${actualSummary?.fully_costed_products ?? 0}`
                            : formatAmount(variance?.totals.total_variance_cost ?? 0, canViewAmounts)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {analysisMode === "actual"
                            ? t("menuEngineering.stats.actualCoverageLine", {
                                full: actualSummary?.fully_costed_products ?? 0,
                                partial: actualSummary?.partial_coverage_products ?? 0,
                                none: actualSummary?.uncovered_products ?? 0,
                            })
                            : t("menuEngineering.stats.stockVarianceQtyLine", {
                                qty: formatNumber(variance?.totals.total_variance_qty ?? 0, { maximumFractionDigits: 2 }),
                            })}
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                {MENU_CLASSES.map((menuClass) => {
                    const count = getClassCount(data, analysisMode, menuClass);
                    return (
                        <button
                            key={menuClass}
                            type="button"
                            onClick={() => setSelectedMenuClass((current) => current === menuClass ? "ALL" : menuClass)}
                            className={`rounded-xl border px-4 py-3 text-left shadow-sm transition-colors ${
 selectedMenuClass === menuClass
 ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
 : "border-border bg-card border-border"
 }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className={`inline-flex rounded-full px-2 py-1 text-sm font-bold ${rowBadgeClass(menuClass)}`}>
                                    {t(`menuEngineering.classes.${menuClass}`)}
                                </span>
                                <MenuClassIcon menuClass={menuClass} className={menuClassIconClass(menuClass)} />
                            </div>
                            <div className="mt-3 text-2xl font-bold text-foreground">{count}</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                                {t(`menuEngineering.classDescriptions.${menuClass}`)}
                            </div>

                            
                        </button>
                    );
                })}

            <div className="rounded-xl border border-border p-4 shadow-sm col-span-2 bg-card border-border">
                <div className="text-sm font-semibold text-foreground">{t("menuEngineering.actionsTitle")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t("menuEngineering.actionsSubtitle")}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                    {MENU_ACTIONS.map((action) => {
                        const count = data?.action_summary?.[action] ?? 0;
                        if (count === 0) return null;
                        return (
                            <div
                                key={action}
                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${actionBadgeClass(action)}`}
                                title={t(`menuEngineering.actionDescriptions.${action}`)}
                            >
                                <span>{t(`menuEngineering.actions.${action}`)}</span>
                                <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-2xs bg-card/50">{count}</span>
                            </div>
                        );
                    })}
                    {MENU_ACTIONS.every((action) => (data?.action_summary?.[action] ?? 0) === 0) && (
                        <div className="text-sm text-muted-foreground">{t("menuEngineering.actionsEmpty")}</div>
                    )}
                </div>
            </div>

            </div>

          
            <div className="rounded-lg border border-border shadow-sm bg-card border-border">
                <div className="border-b px-4 py-3 border-border">
                    <div className="text-sm font-semibold text-foreground">
                        {analysisMode === "actual"
                            ? t("menuEngineering.actualTableTitle")
                            : t("menuEngineering.tableTitle")}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {analysisMode === "actual"
                            ? t("menuEngineering.actualTableSubtitle")
                            : t("menuEngineering.tableSubtitle")}
                    </div>
                </div>

                {isFetching && (
                    <div className="border-b /60 px-4 py-2 text-xs text-muted-foreground border-border bg-card/50">
                        {t("list.loadingHint")}
                    </div>
                )}

                <VirtualTable
                    rows={filteredRows}
                    rowHeight={72}
                    className="max-h-[520px]"
                    tableClassName="min-w-[1280px]"
                    header={
                        <thead className={virtualTableStickyHeadClass}>
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.cols.product")}</th>
                                <th className="px-4 py-3 text-left text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.cols.class")}</th>
                                <th className="px-4 py-3 text-right text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.cols.qty")}</th>
                                <th className="px-4 py-3 text-right text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.cols.revenue")}</th>
                                <th className="px-4 py-3 text-right text-xs font-bold tracking-widertext-muted-foreground">
                                    {analysisMode === "actual"
                                        ? t("menuEngineering.cols.actualUnitCost")
                                        : t("menuEngineering.cols.unitCost")}
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-bold tracking-widertext-muted-foreground">
                                    {analysisMode === "actual"
                                        ? t("menuEngineering.cols.actualGrossProfit")
                                        : t("menuEngineering.cols.grossProfit")}
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.cols.margin")}</th>
                                <th className="px-4 py-3 text-left text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.cols.coverage")}</th>
                                <th className="px-4 py-3 text-left text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.cols.actions")}</th>
                            </tr>
                        </thead>
                    }
                    emptyState={
                        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                            {t("menuEngineering.emptyData")}
                        </div>
                    }
                    renderRow={(row: MenuEngineeringRow) => {
                        const activeMenuClass = analysisMode === "actual" ? row.actual_menu_class : row.menu_class;
                        const activePopularity = analysisMode === "actual" ? row.actual_popularity_index : row.popularity_index;
                        const activeUnitCost = analysisMode === "actual" ? row.actual_unit_cost : row.estimated_unit_cost;
                        const activeGrossProfit = analysisMode === "actual" ? row.actual_gross_profit : row.estimated_gross_profit;
                        const activeMargin = analysisMode === "actual" ? row.actual_margin_pct : row.estimated_margin_pct;

                        return (
                            <>
                                <td className="px-4 py-3 align-top">
                                    {row.is_combined ? (
                                        <button
                                            type="button"
                                            onClick={() => setCombinedProductRow(row)}
                                            className="group text-left"
                                            title={t("menuEngineering.combinedDialog.openHint")}
                                        >
                                            <div className="inline-flex items-center gap-1.5 font-semibold text-foreground group-hover:text-primary">
                                                <Layers size={14} className="shrink-0 text-primary" />
                                                <span className="underline-offset-2 group-hover:underline">
                                                    {row.product_name}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-2xs font-semibold text-primary">
                                                {t("menuEngineering.combinedBadge")}
                                            </div>
                                        </button>
                                    ) : (
                                        <div className="font-semibold text-foreground">{row.product_name}</div>
                                    )}
                                    <div className="mt-1 text-xs text-muted-foreground">{row.category_name}</div>
                                    {row.recipe_status === "NO_RECIPE" && (
                                        <div className="mt-2 text-2xs font-semibold text-amber-600 dark:text-amber-400">
                                            {t("menuEngineering.recipeMissing")}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 align-top">
                                    <div className={`inline-flex rounded-full px-2 py-1 text-2xs font-bold ${rowBadgeClass(activeMenuClass)}`}>
                                        {activeMenuClass
                                            ? t(`menuEngineering.classes.${activeMenuClass}`)
                                            : t("menuEngineering.unclassified")}
                                    </div>
                                    {activePopularity != null && (
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {t("menuEngineering.popularityIndexLine", {
                                                value: formatNumber(activePopularity, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                            })}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right align-top text-foreground">
                                    {formatNumber(row.sold_qty, { maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-4 py-3 text-right align-top text-foreground">
                                    {formatAmount(row.revenue, canViewAmounts)}
                                </td>
                                <td className="px-4 py-3 text-right align-top text-foreground">
                                    {activeUnitCost == null ? "—" : formatAmount(activeUnitCost, canViewAmounts)}
                                </td>
                                <td className="px-4 py-3 text-right align-top text-foreground">
                                    {activeGrossProfit == null ? "—" : formatAmount(activeGrossProfit, canViewAmounts)}
                                </td>
                                <td className="px-4 py-3 text-right align-top text-foreground">
                                    {formatPercent(activeMargin, canViewAmounts)}
                                </td>
                                <td className="px-4 py-3 align-top">
                                    {analysisMode === "actual" ? (
                                        <>
                                            <div className="text-xs font-medium text-foreground">
                                                {t(`menuEngineering.actualCoverage.${row.actual_coverage}`)}
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {t("menuEngineering.actualCoverageQtyLine", {
                                                    qty: formatNumber(row.actual_covered_qty, { maximumFractionDigits: 2 }),
                                                })}
                                            </div>
                                            <div className="mt-1 text-2xs text-muted-foreground">
                                                {t("menuEngineering.actualCoverageEntriesLine", {
                                                    count: row.actual_cost_entries,
                                                })}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-xs font-medium text-foreground">
                                                {t(`menuEngineering.coverageMode.${row.stock_tracking_mode_coverage}`)}
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {t(`menuEngineering.varianceCoverage.${row.variance_coverage}`)}
                                            </div>
                                            {row.cost_source && (
                                                <div className="mt-1 text-2xs text-muted-foreground">
                                                    {t(`menuEngineering.costSource.${row.cost_source}`)}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </td>
                                <td className="px-4 py-3 align-top">
                                    {row.action_recommendations?.length ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {row.action_recommendations.map((action) => (
                                                <span
                                                    key={action}
                                                    className={`inline-flex rounded-full px-2 py-1 text-2xs font-bold ${actionBadgeClass(action)}`}
                                                    title={t(`menuEngineering.actionDescriptions.${action}`)}
                                                >
                                                    {t(`menuEngineering.actions.${action}`)}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </td>
                            </>
                        );
                    }}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
                <div className="rounded-lg border border-border p-4 shadow-sm bg-card border-border">
                    <div className="text-sm font-semibold text-foreground">{t("menuEngineering.varianceTitle")}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{t("menuEngineering.varianceSubtitle")}</div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-lg border border-border /70 px-3 py-2 border-border bg-muted/30">
                            <div className="text-2xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.varianceCards.waste")}</div>
                            <div className="mt-1 text-base font-bold text-rose-600 dark:text-rose-400">
                                {formatNumber(variance?.totals.waste_qty ?? 0, { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="rounded-lg border border-border /70 px-3 py-2 border-border bg-muted/30">
                            <div className="text-2xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.varianceCards.cancel")}</div>
                            <div className="mt-1 text-base font-bold text-amber-600 dark:text-amber-400">
                                {formatNumber(variance?.totals.cancel_qty ?? 0, { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="rounded-lg border border-border /70 px-3 py-2 border-border bg-muted/30">
                            <div className="text-2xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.varianceCards.return")}</div>
                            <div className="mt-1 text-base font-bold text-blue-600 dark:text-blue-400">
                                {formatNumber(variance?.totals.return_qty ?? 0, { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="rounded-lg border border-border /70 px-3 py-2 border-border bg-muted/30">
                            <div className="text-2xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.varianceCards.disposal")}</div>
                            <div className="mt-1 text-base font-bold text-purple-600 dark:text-purple-400">
                                {formatNumber(variance?.totals.disposal_qty ?? 0, { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="rounded-lg border border-border /70 px-3 py-2 border-border bg-muted/30">
                            <div className="text-2xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.varianceCards.adjustment")}</div>
                            <div className="mt-1 text-base font-bold text-foreground">
                                {formatNumber(variance?.totals.adjustment_qty ?? 0, { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="px-2 py-2 text-left text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.varianceTable.stockItem")}</th>
                                    <th className="px-2 py-2 text-left text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.varianceTable.breakdown")}</th>
                                    <th className="px-2 py-2 text-right text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.varianceTable.qty")}</th>
                                    <th className="px-2 py-2 text-right text-xs font-bold tracking-widertext-muted-foreground">{t("menuEngineering.varianceTable.cost")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(variance?.top_items ?? []).map((item) => (
                                    <tr key={item.stock_item_id} className="border-b last:border-0 border-border">
                                        <td className="px-2 py-2">
                                            <div className="font-semibold text-foreground">{item.name}</div>
                                            <div className="text-xs text-muted-foreground">{item.sku}</div>
                                        </td>
                                        <td className="px-2 py-2 text-xs text-muted-foreground">{buildVarianceLine(item)}</td>
                                        <td className="px-2 py-2 text-right text-foreground">
                                            {formatNumber(item.total_qty, { maximumFractionDigits: 2 })} {item.unit}
                                        </td>
                                        <td className="px-2 py-2 text-right text-foreground">
                                            {formatAmount(item.total_cost, canViewAmounts)}
                                        </td>
                                    </tr>
                                ))}
                                {!(variance?.top_items?.length) && (
                                    <tr>
                                        <td colSpan={4} className="px-2 py-6 text-center text-sm text-muted-foreground">
                                            {t("menuEngineering.varianceEmpty")}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-lg border border-border p-4 shadow-sm bg-card border-border">
                    <div className="text-sm font-semibold text-foreground">{t("menuEngineering.recentVarianceTitle")}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{t("menuEngineering.recentVarianceSubtitle")}</div>

                    <div className="mt-4 space-y-3">
                        {(variance?.recent_movements ?? []).map((movement) => (
                            <div key={movement.movement_id} className="rounded-lg border border-border /70 px-3 py-3 border-border bg-muted/30">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-foreground">{movement.stock_item_name}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {movement.warehouse_name}
                                        </div>
                                        <div className="mt-2">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${stockMovementTypeBadgeClass(movement.movement_type)}`}>
                                                {getStockMovementTypeLabel(
                                                    movement.movement_type,
                                                    (key) => tInventory(`movementType.${key}`),
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-foreground">
                                            {formatNumber(movement.quantity, { maximumFractionDigits: 2 })}
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {formatAmount(movement.total_cost, canViewAmounts)}
                                        </div>
                                    </div>
                                </div>
                                {movement.reference && (
                                    <div className="mt-2 text-xs text-muted-foreground">
                                        {formatStockMovementReference(
                                            movement.reference,
                                            null,
                                            (key) => tInventoryReason(key),
                                        )}
                                    </div>
                                )}
                                <div className="mt-2 text-2xs text-muted-foreground">
                                    {formatDate(movement.created_at)}
                                </div>
                            </div>
                        ))}
                        {!(variance?.recent_movements?.length) && (
                            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground border-border">
                                {t("menuEngineering.recentVarianceEmpty")}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <CombinedProductCompositionDialog
                row={combinedProductRow}
                open={combinedProductRow != null}
                onOpenChange={(open) => {
                    if (!open) setCombinedProductRow(null);
                }}
            />
        </div>
    );
}
