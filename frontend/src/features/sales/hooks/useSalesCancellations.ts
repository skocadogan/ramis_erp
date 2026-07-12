"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { salesApi } from "../services/salesApi";
import { parseCancellationTotals } from "../types";
import type { SalesPeriodPresetId } from "../utils/salesPeriod";

const CANCELLATIONS_PAGE_SIZE = 200;

interface UseSalesCancellationsArgs {
    enabled: boolean;
    branchId: string;
    startDate: string;
    endDate: string;
    dateRangePreset: SalesPeriodPresetId | null;
}

export function useSalesCancellations({
    enabled,
    branchId,
    startDate,
    endDate,
}: UseSalesCancellationsArgs) {
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 500);
    const [tableId, setTableId] = useState("");
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

    const query = useInfiniteQuery({
        queryKey: [
            "sales-cancellations",
            branchId,
            startDate,
            endDate,
            debouncedSearch,
            tableId,
            selectedProductId,
        ],
        queryFn: async ({ pageParam = 1 }) => {
            const params: Record<string, string | number> = {
                page: pageParam,
                page_size: CANCELLATIONS_PAGE_SIZE,
            };
            if (branchId !== "ALL") params.branch_id = branchId;
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (debouncedSearch) params.search = debouncedSearch;
            if (tableId) params.table_id = tableId;
            if (selectedProductId) params.product_id = selectedProductId;
            return salesApi.getCancellations(params);
        },
        getNextPageParam: (lastPage) => {
            if (!lastPage.next) return undefined;
            const url = new URL(lastPage.next);
            return Number(url.searchParams.get("page"));
        },
        initialPageParam: 1,
        enabled,
    });

    const rows = useMemo(
        () => query.data?.pages.flatMap((p) => p.results) || [],
        [query.data],
    );

    const totals = useMemo(() => {
        const lastPage = query.data?.pages[0];
        return parseCancellationTotals(lastPage || {}, rows);
    }, [query.data, rows]);

    const totalCount = query.data?.pages[0]?.count || 0;

    const clearFilters = () => {
        setSearch("");
        setTableId("");
        setSelectedProductId(null);
    };

    const isAtDefaultFilters = !search.trim() && !tableId && !selectedProductId;

    return {
        rows,
        totals,
        totalCount,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        search,
        setSearch,
        tableId,
        setTableId,
        selectedProductId,
        setSelectedProductId,
        clearFilters,
        isAtDefaultFilters,
        infiniteControls: {
            fetchNextPage: query.fetchNextPage,
            hasNextPage: query.hasNextPage,
            isFetchingNextPage: query.isFetchingNextPage,
        },
    };
}

;
