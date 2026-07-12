import type { Table } from '../types/table.types';

/** API’deki aktif sipariş(ler) tutarının masa kartı / listede gösterilecek toplamı */
export function tableActiveOrdersGrossTotal(table: Table): number {
    if (table.active_orders && table.active_orders.length > 0) {
        return table.active_orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
    }
    if (table.active_order) {
        return Number(table.active_order.total_amount);
    }
    return 0;
}
