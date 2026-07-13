"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import api from '@/lib/api';
import {
    Loader2,
    TrendingUp,
    Package,
    BarChart3,
    Search,
    Filter,
    FileSpreadsheet,
} from 'lucide-react';
import { SalesPeriodFilter, type SalesPeriodFilterI18n, SalesPeriodPresetId } from './SalesPeriodFilter';
import { ProductCategorySelect } from './ProductCategorySelect';
import { Button } from '@/components/ui/button';
import { VirtualTable, virtualTableStickyHeadClass } from '@/components/ui/virtual-table';
import { adminApi } from '@/features/admin/services/adminApi';
import { AsyncPdfExportButton } from '@/components/AsyncPdfExportButton';
import { toast } from 'sonner';
import {
    formatNumber,
    formatAmount,
} from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';
import type { Payload } from "recharts/types/component/DefaultLegendContent";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    Legend
} from "recharts";

interface ProductAnalyticsData {
    products: {
        id: string;
        name: string;
        category: string;
        quantity: number;
        revenue: number;
    }[];
    daily_trends: Record<string, string | number>[];
}

interface ProductSalesAnalyticsProps {
    branchId: string;
    startDate: string;
    endDate: string;
    dateRangePreset: SalesPeriodPresetId | null;
    /** Satış sayfasından iletilen dönem etiketleri */
    periodI18n: SalesPeriodFilterI18n;
    onDateSelect: (preset: SalesPeriodPresetId, range: { start: string, end: string }) => void;
    onStartDateChange: (val: string) => void;
    onEndDateChange: (val: string) => void;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function ProductSalesAnalytics({
    branchId,
    startDate,
    endDate,
    dateRangePreset,
    periodI18n,
    onDateSelect,
    onStartDateChange,
    onEndDateChange
}: ProductSalesAnalyticsProps) {
    const t = useTranslations('sales');
    const canViewAmounts = useCanViewAmounts();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['product-analytics', branchId, startDate, endDate, selectedProductId],
        queryFn: async () => {
            const bid = branchId === 'ALL' ? undefined : branchId;
            const res = await api.get('/dashboard/product-analytics/', {
                params: {
                    branch_id: bid,
                    start_date: startDate,
                    end_date: endDate,
                    product_id: selectedProductId || undefined
                }
            });
            return res.data as ProductAnalyticsData;
        },
        enabled: !!branchId
    });

    const filteredProducts = useMemo(() => {
        if (!data?.products) return [];
        if (!searchTerm.trim()) return data.products;
        const s = searchTerm.toLowerCase();
        return data.products.filter(p =>
            p.name.toLowerCase().includes(s) ||
            p.category.toLowerCase().includes(s)
        );
    }, [data?.products, searchTerm]);

    const [selectedLegend, setSelectedLegend] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const exportParams = useMemo(() => ({
    branch_id: branchId === 'ALL' ? undefined : branchId,
    start_date: startDate,
    end_date: endDate,
  }), [branchId, startDate, endDate]);

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading(t('export.productReportLoading', { format: t('productAnalytics.formatExcel') }));
    try {
      const blob = await adminApi.generateModuleReport('product-sales-analytics', exportParams, 'excel');
      const url = window.URL.createObjectURL(new Blob([blob as BlobPart]));
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      link.setAttribute("download", t("export.productAnalyticsExcel", { date: dateStr }));
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t('export.productReportSuccess'), { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error(t('export.productReportError'), { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader2 className="animate-spin text-blue-600" size={32} />
                <span className="text-sm font-medium text-muted-foreground">{t('productAnalytics.loading')}</span>
            </div>
        );
    }

    const top5Names = data?.products.slice(0, 5).map(p => p.name) || [];

    const handleLegendClick = (o: Payload) => {
        const raw = o.dataKey;
        const dataKey = typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
        if (!dataKey) return;
        setSelectedLegend(prev =>
            prev.includes(dataKey)
                ? prev.filter(k => k !== dataKey)
                : [...prev, dataKey]
        );
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 flex flex-col gap-4">
            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-card border-border shrink-0">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                        <Filter size={16} />
                        <span className="text-ui font-medium">{t('productAnalytics.filterLabel')}</span>
                    </div>

                    <div className="w-full sm:w-64">
                        <ProductCategorySelect
                            value={selectedProductId}
                            onSelect={setSelectedProductId}
                        />
                    </div>

                    <SalesPeriodFilter
                        variant="list"
                        activePreset={dateRangePreset}
                        onSelect={onDateSelect}
                        i18n={periodI18n}
                    />

                    {dateRangePreset === 'custom' && (
                        <div className="flex items-center gap-1.5 shrink-0">
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => onStartDateChange(e.target.value)}
                                max={endDate}
                                className="border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground h-9"
                            />
                            <span className="text-muted-foreground text-sm">-</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => onEndDateChange(e.target.value)}
                                min={startDate}
                                className="border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground h-9"
                            />
                        </div>
                    )}

                    {(selectedProductId || selectedLegend.length > 0) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSelectedProductId(null);
                                setSelectedLegend([]);
                            }}
                            className="h-9 px-2 text-muted-foreground hover:text-blue-600"
                        >
                            {t('productAnalytics.clearFilters')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Content Container */}
            <div className="flex flex-col gap-6">
                {/* Top Stats */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-border p-4 shadow-sm bg-card border-border">
                        <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                            <Package size={16} />
                            <span className="text-2xs font-bold uppercase tracking-wider">{t('productAnalytics.statTotalProducts')}</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{data?.products.length || 0}</p>
                    </div>
                    <div className="rounded-xl border border-border p-4 shadow-sm bg-card border-border">
                        <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                            <TrendingUp size={16} className="text-blue-500" />
                            <span className="text-2xs font-bold uppercase tracking-wider">{t('productAnalytics.statTopSeller')}</span>
                        </div>
                        <p className="text-lg font-bold text-foreground truncate">
                            {data?.products[0]?.name || t('table.dash')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t('productAnalytics.unitsSold', {
                                count: formatNumber(data?.products[0]?.quantity || 0, { maximumFractionDigits: 1 }),
                            })}
                        </p>
                    </div>
                    <div className="rounded-xl border border-border p-4 shadow-sm bg-card border-border">
                        <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                            <TrendingUp size={16} className="text-emerald-500" />
                            <span className="text-2xs font-bold uppercase tracking-wider">{t('productAnalytics.statTop2')}</span>
                        </div>
                        <p className="text-lg font-bold text-foreground truncate">
                            {data?.products[1]?.name || t('table.dash')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t('productAnalytics.unitsSold', {
                                count: formatNumber(data?.products[1]?.quantity || 0, { maximumFractionDigits: 1 }),
                            })}
                        </p>
                    </div>
                    <div className="rounded-xl border border-border p-4 shadow-sm bg-card border-border">
                        <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                            <TrendingUp size={16} className="text-amber-500" />
                            <span className="text-2xs font-bold uppercase tracking-wider">{t('productAnalytics.statTop3')}</span>
                        </div>
                        <p className="text-lg font-bold text-foreground truncate">
                            {data?.products[2]?.name || t('table.dash')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t('productAnalytics.unitsSold', {
                                count: formatNumber(data?.products[2]?.quantity || 0, { maximumFractionDigits: 1 }),
                            })}
                        </p>
                    </div>
                </div>

                {/* Products Table */}
                <div className="rounded-xl border border-border overflow-hidden shadow-sm bg-card border-border">
                    <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <h3 className="font-bold text-foreground">{t('productAnalytics.tableTitle')}</h3>
                            <div className="flex items-center gap-1.5 border-l border-border pl-4 border-border">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExportExcel}
                                    disabled={isExporting}
                                    className="h-9 px-2.5 text-emerald-600 border-emerald-100 hover:bg-emerald-50 dark:border-emerald-900/30 dark:hover:bg-emerald-950/20"
                                >
                                    <FileSpreadsheet size={14} className="mr-1.5" />
                                    {isExporting ? t('list.exportBusy') : t('productAnalytics.formatExcel')}
                                </Button>
                                <AsyncPdfExportButton
                                    reportSlug="product-sales-analytics"
                                    params={exportParams}
                                    filename={t("export.productAnalyticsPdf", { date: new Date().toISOString().split("T")[0] })}
                                    size="sm"
                                    className="h-9 px-2.5 text-rose-600 border-rose-100 hover:bg-rose-50 dark:border-rose-900/30 dark:hover:bg-rose-950/20"
                                />
                            </div>
                        </div>
                        <div className="relative w-full sm:w-64">
                            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder={t('productAnalytics.searchPlaceholder')}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full border border-border rounded-lg py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-border"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-96">
                        {filteredProducts.length === 0 ? (
                            <div className="px-4 py-8 text-center text-muted-foreground">{t('productAnalytics.emptyData')}</div>
                        ) : (
                            <VirtualTable
                                rows={filteredProducts}
                                rowHeight={44}
                                overscan={8}
                                className="max-h-96"
                                tableClassName="w-full text-sm"
                                header={
                                    <thead className={virtualTableStickyHeadClass}>
                                        <tr>
                                            <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider text-2xs">{t('productAnalytics.colProduct')}</th>
                                            <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider text-2xs">{t('productAnalytics.colCategory')}</th>
                                            <th className="text-right px-4 py-3 font-semibold uppercase tracking-wider text-2xs">{t('productAnalytics.colQty')}</th>
                                            <th className="text-right px-4 py-3 font-semibold uppercase tracking-wider text-2xs">{t('productAnalytics.colRevenue')}</th>
                                        </tr>
                                    </thead>
                                }
                                renderRow={(p) => (
                                    <>
                                        <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-sub font-medium bg-muted dark:text-muted-foreground">
                                                {p.category}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                                            {formatNumber(p.quantity, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                            {formatAmount(p.revenue, canViewAmounts)}
                                        </td>
                                    </>
                                )}
                            />
                        )}
                    </div>
                </div>

                {/* Trends Chart */}
                <div className="rounded-xl border border-border p-5 shadow-sm bg-card border-border">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <BarChart3 size={18} className="text-blue-600" />
                            {t('productAnalytics.chartTitle')}
                        </h3>
                        {selectedLegend.length > 0 && (
                            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                {t('productAnalytics.legendIsolated', { count: selectedLegend.length })}
                            </span>
                        )}
                    </div>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data?.daily_trends}>
                                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10 }}
                                    tickFormatter={(val) => val.split('-').slice(1).reverse().join('/')}
                                />
                                <YAxis tick={{ fontSize: 10 }} />
                                <RechartsTooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                        borderRadius: '8px',
                                        border: '1px solid var(--color-border)',
                                        fontSize: '12px'
                                    }}
                                />
                                <Legend
                                    onClick={handleLegendClick}
                                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px', cursor: 'pointer' }}
                                />
                                {top5Names.map((name, i) => (
                                    <Line
                                        key={name}
                                        type="monotone"
                                        dataKey={name}
                                        stroke={COLORS[i % COLORS.length]}
                                        strokeWidth={2.5}
                                        dot={{ r: 2 }}
                                        activeDot={{ r: 4 }}
                                        hide={selectedLegend.length > 0 && !selectedLegend.includes(name)}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
