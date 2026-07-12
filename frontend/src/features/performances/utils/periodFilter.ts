/** Dönem seçenekleri ve tarih aralığı yardımcı fonksiyonları — performans ve satış modülleri ortak */

export type PeriodPresetId =
    | 'today'
    | 'this_week'
    | 'last_week'
    | 'this_month'
    | 'last_month'
    | 'last_3_months'
    | 'last_6_months'
    | 'last_9_months'
    | 'this_year'
    | 'custom';

export interface PeriodDateRange {
    start: string;
    end: string;
}

function toYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Yerel saate göre [start, end] (her ikisi de dahil) */
export function getRangeForPeriodPreset(preset: PeriodPresetId): PeriodDateRange {
    const now = new Date();
    const today = toYMD(now);

    switch (preset) {
        case 'today':
            return { start: today, end: today };
        case 'this_week': {
            const day = now.getDay();
            const mondayOffset = day === 0 ? -6 : 1 - day;
            const monday = new Date(now);
            monday.setDate(now.getDate() + mondayOffset);
            return { start: toYMD(monday), end: today };
        }
        case 'last_week': {
            const day = now.getDay();
            const mondayOffset = day === 0 ? -6 : 1 - day;
            const thisMonday = new Date(now);
            thisMonday.setDate(now.getDate() + mondayOffset);
            const lastMonday = new Date(thisMonday);
            lastMonday.setDate(thisMonday.getDate() - 7);
            const lastSunday = new Date(thisMonday);
            lastSunday.setDate(thisMonday.getDate() - 1);
            return { start: toYMD(lastMonday), end: toYMD(lastSunday) };
        }
        case 'this_month': {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            return { start: toYMD(start), end: today };
        }
        case 'last_month': {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            return { start: toYMD(start), end: toYMD(end) };
        }
        case 'last_3_months': {
            const start = new Date(now.getFullYear(), now.getMonth() - (3 - 1), 1);
            return { start: toYMD(start), end: today };
        }
        case 'last_6_months': {
            const start = new Date(now.getFullYear(), now.getMonth() - (6 - 1), 1);
            return { start: toYMD(start), end: today };
        }
        case 'last_9_months': {
            const start = new Date(now.getFullYear(), now.getMonth() - (9 - 1), 1);
            return { start: toYMD(start), end: today };
        }
        case 'this_year': {
            const start = new Date(now.getFullYear(), 0, 1);
            return { start: toYMD(start), end: today };
        }
        case 'custom':
            return { start: today, end: today };
    }
}
