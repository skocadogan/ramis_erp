import type { Table, ZoneSummary } from '../types/table.types';

/**
 * API zone özeti ile anlık masa listesini birleştirir; böylece durum değişince
 * özet kartları / bölge sekmeleri masalarla aynı veriyi gösterir.
 */
export function mergeZoneSummaryWithTables(tables: Table[], base: ZoneSummary[]): ZoneSummary[] {
    const agg = new Map<
        string,
        { total: number; free: number; occupied: number; reserved: number; cleaning: number; out_of_service: number }
    >();

    for (const t of tables) {
        if (!t.is_active) continue;
        const id = t.zone;
        if (!agg.has(id)) {
            agg.set(id, { total: 0, free: 0, occupied: 0, reserved: 0, cleaning: 0, out_of_service: 0 });
        }
        const c = agg.get(id)!;
        c.total += 1;
        switch (t.status) {
            case 'FREE':
                c.free += 1;
                break;
            case 'OCCUPIED':
                c.occupied += 1;
                break;
            case 'RESERVED':
                c.reserved += 1;
                break;
            case 'CLEANING':
                c.cleaning += 1;
                break;
            case 'OUT_OF_SERVICE':
                c.out_of_service += 1;
                break;
        }
    }

    if (base.length > 0) {
        return base.map(z => {
            const s = agg.get(z.id);
            return {
                ...z,
                total_tables: s?.total ?? 0,
                free_tables: s?.free ?? 0,
                occupied_tables: s?.occupied ?? 0,
                reserved_tables: s?.reserved ?? 0,
                cleaning_tables: s?.cleaning ?? 0,
                out_of_service_tables: s?.out_of_service ?? 0,
            };
        });
    }

    const zoneIds = [...new Set(tables.filter(t => t.is_active).map(t => t.zone))];
    return zoneIds.map(id => {
        const sample = tables.find(t => t.zone === id && t.is_active);
        const s = agg.get(id);
        return {
            id,
            name: sample?.zone_name ?? id,
            total_tables: s?.total ?? 0,
            free_tables: s?.free ?? 0,
            occupied_tables: s?.occupied ?? 0,
            reserved_tables: s?.reserved ?? 0,
            cleaning_tables: s?.cleaning ?? 0,
            out_of_service_tables: s?.out_of_service ?? 0,
        };
    });
}
