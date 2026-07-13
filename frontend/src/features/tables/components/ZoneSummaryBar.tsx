'use client';

import { ZoneSummary } from '../types/table.types';
import { useTranslations } from 'next-intl';

interface ZoneSummaryBarProps {
    zones: ZoneSummary[];
    isLoading?: boolean;
}

function StatPill({ value, label, colorClass }: { value: number; label: string; colorClass: string }) {
    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${colorClass}`}>
            <span className="font-bold tabular-nums">{value}</span>
            <span className="opacity-80">{label}</span>
        </span>
    );
}

function SkeletonCard() {
    return (
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="h-2.5 w-16 bg-slate-200 bg-accent rounded mb-2" />
            <div className="h-5 w-8 bg-slate-200 bg-accent rounded mb-1.5" />
            <div className="flex gap-1">
                <div className="h-3.5 w-10 bg-muted rounded-full" />
                <div className="h-3.5 w-10 bg-muted rounded-full" />
            </div>
        </div>
    );
}

export function ZoneSummaryBar({ zones, isLoading }: ZoneSummaryBarProps) {
    const t = useTranslations('tables');
    const tStatus = useTranslations('tables.status');
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
        );
    }

    const totals = zones.reduce(
        (acc, z) => ({
            total: acc.total + z.total_tables,
            free: acc.free + z.free_tables,
            occupied: acc.occupied + z.occupied_tables,
            reserved: acc.reserved + z.reserved_tables,
            cleaning: acc.cleaning + (z.cleaning_tables ?? 0),
            out_of_service: acc.out_of_service + z.out_of_service_tables,
        }),
        { total: 0, free: 0, occupied: 0, reserved: 0, cleaning: 0, out_of_service: 0 }
    );

    const allZones = [{ id: '__all__', name: t('summary.allZones'), ...totals }, ...zones.map(z => ({ id: z.id, name: z.name, total: z.total_tables, free: z.free_tables, occupied: z.occupied_tables, reserved: z.reserved_tables, cleaning: z.cleaning_tables ?? 0, out_of_service: z.out_of_service_tables }))];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {allZones.map((z) => {
                const occupancyPct = z.total > 0 ? Math.round((z.occupied / z.total) * 100) : 0;
                const isTotal = z.id === '__all__';
                return (
                    <div key={z.id} className={`rounded-lg border px-3 py-2 transition-colors ${isTotal ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/50' : 'border-border bg-card border-border'}`}>
                        <div className="flex items-baseline justify-between gap-1 mb-1">
                            <p className={`text-sub font-semibold truncate ${isTotal ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`}>{z.name}</p>
                            <p className={`text-base font-bold shrink-0 leading-none ${isTotal ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 text-foreground'}`}>{z.total}</p>
                        </div>
                        <div className="flex flex-wrap gap-0.5">
                            <StatPill value={z.free} label={tStatus('free')} colorClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
                            <StatPill value={z.occupied} label={tStatus('occupied')} colorClass="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" />
                            {z.reserved > 0 && <StatPill value={z.reserved} label={tStatus('reserved_abbr')} colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />}
                            {z.cleaning > 0 && <StatPill value={z.cleaning} label={tStatus('cleaning_abbr')} colorClass="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" />}
                            {z.out_of_service > 0 && <StatPill value={z.out_of_service} label={tStatus('out_of_service_abbr')} colorClass="bg-slate-100 text-muted-foreground bg-muted dark:text-muted-foreground" />}
                        </div>
                        {z.total > 0 && (
                            <div className="mt-1.5">
                                <div className="h-0.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-rose-400 dark:bg-rose-500 transition-all" style={{ width: `${occupancyPct}%` }} />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
