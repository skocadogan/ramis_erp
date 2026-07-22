'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/useAuthStore';
import {
    getPosSyncWsUrl,
    getWaiterCallsWsUrl,
    posSyncHubKey,
    resolveBranchIdForWs,
    subscribeSharedWebSocket,
    waiterCallsHubKey,
    acceptWsEvent,
} from '@/lib/ws';
import { shouldLivePollPerformances } from '../constants/livePoll';

function invalidateWaiterCallQueries(qc: ReturnType<typeof useQueryClient>) {
    void qc.invalidateQueries({ queryKey: ['waiter-calls'] });
    void qc.invalidateQueries({ queryKey: ['waiter-calls-analytics'] });
}

function invalidateWaiterSalesQueries(qc: ReturnType<typeof useQueryClient>) {
    void qc.invalidateQueries({ queryKey: ['waiter-sales'] });
    void qc.invalidateQueries({ queryKey: ['waiter-sales-analytics'] });
}

/**
 * Garson çağrı / sipariş olaylarında analitik sorgularını anında yeniler.
 * HTTP yedek polling `performancesLiveQueryOptions` ile birlikte çalışır.
 */
export function usePerformancesLiveSync(options: {
    enabled: boolean;
    branchId: string;
    endDate: string;
}) {
    const { enabled, branchId, endDate } = options;
    const qc = useQueryClient();
    const token = useAuthStore((s) => s.token);
    const hasToken = !!token;

    const live = enabled && shouldLivePollPerformances(endDate);
    const wsBranchId =
        branchId === 'ALL' ? resolveBranchIdForWs(undefined) : branchId;

    useEffect(() => {
        if (!live || !hasToken) return;

        const callsSequenceKey = `perf-calls:${wsBranchId ?? 'global'}`;
        const cleanupCalls = subscribeSharedWebSocket(waiterCallsHubKey(wsBranchId), {
            tag: 'performances-waiter-calls',
            enabled: true,
            getUrl: () => getWaiterCallsWsUrl(wsBranchId),
            onMessage: (event) => {
                try {
                    const parsed = acceptWsEvent(event.data, callsSequenceKey);
                    if (!parsed) return;
                    if (
                        parsed.type === 'waiter_call' ||
                        parsed.type === 'waiter_call_dismissed'
                    ) {
                        invalidateWaiterCallQueries(qc);
                    }
                } catch (err) {
                    console.error('Performances waiter-call WS parse error', err);
                }
            },
        });

        const ordersSequenceKey = `perf-orders:${wsBranchId ?? 'global'}`;
        const cleanupOrders = subscribeSharedWebSocket(posSyncHubKey(wsBranchId, 'web'), {
            tag: 'performances-pos-sync',
            enabled: true,
            getUrl: () => getPosSyncWsUrl(wsBranchId, undefined, 'web'),
            onMessage: (event) => {
                try {
                    const parsed = acceptWsEvent(event.data, ordersSequenceKey);
                    if (!parsed) return;
                    if (
                        parsed.type === 'orders_updated' ||
                        parsed.type === 'order_status_changed' ||
                        parsed.type === 'kds.refresh'
                    ) {
                        invalidateWaiterSalesQueries(qc);
                    }
                } catch (err) {
                    console.error('Performances pos-sync WS parse error', err);
                }
            },
        });

        return () => {
            cleanupCalls();
            cleanupOrders();
        };
    }, [live, hasToken, wsBranchId, qc]);
}
