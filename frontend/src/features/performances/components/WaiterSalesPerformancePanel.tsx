'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, FileSpreadsheet, FileText, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { VirtualTable, virtualTableStickyHeadClass } from '@/components/ui/virtual-table';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { PeriodFilter, type PeriodFilterI18n } from './PeriodFilter';
import type { PeriodPresetId } from '../utils/periodFilter';
import { performancesApi } from '../services/performancesApi';
import type {
    WaiterOrderSalesRow,
    WaiterStaffSalesRow,
    WaiterOrderTotals,
    CancellationBreakdownRow,
    DailySalesRow,
    OrderChannel,
} from '../services/performancesApi';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
} from 'recharts';

const STAFF_CHART_HEIGHT = 220;
const DAILY_CHART_HEIGHT = 200;

function formatAxisAmount(value: number) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
    return String(Math.round(value));
}

function getBarLayout(dataLength: number) {
    if (dataLength <= 1) return { maxBarSize: 56, barCategoryGap: '62%' };
    if (dataLength <= 3) return { maxBarSize: 48, barCategoryGap: '35%' };
    if (dataLength <= 6) return { maxBarSize: 40, barCategoryGap: '24%' };
    return { maxBarSize: 32, barCategoryGap: '18%' };
}

type StaffSeriesKey = 'sales' | 'orders';
type DailySeriesKey = 'sales';

function ChartLegendItem({
    color,
    label,
    active = true,
    onClick,
}: {
    color: string;
    label: string;
    active?: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-2xs transition-colors',
                active
                    ? 'text-muted-foreground hover:bg-muted/60'
                    : 'text-muted-foreground/45 line-through hover:bg-muted/40',
            )}
        >
            <span
                className={cn('size-2 shrink-0 rounded-sm transition-opacity', !active && 'opacity-35')}
                style={{ backgroundColor: color }}
            />
            {label}
        </button>
    );
}

function toggleSeries<K extends string>(
    setHidden: React.Dispatch<React.SetStateAction<K[]>>,
    key: NoInfer<K>,
) {
    setHidden((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
}

interface WaiterSalesPerformancePanelProps {
    branchId: string;
    startDate: string;
    endDate: string;
    dateRangePreset: PeriodPresetId | null;
    orders: WaiterOrderSalesRow[];
    staffPerformance: WaiterStaffSalesRow[];
    cancellationBreakdown: CancellationBreakdownRow[];
    dailySales: DailySalesRow[];
    totals?: WaiterOrderTotals;
    isLoading: boolean;
    isFetching: boolean;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
    onDateSelect: (preset: PeriodPresetId, range: { start: string; end: string }) => void;
    onStartDateChange: (val: string) => void;
    onEndDateChange: (val: string) => void;
}

export function WaiterSalesPerformancePanel({
    branchId,
    startDate,
    endDate,
    dateRangePreset,
    orders,
    staffPerformance,
    cancellationBreakdown,
    dailySales,
    totals,
    isLoading,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    onDateSelect,
    onStartDateChange,
    onEndDateChange,
}: WaiterSalesPerformancePanelProps) {
    const t = useTranslations('performances');
    const [isExporting, setIsExporting] = useState(false);
    const [staffHiddenSeries, setStaffHiddenSeries] = useState<StaffSeriesKey[]>([]);
    const [dailyHiddenSeries, setDailyHiddenSeries] = useState<DailySeriesKey[]>([]);

    const periodI18n = useMemo<PeriodFilterI18n>(
        () => ({
            periodLabel: t('periodFilter.label'),
            selectPlaceholder: t('periodFilter.selectPlaceholder'),
            groupAriaLabel: t('periodFilter.groupAriaLabel'),
            selectAriaLabel: t('periodFilter.selectAriaLabel'),
            presets: {
                today: t('presets.today'),
                this_week: t('presets.this_week'),
                last_week: t('presets.last_week'),
                this_month: t('presets.this_month'),
                last_month: t('presets.last_month'),
                last_3_months: t('presets.last_3_months'),
                last_6_months: t('presets.last_6_months'),
                last_9_months: t('presets.last_9_months'),
                this_year: t('presets.this_year'),
                custom: t('presets.custom'),
            },
        }),
        [t],
    );

    const channelLabel = (ch: OrderChannel) => {
        if (ch === 'mobile') return t('waiterSales.channelMobile');
        if (ch === 'web') return t('waiterSales.channelWeb');
        return t('waiterSales.channelUnknown');
    };

    const staffChartData = useMemo(
        () =>
            staffPerformance.map((row) => ({
                name: row.staff_name,
                sales: parseFloat(row.total_amount) || 0,
                orders: row.order_count,
                cancelled: row.cancelled_count,
            })),
        [staffPerformance],
    );

    const dailyChartData = useMemo(
        () =>
            dailySales.map((row) => ({
                date: row.date ?? '',
                sales: parseFloat(row.sales_total) || 0,
                orders: row.order_count,
            })),
        [dailySales],
    );

    const staffBarLayout = getBarLayout(staffChartData.length);
    const dailyBarLayout = getBarLayout(dailyChartData.length);
    const staffLabelAngle = staffChartData.length > 4 ? -30 : 0;
    const staffLabelAnchor = staffChartData.length > 4 ? 'end' : 'middle';
    const staffBottomMargin = staffChartData.length > 4 ? 56 : 28;

    const exportParams = {
        branch_id: branchId === 'ALL' ? undefined : branchId,
        start_date: startDate,
        end_date: endDate,
    };

    const handleExport = async (format: 'pdf' | 'excel') => {
        setIsExporting(true);
        const toastId = toast.loading(
            format === 'pdf' ? t('export.pdfLoading') : t('export.excelLoading'),
        );
        try {
            const blob =
                format === 'pdf'
                    ? await performancesApi.exportWaiterSalesPdf(exportParams)
                    : await performancesApi.exportWaiterSalesExcel(exportParams);
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute(
                'download',
                format === 'pdf'
                    ? t('export.salesPdfFilename', { date: dateStr })
                    : t('export.salesExcelFilename', { date: dateStr }),
            );
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success(format === 'pdf' ? t('export.pdfSuccess') : t('export.excelSuccess'), {
                id: toastId,
            });
        } catch {
            toast.error(format === 'pdf' ? t('export.pdfError') : t('export.excelError'), {
                id: toastId,
            });
        } finally {
            setIsExporting(false);
        }
    };

    const formatDateTime = (iso: string) => {
        try {
            return new Date(iso).toLocaleString(undefined, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return iso;
        }
    };

    const formatDate = (iso: string | null) => {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString(undefined, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
        } catch {
            return iso;
        }
    };



    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    <PeriodFilter
                        activePreset={dateRangePreset}
                        onSelect={onDateSelect}
                        i18n={periodI18n}
                    />
                    {dateRangePreset === 'custom' && (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <label className="flex items-center gap-1.5 text-muted-foreground">
                                <span>{t('waiterSales.startDate')}</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => onStartDateChange(e.target.value)}
                                    className="rounded-md border border-border bg-white px-2 py-1 dark:bg-slate-900"
                                />
                            </label>
                            <label className="flex items-center gap-1.5 text-muted-foreground">
                                <span>{t('waiterSales.endDate')}</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => onEndDateChange(e.target.value)}
                                    className="rounded-md border border-border bg-white px-2 py-1 dark:bg-slate-900"
                                />
                            </label>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isExporting}
                        onClick={() => handleExport('excel')}
                    >
                        <FileSpreadsheet size={16} className="me-1.5" />
                        {t('waiterSales.exportExcel')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isExporting}
                        onClick={() => handleExport('pdf')}
                    >
                        <FileText size={16} className="me-1.5" />
                        {t('waiterSales.exportPdf')}
                    </Button>
                </div>
            </div>

            {totals && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                        { label: t('waiterSales.totalOrders'), value: totals.total_orders },
                        { label: t('waiterSales.totalSales'), value: formatCurrency(totals.total_sales_amount) },
                        { label: t('waiterSales.avgOrder'), value: formatCurrency(totals.avg_order_amount) },
                        { label: t('waiterSales.cancelledOrders'), value: totals.cancelled_orders },
                        { label: t('waiterSales.mobileOrders'), value: totals.mobile_orders },
                        { label: t('waiterSales.webOrders'), value: totals.web_orders },
                    ].map((item) => (
                        <div
                            key={item.label}
                            className="rounded-xl border border-border bg-white px-4 py-3 dark:bg-slate-900"
                        >
                            <div className="text-2xs uppercase tracking-wide text-muted-foreground">
                                {item.label}
                            </div>
                            <div className="text-lg font-ui-semibold tabular-nums">{item.value}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                    <div className="rounded-xl border border-border bg-white dark:bg-slate-900 flex flex-col min-h-0 flex-1">
                        <div className="border-b border-border px-4 py-2.5 text-sm font-ui-semibold">
                            {t('waiterSales.staffTableTitle')}
                        </div>
                        <div className="overflow-auto flex-1">
                            <table className="w-full text-sm">
                                <thead className={`${virtualTableStickyHeadClass} text-left text-2xs uppercase tracking-wide text-muted-foreground`}>
                                    <tr>
                                        <th className="px-3 py-2">{t('waiterSales.colStaff')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colOrders')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colCancelled')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colTotal')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colAvg')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colTables')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colBusiestDay')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colTopTable')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colMobile')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colWeb')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {staffPerformance.map((row) => (
                                        <tr
                                            key={row.staff_id}
                                            className="border-t border-border/60 hover:bg-muted/40"
                                        >
                                            <td className="px-3 py-2">{row.staff_name}</td>
                                            <td className="px-3 py-2 tabular-nums">{row.order_count}</td>
                                            <td className="px-3 py-2 tabular-nums">{row.cancelled_count}</td>
                                            <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                                {formatCurrency(row.total_amount)}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                                {formatCurrency(row.avg_order_amount)}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums">{row.table_count}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-2xs">
                                                {row.busiest_day ? (
                                                    <>
                                                        {formatDate(row.busiest_day)}
                                                        <span className="text-muted-foreground">
                                                            {' '}
                                                            ({row.busiest_day_order_count})
                                                        </span>
                                                    </>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-2xs">
                                                {row.top_table_name ? (
                                                    <>
                                                        <div>{row.top_table_name}</div>
                                                        <div className="text-muted-foreground">
                                                            {formatCurrency(row.top_table_amount)}
                                                        </div>
                                                    </>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums">{row.mobile_order_count}</td>
                                            <td className="px-3 py-2 tabular-nums">{row.web_order_count}</td>
                                        </tr>
                                    ))}
                                    {!isLoading && staffPerformance.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={10}
                                                className="px-3 py-8 text-center text-muted-foreground"
                                            >
                                                {t('waiterSales.empty')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {cancellationBreakdown.length > 0 && (
                        <div className="rounded-xl border border-border bg-white dark:bg-slate-900">
                            <div className="border-b border-border px-4 py-2.5 text-sm font-ui-semibold">
                                {t('waiterSales.cancelReasonsTitle')}
                            </div>
                            <div className="overflow-auto max-h-40">
                                <table className="w-full text-sm">
                                    <tbody>
                                        {cancellationBreakdown.map((row) => (
                                            <tr
                                                key={row.code}
                                                className="border-t border-border/60"
                                            >
                                                <td className="px-3 py-2">{row.label}</td>
                                                <td className="px-3 py-2 tabular-nums text-end">
                                                    {row.count}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="rounded-xl border border-border bg-white dark:bg-slate-900 flex flex-col min-h-0 flex-[1.2]">
                        <div className="border-b border-border px-4 py-2.5 text-sm font-ui-semibold flex items-center justify-between">
                            <span>{t('waiterSales.historyTitle')}</span>
                            {isFetching && !isLoading && (
                                <Loader2 size={14} className="animate-spin text-muted-foreground" />
                            )}
                        </div>
                        <VirtualTable
                            rows={orders}
                            rowHeight={44}
                            overscan={10}
                            fetchMore={fetchNextPage}
                            hasMore={!!hasNextPage}
                            isFetchingNextPage={isFetchingNextPage}
                            className="flex-1 min-h-0"
                            tableClassName="w-full text-sm"
                            header={
                                <thead className={`${virtualTableStickyHeadClass} text-left text-2xs uppercase tracking-wide text-muted-foreground`}>
                                    <tr>
                                        <th className="px-3 py-2">{t('waiterSales.colCreatedAt')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colTable')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colStaff')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colAmount')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colChannel')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colStatus')}</th>
                                        <th className="px-3 py-2">{t('waiterSales.colCancelReason')}</th>
                                    </tr>
                                </thead>
                            }
                            emptyState={
                                isLoading ? (
                                    <div className="px-3 py-8 text-center">
                                        <Loader2 className="mx-auto animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <div className="px-3 py-8 text-center text-muted-foreground">{t('waiterSales.empty')}</div>
                                )
                            }
                            loadingMore={
                                <tr>
                                    <td colSpan={7} className="py-3 text-center">
                                        <Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" />
                                    </td>
                                </tr>
                            }
                            renderRow={(row) => (
                                <>
                                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateTime(row.created_at)}</td>
                                    <td className="px-3 py-2">
                                        <div>{row.table_name ?? '—'}</div>
                                        {row.zone_name && (
                                            <div className="text-2xs text-muted-foreground">{row.zone_name}</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">{row.staff_name}</td>
                                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatCurrency(row.total_amount)}</td>
                                    <td className="px-3 py-2">{channelLabel(row.order_channel)}</td>
                                    <td className="px-3 py-2">{row.status_display}</td>
                                    <td className="px-3 py-2 text-2xs">{row.cancel_reason_display ?? '—'}</td>
                                </>
                            )}
                        />
                    </div>
                </div>

                <div className="flex min-h-0 flex-col gap-4">
                    <div className="rounded-xl border border-border bg-white dark:bg-slate-900 flex flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                            <div className="text-sm font-ui-semibold flex items-center gap-2">
                                <BarChart3 size={16} />
                                {t('waiterSales.chartStaffTitle')}
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <ChartLegendItem
                                    color="#3b82f6"
                                    label={t('waiterSales.chartSalesLabel')}
                                    active={!staffHiddenSeries.includes('sales')}
                                    onClick={() => toggleSeries(setStaffHiddenSeries, 'sales')}
                                />
                                <ChartLegendItem
                                    color="#10b981"
                                    label={t('waiterSales.chartOrdersLabel')}
                                    active={!staffHiddenSeries.includes('orders')}
                                    onClick={() => toggleSeries(setStaffHiddenSeries, 'orders')}
                                />
                            </div>
                        </div>
                        <div className="p-3 pt-2">
                            {isLoading ? (
                                <div
                                    className="flex items-center justify-center"
                                    style={{ height: STAFF_CHART_HEIGHT }}
                                >
                                    <Loader2 className="animate-spin text-muted-foreground" />
                                </div>
                            ) : staffChartData.length === 0 ? (
                                <div
                                    className="flex items-center justify-center text-muted-foreground text-sm"
                                    style={{ height: STAFF_CHART_HEIGHT }}
                                >
                                    {t('waiterSales.empty')}
                                </div>
                            ) : (
                                <div className="min-w-0 w-full" style={{ height: STAFF_CHART_HEIGHT }}>
                                    <ResponsiveContainer width="100%" height={STAFF_CHART_HEIGHT} debounce={32}>
                                        <BarChart
                                            data={staffChartData}
                                            margin={{ top: 8, right: 8, left: 4, bottom: staffBottomMargin }}
                                            barCategoryGap={staffBarLayout.barCategoryGap}
                                            barGap={4}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                tick={{ fontSize: 11 }}
                                                angle={staffLabelAngle}
                                                textAnchor={staffLabelAnchor}
                                                interval={0}
                                                tickMargin={8}
                                                height={staffChartData.length > 4 ? 52 : 32}
                                            />
                                            <YAxis
                                                yAxisId="sales"
                                                orientation="left"
                                                width={48}
                                                tick={{ fontSize: 10 }}
                                                tickFormatter={formatAxisAmount}
                                                tickCount={5}
                                                hide={staffHiddenSeries.includes('sales')}
                                            />
                                            <YAxis
                                                yAxisId="orders"
                                                orientation="right"
                                                width={36}
                                                tick={{ fontSize: 10 }}
                                                allowDecimals={false}
                                                tickCount={5}
                                                hide={staffHiddenSeries.includes('orders')}
                                            />
                                            <RechartsTooltip
                                                formatter={(value: number, name: string) => {
                                                    if (name === t('waiterSales.chartSalesLabel')) {
                                                        return [formatCurrency(value), name];
                                                    }
                                                    return [value, name];
                                                }}
                                            />
                                            <Bar
                                                yAxisId="sales"
                                                dataKey="sales"
                                                fill="#3b82f6"
                                                radius={[4, 4, 0, 0]}
                                                name={t('waiterSales.chartSalesLabel')}
                                                maxBarSize={staffBarLayout.maxBarSize}
                                                hide={staffHiddenSeries.includes('sales')}
                                            />
                                            <Bar
                                                yAxisId="orders"
                                                dataKey="orders"
                                                fill="#10b981"
                                                radius={[4, 4, 0, 0]}
                                                name={t('waiterSales.chartOrdersLabel')}
                                                maxBarSize={staffBarLayout.maxBarSize}
                                                hide={staffHiddenSeries.includes('orders')}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-white dark:bg-slate-900 flex flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                            <div className="text-sm font-ui-semibold">
                                {t('waiterSales.chartDailyTitle')}
                            </div>
                            <ChartLegendItem
                                color="#6366f1"
                                label={t('waiterSales.chartSalesLabel')}
                                active={!dailyHiddenSeries.includes('sales')}
                                onClick={() => toggleSeries(setDailyHiddenSeries, 'sales')}
                            />
                        </div>
                        <div className="p-3 pt-2">
                            {isLoading ? (
                                <div
                                    className="flex items-center justify-center"
                                    style={{ height: DAILY_CHART_HEIGHT }}
                                >
                                    <Loader2 className="animate-spin text-muted-foreground" />
                                </div>
                            ) : dailyChartData.length === 0 ? (
                                <div
                                    className="flex items-center justify-center text-muted-foreground text-sm"
                                    style={{ height: DAILY_CHART_HEIGHT }}
                                >
                                    {t('waiterSales.empty')}
                                </div>
                            ) : (
                                <div className="min-w-0 w-full" style={{ height: DAILY_CHART_HEIGHT }}>
                                    <ResponsiveContainer width="100%" height={DAILY_CHART_HEIGHT} debounce={32}>
                                        <BarChart
                                            data={dailyChartData}
                                            margin={{ top: 8, right: 8, left: 4, bottom: 24 }}
                                            barCategoryGap={dailyBarLayout.barCategoryGap}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                tick={{ fontSize: 10 }}
                                                tickMargin={8}
                                                interval={dailyChartData.length > 8 ? 'preserveStartEnd' : 0}
                                                angle={dailyChartData.length > 6 ? -30 : 0}
                                                textAnchor={dailyChartData.length > 6 ? 'end' : 'middle'}
                                                height={dailyChartData.length > 6 ? 48 : 28}
                                            />
                                            <YAxis
                                                width={48}
                                                tick={{ fontSize: 10 }}
                                                tickFormatter={formatAxisAmount}
                                                tickCount={5}
                                                hide={dailyHiddenSeries.includes('sales')}
                                            />
                                            <RechartsTooltip
                                                formatter={(value: number, name: string) => {
                                                    if (name === t('waiterSales.chartSalesLabel')) {
                                                        return [formatCurrency(value), name];
                                                    }
                                                    return [value, t('waiterSales.chartOrdersLabel')];
                                                }}
                                            />
                                            <Bar
                                                dataKey="sales"
                                                fill="#6366f1"
                                                radius={[4, 4, 0, 0]}
                                                name={t('waiterSales.chartSalesLabel')}
                                                maxBarSize={dailyBarLayout.maxBarSize}
                                                hide={dailyHiddenSeries.includes('sales')}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
