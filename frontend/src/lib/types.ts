export interface PaginatedResponse<T> {
    results: T[];
    count: number;
    next: string | null;
    previous: string | null;
    totals?: {
        gross_total?: number;
        discount_total?: number;
        net_total?: number;
    };
}
