export type TableStatus = 'FREE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'OUT_OF_SERVICE';
export type TableSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'EXTRA_LARGE';
export type TableShape = 'ROUND' | 'SQUARE' | 'RECTANGLE';

export interface Zone {
    id: string;
    name: string;
    branch: string;
    description?: string | null;
    is_active: boolean;
    is_takeaway: boolean;
    color?: string;
    sort_order: number;
}

export interface ZoneCreatePayload {
    branch: string;
    name: string;
    description?: string;
    color?: string;
    is_takeaway?: boolean;
}

export interface ZoneUpdatePayload {
    name?: string;
    description?: string | null;
    is_active?: boolean;
    color?: string;
    is_takeaway?: boolean;
    sort_order?: number;
}

export interface Table {
    id: string;
    name: string;
    table_number: number;
    zone: string;
    zone_name: string;
    /** Paket bölgesi: temizlik akışı yok */
    zone_is_takeaway?: boolean;
    branch_name: string;
    capacity: number;
    min_capacity: number;
    size: TableSize;
    shape: TableShape;
    status: TableStatus;
    /** OCCUPIED: mutfak/teslim öncesi turuncu; hesap aşaması kırmızı (POS ile aynı). */
    pos_occupied_flow?: 'KITCHEN' | 'SETTLE' | null;
    position_x: number;
    position_y: number;
    /** Rezerve masada kime / iletişim / not */
    reservation_info?: string;
    /** Planlanan geliş (ISO 8601) */
    reservation_scheduled_at?: string | null;
    reservation_party_size?: number | null;
    notes?: string;
    is_active: boolean;
    active_order?: {
        id: string;
        total_amount: number;
        created_at: string;
    } | null;
    active_orders?: {
        id: string;
        total_amount: number;
        created_at: string;
    }[];
    order_count: number;
    cleaning_started_at?: string | null;
    cleaning_until?: string | null;
    cleaning_remaining_seconds?: number | null;
    assigned_waiters?: string[];
}

export interface ZoneSummary {
    id: string;
    name: string;
    total_tables: number;
    free_tables: number;
    occupied_tables: number;
    reserved_tables: number;
    cleaning_tables: number;
    out_of_service_tables: number;
}

export interface TableCreatePayload {
    name: string;
    table_number: number;
    zone: string;
    capacity?: number;
    min_capacity?: number;
    size?: TableSize;
    shape?: TableShape;
    status?: TableStatus;
    position_x?: number;
    position_y?: number;
    reservation_info?: string;
    reservation_scheduled_at?: string | null;
    reservation_party_size?: number | null;
    notes?: string;
    is_active?: boolean;
}

/** Rezervasyon oluşturma (API reserve) */
export interface TableReservePayload {
    reservation_info: string;
    reservation_scheduled_at?: string | null;
    reservation_party_size?: number | null;
}

export interface TableBulkCreatePayload {
    zone_id: string;
    count: number;
    prefix?: string;
    capacity?: number;
    is_takeaway?: boolean;
}

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
    FREE: 'Boş',
    OCCUPIED: 'Dolu',
    RESERVED: 'Rezerve',
    CLEANING: 'Temizleniyor',
    OUT_OF_SERVICE: 'Hizmet Dışı',
};

export const TABLE_SIZE_LABELS: Record<TableSize, string> = {
    SMALL: 'Küçük',
    MEDIUM: 'Orta',
    LARGE: 'Büyük',
    EXTRA_LARGE: 'Çok Büyük',
};

export const TABLE_SHAPE_LABELS: Record<TableShape, string> = {
    ROUND: 'Yuvarlak',
    SQUARE: 'Kare',
    RECTANGLE: 'Dikdörtgen',
};
