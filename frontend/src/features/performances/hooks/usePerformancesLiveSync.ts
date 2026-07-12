'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/useAuthStore';
import { getPosSyncWsUrl, getWaiterCallsWsUrl, runManagedWebSocket, resolveBranchIdForWs } from '@/lib/ws';
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

    const live = enabled && shouldLivePollPerformances(endDate);
    const wsBranchId =
        branchId === 'ALL' ? resolveBranchIdForWs(undefined) : branchId;

    useEffect(() => {
        if (!live || !token) return;

        const cleanupCalls = runManagedWebSocket({
            tag: 'performances-waiter-calls',
            enabled: true,
            getUrl: () => getWaiterCallsWsUrl(wsBranchId),
            onMessage: (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    if (
                        payload.type === 'waiter_call' ||
                        payload.type === 'waiter_call_dismissed'
                    ) {
                        invalidateWaiterCallQueries(qc);
                    }
                } catch (err) {
                    console.error('Performances waiter-call WS parse error', err);
                }
            },
        });

        const cleanupOrders = runManagedWebSocket({
            tag: 'performances-pos-sync',
            enabled: true,
            getUrl: () => getPosSyncWsUrl(wsBranchId, undefined, 'web'),
            onMessage: (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    if (
                        payload.type === 'orders_updated' ||
                        payload.type === 'order_status_changed' ||
                        payload.type === 'kds.refresh'
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
    }, [live, token, wsBranchId, qc]);
}
