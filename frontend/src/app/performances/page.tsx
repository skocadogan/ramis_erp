"use client";

import React, { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/shell/AppShell';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { BranchSelect } from '@/features/branches/components/BranchSelect';
import { Loader2 } from 'lucide-react';

const WaiterCallPerformancePanel = dynamic(
    () => import('@/features/performances/components/WaiterCallPerformancePanel').then(m => ({ default: m.WaiterCallPerformancePanel })),
    { ssr: false, loading: () => <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin size-8 text-muted-foreground" /></div> }
);
const WaiterSalesPerformancePanel = dynamic(
    () => import('@/features/performances/components/WaiterSalesPerformancePanel').then(m => ({ default: m.WaiterSalesPerformancePanel })),
    { ssr: false, loading: () => <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin size-8 text-muted-foreground" /></div> }
);
import { useWaiterCallPerformance } from '@/features/performances/hooks/useWaiterCallPerformance';
import { useWaiterSalesPerformance } from '@/features/performances/hooks/useWaiterSalesPerformance';
import { usePerformancesLiveSync } from '@/features/performances/hooks/usePerformancesLiveSync';
import type { PeriodPresetId } from '@/features/performances/utils/periodFilter';

type PerformanceTab = 'waiterCalls' | 'waiterSales';

function PerformancesPageContent() {
    const t = useTranslations('performances');
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<PerformanceTab>('waiterCalls');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'waiterCalls' || tab === 'waiterSales') {
            setActiveTab(tab);
        }
    }, [searchParams]);
    const callPerf = useWaiterCallPerformance();
    const salesPerf = useWaiterSalesPerformance();

    const liveEndDate =
        activeTab === 'waiterCalls' ? callPerf.endDate : salesPerf.endDate;
    const liveBranchId =
        activeTab === 'waiterCalls' ? callPerf.branchId : salesPerf.branchId;

    usePerformancesLiveSync({
        enabled: true,
        branchId: liveBranchId,
        endDate: liveEndDate,
    });

    const handleCallDateSelect = (preset: PeriodPresetId, range: { start: string; end: string }) => {
        callPerf.setDateRangePreset(preset);
        callPerf.setStartDate(range.start);
        callPerf.setEndDate(range.end);
    };

    const handleSalesDateSelect = (preset: PeriodPresetId, range: { start: string; end: string }) => {
        salesPerf.setDateRangePreset(preset);
        salesPerf.setStartDate(range.start);
        salesPerf.setEndDate(range.end);
    };

    const tabClass = (tab: PerformanceTab) =>
        `flex items-center gap-1.5 px-3 py-3 text-sm font-ui-medium border-b-2 transition-colors ${
            activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
        }`;

    const handleBranchChange = (id: string) => {
        callPerf.setBranchId(id);
        salesPerf.setBranchId(id);
    };

    const tabLabels = useMemo(
        () => ({
            waiterCalls: t('tabs.waiterCalls'),
            waiterSales: t('tabs.waiterSales'),
        }),
        [t],
    );

    return (
        <AppShell>
            <div className="flex h-full flex-col bg-slate-50 overflow-hidden dark:bg-slate-950">
                <div className="flex items-center gap-1 border-b border-border bg-white px-4 dark:bg-slate-900 dark:border-slate-700">
                    <button
                        type="button"
                        className={tabClass('waiterCalls')}
                        onClick={() => setActiveTab('waiterCalls')}
                    >
                        {tabLabels.waiterCalls}
                    </button>
                    <button
                        type="button"
                        className={tabClass('waiterSales')}
                        onClick={() => setActiveTab('waiterSales')}
                    >
                        {tabLabels.waiterSales}
                    </button>
                    <div className="ms-auto">
                        <BranchSelect
                            value={
                                activeTab === 'waiterCalls' ? callPerf.branchId : salesPerf.branchId
                            }
                            onChange={handleBranchChange}
                            includeAll
                            className="w-52"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-hidden p-4">
                    {activeTab === 'waiterCalls' ? (
                        <WaiterCallPerformancePanel
                            branchId={callPerf.branchId}
                            startDate={callPerf.startDate}
                            endDate={callPerf.endDate}
                            dateRangePreset={callPerf.dateRangePreset}
                            calls={callPerf.calls}
                            staffPerformance={callPerf.staffPerformance}
                            totals={callPerf.totals}
                            isLoading={callPerf.isLoading}
                            isFetching={callPerf.isFetching}
                            hasNextPage={callPerf.hasNextPage}
                            isFetchingNextPage={callPerf.isFetchingNextPage}
                            fetchNextPage={callPerf.fetchNextPage}
                            onDateSelect={handleCallDateSelect}
                            onStartDateChange={(val) => {
                                callPerf.setDateRangePreset('custom');
                                callPerf.setStartDate(val);
                            }}
                            onEndDateChange={(val) => {
                                callPerf.setDateRangePreset('custom');
                                callPerf.setEndDate(val);
                            }}
                        />
                    ) : (
                        <WaiterSalesPerformancePanel
                            branchId={salesPerf.branchId}
                            startDate={salesPerf.startDate}
                            endDate={salesPerf.endDate}
                            dateRangePreset={salesPerf.dateRangePreset}
                            orders={salesPerf.orders}
                            staffPerformance={salesPerf.staffPerformance}
                            cancellationBreakdown={salesPerf.cancellationBreakdown}
                            dailySales={salesPerf.dailySales}
                            totals={salesPerf.totals}
                            isLoading={salesPerf.isLoading}
                            isFetching={salesPerf.isFetching}
                            hasNextPage={salesPerf.hasNextPage}
                            isFetchingNextPage={salesPerf.isFetchingNextPage}
                            fetchNextPage={salesPerf.fetchNextPage}
                            onDateSelect={handleSalesDateSelect}
                            onStartDateChange={(val) => {
                                salesPerf.setDateRangePreset('custom');
                                salesPerf.setStartDate(val);
                            }}
                            onEndDateChange={(val) => {
                                salesPerf.setDateRangePreset('custom');
                                salesPerf.setEndDate(val);
                            }}
                        />
                    )}
                </div>
            </div>
        </AppShell>
    );
}

export default function PerformancesPage() {
    return (
        <AuthGuard module="performances">
            <PerformancesPageContent />
        </AuthGuard>
    );
}
