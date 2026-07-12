import api, { skipInterceptorToast } from '@/lib/api';
import {
    Table,
    Zone,
    TableCreatePayload,
    TableBulkCreatePayload,
    TableReservePayload,
    ZoneSummary,
    ZoneCreatePayload,
    ZoneUpdatePayload,
} from '../types/table.types';

type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

function unwrap<T>(data: T[] | Paginated<T>): T[] {
    if (Array.isArray(data)) return data;
    return (data as Paginated<T>).results ?? [];
}

export const tablesApi = {
    getAll: async (params?: { branch_id?: string; zone_id?: string; status?: string }) => {
        const { data } = await api.get<Table[] | Paginated<Table>>('/tables/', { params });
        return unwrap(data);
    },

    getById: async (id: string) => {
        const { data } = await api.get<Table>(`/tables/${id}/`);
        return data;
    },

    create: async (payload: TableCreatePayload) => {
        const { data } = await api.post<Table>('/tables/', payload, { ...skipInterceptorToast });
        return data;
    },

    update: async (id: string, payload: Partial<TableCreatePayload>) => {
        const { data } = await api.patch<Table>(`/tables/${id}/`, payload, { ...skipInterceptorToast });
        return data;
    },

    delete: async (id: string) => {
        await api.delete(`/tables/${id}/`, { ...skipInterceptorToast });
    },

    open: async (id: string) => {
        const { data } = await api.post<Table>(`/tables/${id}/open/`, undefined, { ...skipInterceptorToast });
        return data;
    },

    close: async (id: string) => {
        const { data } = await api.post<Table>(`/tables/${id}/close/`, undefined, { ...skipInterceptorToast });
        return data;
    },

    forceClose: async (id: string) => {
        const { data } = await api.post<Table>(`/tables/${id}/force_close/`, undefined, { ...skipInterceptorToast });
        return data;
    },

    reserve: async (id: string, payload: TableReservePayload) => {
        const { data } = await api.post<Table>(
            `/tables/${id}/reserve/`,
            {
                reservation_info: payload.reservation_info,
                reservation_scheduled_at: payload.reservation_scheduled_at ?? null,
                reservation_party_size: payload.reservation_party_size ?? null,
            },
            { ...skipInterceptorToast },
        );
        return data;
    },

    cancelReservation: async (id: string) => {
        const { data } = await api.post<Table>(`/tables/${id}/cancel_reservation/`, undefined, { ...skipInterceptorToast });
        return data;
    },

    setOutOfService: async (id: string) => {
        const { data } = await api.post<Table>(`/tables/${id}/set_out_of_service/`, undefined, { ...skipInterceptorToast });
        return data;
    },

    startCleaning: async (id: string) => {
        const { data } = await api.post<Table>(`/tables/${id}/start_cleaning/`, undefined, { ...skipInterceptorToast });
        return data;
    },

    finishCleaning: async (id: string) => {
        const { data } = await api.post<Table>(`/tables/${id}/finish_cleaning/`, undefined, { ...skipInterceptorToast });
        return data;
    },

    getQrCode: async (id: string) => {
        const { data } = await api.get<{
            table_id: string;
            table_name: string;
            zone_name: string;
            qr_code: string;
        }>(`/tables/${id}/qrcode/`);
        return data;
    },

    bulkCreate: async (payload: TableBulkCreatePayload) => {
        const { data } = await api.post<Table[] | Paginated<Table>>('/tables/bulk_create/', payload, { ...skipInterceptorToast });
        return unwrap(data);
    },

    getZoneSummary: async (branch_id?: string) => {
        const { data } = await api.get<ZoneSummary[] | Paginated<ZoneSummary>>('/zones/summary/', { params: { branch_id } });
        return unwrap(data);
    },

    getZones: async (branch_id?: string) => {
        const { data } = await api.get<Zone[] | Paginated<Zone>>('/zones/', { params: { branch_id } });
        return unwrap(data);
    },

    createZone: async (payload: ZoneCreatePayload) => {
        const { data } = await api.post<Zone>('/zones/', payload, { ...skipInterceptorToast });
        return data;
    },

    updateZone: async (id: string, payload: ZoneUpdatePayload) => {
        const { data } = await api.patch<Zone>(`/zones/${id}/`, payload, { ...skipInterceptorToast });
        return data;
    },

    deleteZone: async (id: string) => {
        await api.delete(`/zones/${id}/`, { ...skipInterceptorToast });
    },
    reorderZones: async (order: string[]) => {
        const { data } = await api.post('/zones/reorder/', { order }, { ...skipInterceptorToast });
        return data;
    },
};
