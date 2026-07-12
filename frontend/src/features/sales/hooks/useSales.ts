"use client";

import { useState, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRangeForSalesPeriodPreset } from '../utils/salesPeriod';
import type { SalesPeriodPresetId } from '../utils/salesPeriod';
import { salesApi } from '../services/salesApi';
import { parseListTotals, sumSaleMoneyTotals } from '../types';
import type { TabType } from '../types';
import { queryKeys } from '@/lib/queryKeys';

export type { TabType };
export { sumSaleMoneyTotals };

const PAGE_SIZE = 200;

export function useSales() {
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState<TabType>('sales');
    const [search, setSearch] = useState('');
    const [tableId, setTableId] = useState('');
    const [cashierId, setCashierId] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('ALL');
    const [startDate, setStartDate] = useState(() => getRangeForSalesPeriodPreset('today').start);
    const [endDate, setEndDate] = useState(() => getRangeForSalesPeriodPreset('today').end);
    const [dateRangePreset, setDateRangePreset] = useState<SalesPeriodPresetId | null>('today');
    const [discountOnly, setDiscountOnly] = useState(false);
    const [branchId, setBranchId] = useState<string>('ALL');

    const salesQuery = useInfiniteQuery({
        queryKey: queryKeys.sales({ paymentFilter, startDate, endDate, discountOnly, branchId, tableId, cashierId }),
        queryFn: async ({ pageParam = 1 }) => {
            const params: Record<string, string | number> = { page: pageParam, page_size: PAGE_SIZE };
            if (paymentFilter !== 'ALL') params.payment_method = paymentFilter;
            if (branchId !== 'ALL') params.branch_id = branchId;
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (discountOnly) params.discount_only = '1';
            if (tableId) params.table_id = tableId;
            if (cashierId) params.created_by_id = cashierId;
            return salesApi.getSales(params);
        },
        getNextPageParam: (lastPage) => {
            if (!lastPage.next) return undefined;
            const url = new URL(lastPage.next);
            return Number(url.searchParams.get('page'));
        },
        initialPageParam: 1,
        enabled: activeTab === 'sales',
    });

    const { data: summary, isLoading: isSummaryLoading, isFetching: isSummaryFetching } = useQuery({
        queryKey: queryKeys.salesSummary({ branchId }),
        queryFn: () => {
            const params: Record<string, string> = {};
            if (branchId !== 'ALL') params.branch_id = branchId;
            return salesApi.getSalesSummary(params);
        },
        enabled: true,
    });

    const sales = useMemo(() => {
        return salesQuery.data?.pages.flatMap(p => p.results) || [];
    }, [salesQuery.data]);

    const salesTotals = useMemo(() => {
        const lastPage = salesQuery.data?.pages[0];
        return parseListTotals(lastPage || {}, sales);
    }, [salesQuery.data, sales]);

    const totalCount = salesQuery.data?.pages[0]?.count || 0;

    const clearFilters = () => {
        setPaymentFilter('ALL');
        setBranchId('ALL');
        const t = getRangeForSalesPeriodPreset('today');
        setStartDate(t.start);
        setEndDate(t.end);
        setDateRangePreset('today');
        setSearch('');
        setTableId('');
        setCashierId('');
        setDiscountOnly(false);
    };

    return {
        activeTab, setActiveTab,
        sales,
        summary: summary || null,
        isLoading: salesQuery.isLoading, 
        isSummaryLoading,
        isFetching: salesQuery.isFetching, 
        isSummaryFetching,
        search, setSearch,
        tableId, setTableId,
        cashierId, setCashierId,
        paymentFilter, setPaymentFilter,
        startDate, setStartDate,
        endDate, setEndDate,
        dateRangePreset, setDateRangePreset,
        discountOnly, setDiscountOnly,
        branchId, setBranchId,
        totalCount,
        salesTotals,
        fetchSummary: () => queryClient.invalidateQueries({ queryKey: queryKeys.salesSummaryBase }),
        clearFilters,
        infiniteControls: {
            fetchNextPage: salesQuery.fetchNextPage,
            hasNextPage: salesQuery.hasNextPage,
            isFetchingNextPage: salesQuery.isFetchingNextPage
        }
    };
}
