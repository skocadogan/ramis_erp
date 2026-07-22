'use client';

import React, { useMemo, useState } from 'react';
import { VirtualTable, virtualTableStickyHeadClass } from '@/components/ui/virtual-table';
import { useTranslations } from 'next-intl';
import { Loader2, FileSpreadsheet, FileText, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PeriodFilter, type PeriodFilterI18n } from './PeriodFilter';
import type { PeriodPresetId } from '../utils/periodFilter';
import { performancesApi } from '../services/performancesApi';
import type { WaiterCallLog, StaffPerformanceRow } from '../services/performancesApi';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
} from 'recharts';

interface WaiterCallPerformancePanelProps {
    branchId: string;
    startDate: string;
    endDate: string;
    dateRangePreset: PeriodPresetId | null;
    calls: WaiterCallLog[];
    staffPerformance: StaffPerformanceRow[];
    totals?: {
        total_calls: number;
        dismissed_calls: number;
        pending_calls: number;
        avg_response_seconds: number;
    };
    isLoading: boolean;
    isFetching: boolean;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
    onDateSelect: (preset: PeriodPresetId, range: { start: string; end: string }) => void;
    onStartDateChange: (val: string) => void;
    onEndDateChange: (val: string) => void;
}

export function WaiterCallPerformancePanel({
    branchId,
    startDate,
    endDate,
    dateRangePreset,
    calls,
    staffPerformance,
    totals,
    isLoading,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    onDateSelect,
    onStartDateChange,
    onEndDateChange,
}: WaiterCallPerformancePanelProps) {
    const t = useTranslations('performances');
    const [isExporting, setIsExporting] = useState(false);

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

    const chartData = useMemo(
        () =>
            staffPerformance.map((row) => ({
                name: row.staff_name,
                avg: row.avg_response_seconds,
                count: row.call_count,
            })),
        [staffPerformance],
    );

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
                    ? await performancesApi.exportWaiterCallsPdf(exportParams)
                    : await performancesApi.exportWaiterCallsExcel(exportParams);
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute(
                'download',
                format === 'pdf'
                    ? t('export.pdfFilename', { date: dateStr })
                    : t('export.excelFilename', { date: dateStr }),
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
                                <span>{t('waiterCalls.startDate')}</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => {
                                        onStartDateChange(e.target.value);
                                    }}
                                    className="rounded-md border border-border px-2 py-1 bg-card"
                                />
                            </label>
                            <label className="flex items-center gap-1.5 text-muted-foreground">
                                <span>{t('waiterCalls.endDate')}</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => {
                                        onEndDateChange(e.target.value);
                                    }}
                                    className="rounded-md border border-border px-2 py-1 bg-card"
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
                        {t('waiterCalls.exportExcel')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isExporting}
                        onClick={() => handleExport('pdf')}
                    >
                        <FileText size={16} className="me-1.5" />
                        {t('waiterCalls.exportPdf')}
                    </Button>
                </div>
            </div>

            {totals && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                        { label: t('waiterCalls.totalCalls'), value: totals.total_calls },
                        { label: t('waiterCalls.dismissedCalls'), value: totals.dismissed_calls },
                        { label: t('waiterCalls.pendingCalls'), value: totals.pending_calls },
                        {
                            label: t('waiterCalls.avgResponse'),
                            value: `${totals.avg_response_seconds} ${t('waiterCalls.secondsShort')}`,
                        },
                    ].map((item) => (
                        <div
                            key={item.label}
                            className="rounded-xl border border-border px-4 py-3 bg-card"
                        >
                            <div className="text-2xs uppercase tracking-wide text-muted-foreground">
                                {item.label}
                            </div>
                            <div className="text-lg font-semibold tabular-nums">{item.value}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Sol: tablolar */}
                <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                    <div className="rounded-xl border border-border bg-card flex flex-col min-h-0 flex-1">
                        <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
                            {t('waiterCalls.staffTableTitle')}
                        </div>
                        <div className="overflow-auto flex-1">
                            <table className="w-full text-sm">
                                <thead className={`${virtualTableStickyHeadClass} text-left text-2xs uppercase tracking-wide text-muted-foreground`}>
                                    <tr>
                                        <th className="px-3 py-2">{t('waiterCalls.colStaff')}</th>
                                        <th className="px-3 py-2">{t('waiterCalls.colCallCount')}</th>
                                        <th className="px-3 py-2">{t('waiterCalls.colAvg')}</th>
                                        <th className="px-3 py-2">{t('waiterCalls.colMin')}</th>
                                        <th className="px-3 py-2">{t('waiterCalls.colMax')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {staffPerformance.map((row) => (
                                        <tr
                                            key={row.staff_id}
                                            className="border-t border-border/60 hover:bg-muted/40"
                                        >
                                            <td className="px-3 py-2">{row.staff_name}</td>
                                            <td className="px-3 py-2 tabular-nums">{row.call_count}</td>
                                            <td className="px-3 py-2 tabular-nums">{row.avg_response_seconds}</td>
                                            <td className="px-3 py-2 tabular-nums">{row.min_response_seconds ?? '—'}</td>
                                            <td className="px-3 py-2 tabular-nums">{row.max_response_seconds ?? '—'}</td>
                                        </tr>
                                    ))}
                                    {!isLoading && staffPerformance.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                                                {t('waiterCalls.empty')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card flex flex-col min-h-0 flex-[1.2]">
                        <div className="border-b border-border px-4 py-2.5 text-sm font-semibold flex items-center justify-between">
                            <span>{t('waiterCalls.historyTitle')}</span>
                            {isFetching && !isLoading && (
                                <Loader2 size={14} className="animate-spin text-muted-foreground" />
                            )}
                        </div>
                        <VirtualTable
                            rows={calls}
                            rowHeight={44}
                            overscan={10}
                            fetchMore={fetchNextPage}
                            hasMore={!!hasNextPage}
                            isFetchingNextPage={isFetchingNextPage}
                            className="flex-1 min-h-0"
                            tableClassName="w-full text-sm"
                            header={
                                <thead className={virtualTableStickyHeadClass}>
                                    <tr>
                                        <th className="px-3 py-2">{t('waiterCalls.colCalledAt')}</th>
                                        <th className="px-3 py-2">{t('waiterCalls.colTable')}</th>
                                        <th className="px-3 py-2">{t('waiterCalls.colStaff')}</th>
                                        <th className="px-3 py-2">{t('waiterCalls.colResponse')}</th>
                                        <th className="px-3 py-2">{t('waiterCalls.colStatus')}</th>
                                    </tr>
                                </thead>
                            }
                            emptyState={
                                isLoading ? (
                                    <div className="px-3 py-8 text-center">
                                        <Loader2 className="mx-auto animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <div className="px-3 py-8 text-center text-muted-foreground">{t('waiterCalls.empty')}</div>
                                )
                            }
                            loadingMore={
                                <tr>
                                    <td colSpan={5} className="py-3 text-center">
                                        <Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" />
                                    </td>
                                </tr>
                            }
                            renderRow={(row) => (
                                <>
                                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateTime(row.called_at)}</td>
                                    <td className="px-3 py-2">
                                        <div>{row.table_name}</div>
                                        <div className="text-2xs text-muted-foreground">{row.zone_name}</div>
                                    </td>
                                    <td className="px-3 py-2">{row.dismissed_by_name ?? '—'}</td>
                                    <td className="px-3 py-2 tabular-nums">{row.response_seconds ?? '—'}</td>
                                    <td className="px-3 py-2">{row.status_display}</td>
                                </>
                            )}
                        />
                    </div>
                </div>

                {/* Sağ: grafikler */}
                <div className="rounded-xl border border-border bg-card flex flex-col min-h-[320px] lg:min-h-0">
                    <div className="border-b border-border px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
                        <BarChart3 size={16} />
                        {t('waiterCalls.chartTitle')}
                    </div>
                    <div className="flex-1 min-h-[280px] p-4">
                        {isLoading ? (
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="animate-spin text-muted-foreground" />
                            </div>
                        ) : chartData.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                                {t('waiterCalls.empty')}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11 }}
                                        angle={-25}
                                        textAnchor="end"
                                        interval={0}
                                        height={60}
                                    />
                                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <RechartsTooltip
                                        formatter={(value, name) => {
                                            const numValue = typeof value === 'number' ? value : Number(value) || 0;
                                            if (name === 'avg') {
                                                return [`${numValue} ${t('waiterCalls.secondsShort')}`, t('waiterCalls.chartAvgLabel')];
                                            }
                                            return [value, name];
                                        }}
                                    />
                                    <Bar dataKey="avg" fill="#3b82f6" radius={[4, 4, 0, 0]} name="avg" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
