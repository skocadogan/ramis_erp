'use client';

import { useState, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getRangeForPeriodPreset, type PeriodPresetId } from '../utils/periodFilter';
import { performancesApi } from '../services/performancesApi';
import { performancesLiveQueryOptions } from '../constants/livePoll';

const WAITER_SALES_PAGE_SIZE = 200;

export function useWaiterSalesPerformance() {
    const [branchId, setBranchId] = useState<string>('ALL');
    const [startDate, setStartDate] = useState(() => getRangeForPeriodPreset('today').start);
    const [endDate, setEndDate] = useState(() => getRangeForPeriodPreset('today').end);
    const [dateRangePreset, setDateRangePreset] = useState<PeriodPresetId | null>('today');

    const queryParams = useMemo(
        () => ({
            branch_id: branchId === 'ALL' ? undefined : branchId,
            start_date: startDate,
            end_date: endDate,
        }),
        [branchId, startDate, endDate],
    );

    const liveQueryOptions = performancesLiveQueryOptions(endDate);

    const ordersQuery = useInfiniteQuery({
        queryKey: ['waiter-sales', queryParams],
        queryFn: async ({ pageParam = 1 }) => {
            return performancesApi.getWaiterSales({
                ...queryParams,
                page: pageParam,
                page_size: WAITER_SALES_PAGE_SIZE,
            });
        },
        getNextPageParam: (lastPage) => {
            if (!lastPage.next) return undefined;
            const url = new URL(lastPage.next);
            return Number(url.searchParams.get('page'));
        },
        initialPageParam: 1,
        ...liveQueryOptions,
    });

    const analyticsQuery = useQuery({
        queryKey: ['waiter-sales-analytics', queryParams],
        queryFn: () => performancesApi.getWaiterSalesAnalytics(queryParams),
        ...liveQueryOptions,
    });

    const orders = useMemo(
        () => ordersQuery.data?.pages.flatMap((p) => p.results) ?? [],
        [ordersQuery.data],
    );

    const totals = ordersQuery.data?.pages[0]?.totals ?? analyticsQuery.data?.totals;

    return {
        branchId,
        setBranchId,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        dateRangePreset,
        setDateRangePreset,
        orders,
        totals,
        staffPerformance: analyticsQuery.data?.staff_performance ?? [],
        cancellationBreakdown: analyticsQuery.data?.cancellation_breakdown ?? [],
        dailySales: analyticsQuery.data?.daily_sales ?? [],
        isLoading: ordersQuery.isLoading || analyticsQuery.isLoading,
        isFetching: ordersQuery.isFetching || analyticsQuery.isFetching,
        hasNextPage: ordersQuery.hasNextPage,
        fetchNextPage: ordersQuery.fetchNextPage,
        isFetchingNextPage: ordersQuery.isFetchingNextPage,
        queryParams,
    };
}
