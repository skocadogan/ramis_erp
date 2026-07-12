import api from '@/lib/api';

export interface WaiterCallLog {
    id: string;
    branch: string;
    branch_name: string;
    table: string | null;
    table_name: string;
    zone_name: string;
    source: string;
    status: string;
    status_display: string;
    notified_count: number;
    called_at: string;
    dismissed_at: string | null;
    dismissed_by: number | null;
    dismissed_by_name: string | null;
    response_seconds: number | null;
}

interface WaiterCallTotals {
    total_calls: number;
    dismissed_calls: number;
    pending_calls: number;
    avg_response_seconds: number;
}

export interface StaffPerformanceRow {
    staff_id: number;
    staff_name: string;
    call_count: number;
    avg_response_seconds: number;
    min_response_seconds: number | null;
    max_response_seconds: number | null;
}

export interface WaiterCallAnalytics {
    totals: WaiterCallTotals;
    staff_performance: StaffPerformanceRow[];
}

export interface PaginatedWaiterCalls {
    count: number;
    next: string | null;
    previous: string | null;
    results: WaiterCallLog[];
    totals: WaiterCallTotals;
}

function buildParams(params: Record<string, string | number | undefined>) {
    const q: Record<string, string | number> = {};
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== 'ALL') q[k] = v;
    });
    return q;
}

export type OrderChannel = 'mobile' | 'web' | 'unknown';

export interface WaiterOrderSalesRow {
    id: string;
    branch: string;
    branch_name: string;
    table: string | null;
    table_name: string | null;
    zone_name: string;
    staff_id: number;
    staff_name: string;
    order_number: string | null;
    order_type: string;
    status: string;
    status_display: string;
    total_amount: string;
    cancel_reason_code: string | null;
    cancel_reason_display: string | null;
    order_channel: OrderChannel;
    created_at: string;
}

export interface WaiterOrderTotals {
    total_orders: number;
    cancelled_orders: number;
    active_orders: number;
    total_sales_amount: string;
    avg_order_amount: number;
    mobile_orders: number;
    web_orders: number;
    unknown_channel_orders: number;
}

export interface WaiterStaffSalesRow {
    staff_id: number;
    staff_name: string;
    order_count: number;
    active_order_count: number;
    cancelled_count: number;
    total_amount: string;
    avg_order_amount: number;
    table_count: number;
    busiest_day: string | null;
    busiest_day_order_count: number;
    top_table_id: string | null;
    top_table_name: string | null;
    top_table_zone: string | null;
    top_table_amount: string;
    mobile_order_count: number;
    web_order_count: number;
    unknown_channel_count: number;
    cancel_reasons: { code: string; label: string; count: number }[];
}

export interface CancellationBreakdownRow {
    code: string;
    label: string;
    count: number;
}

export interface DailySalesRow {
    date: string | null;
    order_count: number;
    sales_total: string;
}

export interface WaiterOrderAnalytics {
    totals: WaiterOrderTotals;
    staff_performance: WaiterStaffSalesRow[];
    cancellation_breakdown: CancellationBreakdownRow[];
    daily_sales: DailySalesRow[];
}

export interface PaginatedWaiterOrders {
    count: number;
    next: string | null;
    previous: string | null;
    results: WaiterOrderSalesRow[];
    totals: WaiterOrderTotals;
}

export const performancesApi = {
    getWaiterCalls: async (params: Record<string, string | number | undefined> = {}) => {
        const res = await api.get<PaginatedWaiterCalls>('/performances/waiter-calls/', {
            params: buildParams(params),
        });
        return res.data;
    },

    getWaiterCallAnalytics: async (params: Record<string, string | undefined> = {}) => {
        const res = await api.get<WaiterCallAnalytics>('/performances/waiter-calls/analytics/', {
            params: buildParams(params),
        });
        return res.data;
    },

    exportWaiterCallsPdf: async (params: Record<string, string | undefined> = {}) => {
        const res = await api.get('/performances/waiter-calls/export/pdf/', {
            params: buildParams(params),
            responseType: 'blob',
        });
        return res.data as Blob;
    },

    exportWaiterCallsExcel: async (params: Record<string, string | undefined> = {}) => {
        const res = await api.get('/performances/waiter-calls/export/excel/', {
            params: buildParams(params),
            responseType: 'blob',
        });
        return res.data as Blob;
    },

    getWaiterSales: async (params: Record<string, string | number | undefined> = {}) => {
        const res = await api.get<PaginatedWaiterOrders>('/performances/waiter-sales/', {
            params: buildParams(params),
        });
        return res.data;
    },

    getWaiterSalesAnalytics: async (params: Record<string, string | undefined> = {}) => {
        const res = await api.get<WaiterOrderAnalytics>('/performances/waiter-sales/analytics/', {
            params: buildParams(params),
        });
        return res.data;
    },

    exportWaiterSalesPdf: async (params: Record<string, string | undefined> = {}) => {
        const res = await api.get('/performances/waiter-sales/export/pdf/', {
            params: buildParams(params),
            responseType: 'blob',
        });
        return res.data as Blob;
    },

    exportWaiterSalesExcel: async (params: Record<string, string | undefined> = {}) => {
        const res = await api.get('/performances/waiter-sales/export/excel/', {
            params: buildParams(params),
            responseType: 'blob',
        });
        return res.data as Blob;
    },
};
