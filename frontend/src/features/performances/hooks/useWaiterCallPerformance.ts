'use client';

import { useState, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getRangeForPeriodPreset, type PeriodPresetId } from '../utils/periodFilter';
import { performancesApi } from '../services/performancesApi';
import { performancesLiveQueryOptions } from '../constants/livePoll';

const WAITER_CALLS_PAGE_SIZE = 200;

export function useWaiterCallPerformance() {
    const [branchId, setBranchId] = useState<string>('ALL');
    const [startDate, setStartDate] = useState(() => getRangeForPeriodPreset('today').start);
    const [endDate, setEndDate] = useState(() => getRangeForPeriodPreset('today').end);
    const [dateRangePreset, setDateRangePreset] = useState<PeriodPresetId | null>('today');

    const queryParams = useMemo(() => ({
        branch_id: branchId === 'ALL' ? undefined : branchId,
        start_date: startDate,
        end_date: endDate,
    }), [branchId, startDate, endDate]);

    const liveQueryOptions = performancesLiveQueryOptions(endDate);

    const callsQuery = useInfiniteQuery({
        queryKey: ['waiter-calls', queryParams],
        queryFn: async ({ pageParam = 1 }) => {
            return performancesApi.getWaiterCalls({
                ...queryParams,
                page: pageParam,
                page_size: WAITER_CALLS_PAGE_SIZE,
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
        queryKey: ['waiter-calls-analytics', queryParams],
        queryFn: () => performancesApi.getWaiterCallAnalytics(queryParams),
        ...liveQueryOptions,
    });

    const calls = useMemo(
        () => callsQuery.data?.pages.flatMap((p) => p.results) ?? [],
        [callsQuery.data],
    );

    const totals = callsQuery.data?.pages[0]?.totals ?? analyticsQuery.data?.totals;

    return {
        branchId,
        setBranchId,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        dateRangePreset,
        setDateRangePreset,
        calls,
        totals,
        staffPerformance: analyticsQuery.data?.staff_performance ?? [],
        isLoading: callsQuery.isLoading || analyticsQuery.isLoading,
        isFetching: callsQuery.isFetching || analyticsQuery.isFetching,
        hasNextPage: callsQuery.hasNextPage,
        fetchNextPage: callsQuery.fetchNextPage,
        isFetchingNextPage: callsQuery.isFetchingNextPage,
        queryParams,
    };
}
