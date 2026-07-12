import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tablesApi } from '../services/tablesApi';
import { queryKeys } from '@/lib/queryKeys';
import {
    TableCreatePayload,
    TableBulkCreatePayload,
    TableReservePayload,
    ZoneCreatePayload,
    ZoneUpdatePayload,
} from '../types/table.types';

export const useTables = (params?: { branch_id?: string; zone_id?: string; status?: string }) => {
    return useQuery({
        queryKey: ['tables', params],
        queryFn: () => tablesApi.getAll(params),
        staleTime: 60000, // 1 dakika boyunca önbellekte kalsın (WebSocket yeniliyor)
    });
};

export const useZones = (branch_id?: string) => {
    return useQuery({
        queryKey: queryKeys.zones(branch_id),
        queryFn: () => tablesApi.getZones(branch_id),
        staleTime: 60000,
        enabled: Boolean(branch_id),
    });
};

export const useZoneSummary = (branch_id?: string) => {
    return useQuery({
        queryKey: ['zones', 'summary', branch_id],
        queryFn: () => tablesApi.getZoneSummary(branch_id),
        staleTime: 60000,
        enabled: Boolean(branch_id),
    });
};

export const useTableMutations = () => {
    const queryClient = useQueryClient();

    const invalidateTables = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tablesBase });
        queryClient.invalidateQueries({ queryKey: ['zones', 'summary'] });
    };

    const createMutation = useMutation({
        mutationFn: (payload: TableCreatePayload) => tablesApi.create(payload),
        onSuccess: invalidateTables,
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<TableCreatePayload> }) =>
            tablesApi.update(id, payload),
        onSuccess: invalidateTables,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => tablesApi.delete(id),
        onSuccess: invalidateTables,
    });

    const bulkCreateMutation = useMutation({
        mutationFn: (payload: TableBulkCreatePayload) => tablesApi.bulkCreate(payload),
        onSuccess: invalidateTables,
    });

    const changeStatusMutation = useMutation({
        mutationFn: ({
            id,
            action,
            reservation_info,
            reservation_scheduled_at,
            reservation_party_size,
        }: {
            id: string;
            action: 'open' | 'close' | 'reserve' | 'out_of_service' | 'start_cleaning' | 'finish_cleaning';
            reservation_info?: string;
            reservation_scheduled_at?: string | null;
            reservation_party_size?: number | null;
        }) => {
            switch (action) {
                case 'open':
                    return tablesApi.open(id);
                case 'close':
                    return tablesApi.close(id);
                case 'reserve':
                    return tablesApi.reserve(id, {
                        reservation_info: reservation_info ?? '',
                        reservation_scheduled_at,
                        reservation_party_size,
                    } satisfies TableReservePayload);
                case 'out_of_service':
                    return tablesApi.setOutOfService(id);
                case 'start_cleaning':
                    return tablesApi.startCleaning(id);
                case 'finish_cleaning':
                    return tablesApi.finishCleaning(id);
            }
        },
        onSuccess: invalidateTables,
    });

    const cancelReservationMutation = useMutation({
        mutationFn: (id: string) => tablesApi.cancelReservation(id),
        onSuccess: invalidateTables,
    });

    const forceCloseTableMutation = useMutation({
        mutationFn: (id: string) => tablesApi.forceClose(id),
        onSuccess: invalidateTables,
    });

    return {
        createTable: createMutation.mutateAsync,
        updateTable: updateMutation.mutateAsync,
        deleteTable: deleteMutation.mutateAsync,
        bulkCreateTable: bulkCreateMutation.mutateAsync,
        changeStatus: changeStatusMutation.mutateAsync,
        cancelReservation: cancelReservationMutation.mutateAsync,
        forceCloseTable: forceCloseTableMutation.mutateAsync,
        isPending:
            createMutation.isPending ||
            updateMutation.isPending ||
            deleteMutation.isPending ||
            bulkCreateMutation.isPending ||
            changeStatusMutation.isPending ||
            cancelReservationMutation.isPending ||
            forceCloseTableMutation.isPending,
    };
};

export const useZoneMutations = () => {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.zonesBase });
        queryClient.invalidateQueries({ queryKey: queryKeys.tablesBase });
        queryClient.invalidateQueries({ queryKey: ['zones', 'summary'] });
    };

    const createMutation = useMutation({
        mutationFn: (payload: ZoneCreatePayload) => tablesApi.createZone(payload),
        onSuccess: invalidate,
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: ZoneUpdatePayload }) =>
            tablesApi.updateZone(id, payload),
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => tablesApi.deleteZone(id),
        onSuccess: invalidate,
    });

    const reorderMutation = useMutation({
        mutationFn: (order: string[]) => tablesApi.reorderZones(order),
        onSuccess: invalidate,
    });

    return {
        createZone: createMutation.mutateAsync,
        updateZone: updateMutation.mutateAsync,
        deleteZone: deleteMutation.mutateAsync,
        reorderZone: reorderMutation.mutateAsync,
        isPending:
            createMutation.isPending ||
            updateMutation.isPending ||
            deleteMutation.isPending ||
            reorderMutation.isPending,
    };
};

