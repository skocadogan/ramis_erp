"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
    Filter,
    Loader2,
    RotateCcw,
    FileSpreadsheet,
    FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SalesPeriodFilter, type SalesPeriodFilterI18n } from "./SalesPeriodFilter";
import { ProductCategorySelect } from "./ProductCategorySelect";
import { CancellationsTable } from "./CancellationsTable";
import { TableSelect } from "@/features/tables/components/TableSelect";
import { salesApi } from "../services/salesApi";
import type { useSalesCancellations } from "../hooks/useSalesCancellations";
import type { SalesPeriodPresetId } from "../utils/salesPeriod";
import { formatNumber, formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import type { CancellationRecord } from "../types";

type CancellationsHook = ReturnType<typeof useSalesCancellations>;

interface SalesCancellationsPanelProps {
    branchId: string;
    startDate: string;
    endDate: string;
    dateRangePreset: SalesPeriodPresetId | null;
    periodI18n: SalesPeriodFilterI18n;
    onDateSelect: (preset: SalesPeriodPresetId, range: { start: string; end: string }) => void;
    onStartDateChange: (val: string) => void;
    onEndDateChange: (val: string) => void;
    cancellations: CancellationsHook;
    onRowClick?: (row: CancellationRecord) => void;
}

export function SalesCancellationsPanel({
    branchId,
    startDate,
    endDate,
    dateRangePreset,
    periodI18n,
    onDateSelect,
    onStartDateChange,
    onEndDateChange,
    cancellations,
    onRowClick,
}: SalesCancellationsPanelProps) {
    const t = useTranslations("sales");
    const canViewAmounts = useCanViewAmounts();
    const [isExporting, setIsExporting] = useState(false);

    const exportParams = {
        branch_id: branchId === "ALL" ? undefined : branchId,
        start_date: startDate,
        end_date: endDate,
        search: cancellations.search.trim() || undefined,
        table_id: cancellations.tableId || undefined,
        product_id: cancellations.selectedProductId || undefined,
    };

    const handleExportPdf = async () => {
        setIsExporting(true);
        const toastId = toast.loading(t("export.pdfLoading"));
        try {
            const blob = await salesApi.exportCancellationsPdf(exportParams);
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement("a");
            link.href = url;
            const dateStr = new Date().toISOString().split("T")[0];
            link.setAttribute("download", t("export.cancellationsPdfFilename", { date: dateStr }));
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success(t("export.pdfSuccess"), { id: toastId });
        } catch {
            toast.error(t("export.pdfError"), { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        const toastId = toast.loading(t("export.excelLoading"));
        try {
            const blob = await salesApi.exportCancellationsExcel(exportParams);
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement("a");
            link.href = url;
            const dateStr = new Date().toISOString().split("T")[0];
            link.setAttribute("download", t("export.cancellationsExcelFilename", { date: dateStr }));
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success(t("export.excelSuccess"), { id: toastId });
        } catch {
            toast.error(t("export.excelError"), { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-card border-border shrink-0">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                        <Filter size={16} />
                        <span className="text-ui font-medium">{t("productAnalytics.filterLabel")}</span>
                    </div>

                    <TableSelect
                        value={cancellations.tableId}
                        onChange={cancellations.setTableId}
                        includeTakeawaySalesFilter
                        className="w-full sm:w-[180px] h-9 border-border text-sm bg-muted border-input text-foreground"
                    />

                    <div className="w-full sm:w-64">
                        <ProductCategorySelect
                            value={cancellations.selectedProductId}
                            onSelect={cancellations.setSelectedProductId}
                        />
                    </div>

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
                                onChange={(e) => onStartDateChange(e.target.value)}
                                max={endDate}
                                className="border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground h-9"
                            />
                            <span className="text-muted-foreground text-sm">-</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => onEndDateChange(e.target.value)}
                                min={startDate}
                                className="border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground h-9"
                            />
                        </div>
                    )}

                    {!cancellations.isAtDefaultFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancellations.clearFilters}
                            className="h-9 px-2 text-muted-foreground hover:text-rose-600"
                        >
                            <RotateCcw size={14} className="mr-1.5" />
                            {t("productAnalytics.clearFilters")}
                        </Button>
                    )}

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isExporting || cancellations.isLoading}
                            onClick={handleExportExcel}
                            className="h-9 px-2.5 text-emerald-600 border-emerald-100 hover:bg-emerald-50 dark:border-emerald-900/30 dark:hover:bg-emerald-950/20"
                        >
                            <FileSpreadsheet size={14} className="mr-1.5" />
                            {isExporting ? t("list.exportBusy") : t("list.exportExcel")}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isExporting || cancellations.isLoading}
                            onClick={handleExportPdf}
                            className="h-9 px-2.5 text-rose-600 border-rose-100 hover:bg-rose-50 dark:border-rose-900/30 dark:hover:bg-rose-950/20"
                        >
                            <FileText size={14} className="mr-1.5" />
                            {isExporting ? t("list.exportBusy") : t("list.exportPdf")}
                        </Button>
                    </div>
                </div>

                <div className="hidden lg:flex items-center gap-8 px-6 py-2 border-l border-border">
                    <div className="flex flex-col items-end">
                        <span className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
                            {t("cancellations.totalAmount")}
                        </span>
                        <span className="text-base font-bold text-rose-600 dark:text-rose-400 leading-none">
                            {formatAmount(cancellations.totals.total_amount, canViewAmounts)}
                        </span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
                            {t("cancellations.totalQuantity")}
                        </span>
                        <span className="text-base font-bold text-blue-600 dark:text-blue-400 leading-none">
                            {formatNumber(cancellations.totals.item_count)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="p-3 flex-1 min-h-0 rounded-lg border border-border overflow-hidden flex flex-col shadow-sm bg-card border-border">
                <div className="flex-1 overflow-auto overflow-x-hidden relative">
                    {(cancellations.isLoading || cancellations.isFetching) && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 bg-card/80">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="animate-spin text-blue-600 dark:text-blue-400" size={24} />
                                <span className="text-xs font-medium text-muted-foreground">{t("list.loadingHint")}</span>
                            </div>
                        </div>
                    )}
                    <CancellationsTable
                        rows={cancellations.rows}
                        onRowClick={onRowClick}
                        infiniteControls={cancellations.infiniteControls}
                    />
                </div>

                <div className="p-3 border-t /50 flex items-center justify-between bg-card/50 border-border">
                    <div className="text-xs text-muted-foreground font-medium">
                        {t("list.paginationTotal", { count: cancellations.totalCount })}
                    </div>
                </div>
            </div>
        </>
    );
}
