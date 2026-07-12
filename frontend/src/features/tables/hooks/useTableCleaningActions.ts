'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { tablesApi } from '../services/tablesApi';
import { toastApiError, toastApiSuccess } from '@/lib/operationalToast';
import { queryKeys } from '@/lib/queryKeys';
import type { Table as PosTable } from '@/types/pos';

export function useTableCleaningActions() {
    const queryClient = useQueryClient();
    const t = useTranslations('tables.actions');

    const invalidate = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tablesBase });
        void queryClient.invalidateQueries({ queryKey: ['zones', 'summary'] });
    }, [queryClient]);

    const applyTable = useCallback(
        (table: PosTable) => {
            queryClient.setQueriesData({ queryKey: queryKeys.posTablesBase }, (oldData: unknown) => {
                if (!oldData) return oldData;
                const isArray = Array.isArray(oldData);
                const list = isArray ? oldData : (oldData as { results?: unknown }).results;
                if (!Array.isArray(list)) return oldData;
                const idx = list.findIndex((row: PosTable) => row.id === table.id);
                const newList =
                    idx >= 0
                        ? list.map((row: PosTable, i: number) => (i === idx ? { ...row, ...table } : row))
                        : [table, ...list];
                return isArray ? newList : { ...(oldData as object), results: newList };
            });
        },
        [queryClient],
    );

    const startCleaning = useCallback(
        async (tableId: string) => {
            const previousTables = queryClient.getQueryData<PosTable[]>(queryKeys.posTables());
            const currentTable = previousTables?.find((t) => t.id === tableId);
            
            if (currentTable) {
                const optimisticTable = {
                    ...currentTable,
                    status: 'CLEANING',
                    cleaning_until: new Date(Date.now() + 300 * 1000).toISOString(),
                    cleaning_remaining_seconds: 300,
                } as PosTable;
                applyTable(optimisticTable);
            }

            try {
                const updated = await tablesApi.startCleaning(tableId);
                applyTable(updated as PosTable);
                invalidate();
                toastApiSuccess(t('startCleaningSuccess'));
            } catch (e) {
                if (currentTable) {
                    applyTable(currentTable);
                }
                toastApiError(e, t('startCleaningError'));
            }
        },
        [applyTable, invalidate, t, queryClient],
    );

    const finishCleaning = useCallback(
        async (tableId: string, options?: { silent?: boolean }) => {
            const previousTables = queryClient.getQueryData<PosTable[]>(queryKeys.posTables());
            const currentTable = previousTables?.find((t) => t.id === tableId);
            
            if (currentTable) {
                const optimisticTable = {
                    ...currentTable,
                    status: 'FREE',
                    cleaning_until: null,
                    cleaning_remaining_seconds: null,
                } as PosTable;
                applyTable(optimisticTable);
            }

            try {
                const updated = await tablesApi.finishCleaning(tableId);
                applyTable(updated as PosTable);
                invalidate();
                if (!options?.silent) {
                    toastApiSuccess(t('finishCleaningSuccess'));
                }
            } catch (e) {
                if (currentTable) {
                    applyTable(currentTable);
                }
                if (!options?.silent) {
                    toastApiError(e, t('finishCleaningError'));
                }
            }
        },
        [applyTable, invalidate, t, queryClient],
    );

    return { startCleaning, finishCleaning };
}
