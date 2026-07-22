'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Package, Search, Table2 } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tablesApi } from '../services/tablesApi';
import type { Table, Zone } from '../types/table.types';
import { TAKEAWAY_SALES_FILTER_VALUE } from '../constants';

interface TableSelectProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    allLabel?: string;
    className?: string;
    /** Yalnızca aktif masaları göster */
    activeOnly?: boolean;
    /**
     * Satış/iptal filtreleri: şubede paket bölgesi varsa "Paket satışlar" seçeneği.
     * Rezervasyon vb. gerçek masa seçiminde kapalı bırakın.
     */
    includeTakeawaySalesFilter?: boolean;
}

interface GroupedTables {
    zone: Zone;
    tables: Table[];
}

export function TableSelect({
    value,
    onChange,
    placeholder,
    allLabel,
    className,
    activeOnly = true,
    includeTakeawaySalesFilter = false,
}: TableSelectProps) {
    const t = useTranslations('tables');
    const [search, setSearch] = useState('');

    const { data: tables = [] } = useQuery({
        queryKey: ['table-select', 'tables'],
        queryFn: () => tablesApi.getAll({ status: undefined }),
        staleTime: 120_000,
    });

    const { data: zones = [] } = useQuery({
        queryKey: ['table-select', 'zones'],
        queryFn: () => tablesApi.getZones(),
        staleTime: 120_000,
    });

    const hasTakeawayZone = useMemo(
        () =>
            includeTakeawaySalesFilter &&
            zones.some((z) => z.is_active && z.is_takeaway),
        [includeTakeawaySalesFilter, zones],
    );

    const grouped = useMemo(() => {
        const zoneMap = new Map<string, Zone>();
        for (const z of zones) {
            if (z.is_active) zoneMap.set(z.id, z);
        }

        const groupMap = new Map<string, Table[]>();
        const filtered = activeOnly
            ? tables.filter((tbl) => tbl.is_active)
            : tables;

        for (const table of filtered) {
            // Paket bölgelerindeki fizik masalar satış filtresinde gösterilmez
            // (paket siparişler table_id=null; ayrı "Paket satışlar" seçeneği var).
            const zone = zoneMap.get(table.zone);
            if (includeTakeawaySalesFilter && zone?.is_takeaway) {
                continue;
            }
            const zoneId = table.zone;
            if (!groupMap.has(zoneId)) groupMap.set(zoneId, []);
            groupMap.get(zoneId)!.push(table);
        }

        const result: GroupedTables[] = [];
        for (const [zoneId, zoneTables] of groupMap) {
            const zone = zoneMap.get(zoneId);
            result.push({
                zone:
                    zone ??
                    ({
                        id: zoneId,
                        name: zoneTables[0]?.zone_name || zoneId,
                    } as Zone),
                tables: zoneTables,
            });
        }

        result.sort((a, b) => a.zone.name.localeCompare(b.zone.name));
        return result;
    }, [tables, zones, activeOnly, includeTakeawaySalesFilter]);

    const takeawayLabel = t('tableSelect.takeawaySales');
    const showTakeawayOption = useMemo(() => {
        if (!hasTakeawayZone) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            takeawayLabel.toLowerCase().includes(q) ||
            q.includes('paket') ||
            q.includes('takeaway')
        );
    }, [hasTakeawayZone, search, takeawayLabel]);

    const filteredGroups = useMemo(() => {
        if (!search.trim()) return grouped;

        const q = search.toLowerCase();
        return grouped
            .map((g) => ({
                ...g,
                tables: g.tables.filter(
                    (tb) =>
                        tb.name.toLowerCase().includes(q) ||
                        tb.zone_name?.toLowerCase().includes(q),
                ),
            }))
            .filter((g) => g.tables.length > 0);
    }, [grouped, search]);

    const displayName = useMemo(() => {
        if (!value) return null;
        if (value === TAKEAWAY_SALES_FILTER_VALUE) return takeawayLabel;
        const tb = tables.find((tbl) => tbl.id === value);
        return tb?.name ?? null;
    }, [value, tables, takeawayLabel]);

    return (
        <Select
            value={value || 'all'}
            onValueChange={(val) => onChange(!val || val === 'all' ? '' : val)}
        >
            <SelectTrigger className={className}>
                <div className="flex items-center gap-1.5 truncate">
                    {value === TAKEAWAY_SALES_FILTER_VALUE ? (
                        <Package size={14} className="text-amber-600 shrink-0" />
                    ) : (
                        <Table2 size={14} className="text-muted-foreground shrink-0" />
                    )}
                    <SelectValue placeholder={placeholder ?? t('tableSelect.placeholder')}>
                        {displayName || allLabel || t('tableSelect.allTables')}
                    </SelectValue>
                </div>
            </SelectTrigger>
            <SelectContent className="max-h-80">
                <div className="sticky top-0 z-10 border-b border-border bg-popover px-3 py-2.5 border-border">
                    <div className="relative">
                        <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                        <input
                            type="text"
                            placeholder={t('tableSelect.searchPlaceholder')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-muted border-border text-foreground"
                            onKeyDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>

                <SelectItem
                    value="all"
                    className="text-sm font-semibold text-muted-foreground italic"
                >
                    {allLabel || t('tableSelect.allTables')}
                </SelectItem>

                {showTakeawayOption && (
                    <SelectGroup>
                        <SelectLabel className="text-2xs font-semibold text-muted-foreground tracking-wider px-1.5 py-1">
                            {t('tableSelect.takeawayGroup')}
                        </SelectLabel>
                        <SelectItem
                            value={TAKEAWAY_SALES_FILTER_VALUE}
                            className="text-sm pl-4"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <Package size={14} className="text-amber-600 shrink-0" />
                                {takeawayLabel}
                            </span>
                        </SelectItem>
                    </SelectGroup>
                )}

                {filteredGroups.map((group) => (
                    <SelectGroup key={group.zone.id}>
                        <SelectLabel className="text-2xs font-semibold text-muted-foreground tracking-widerpx-1.5 py-1">
                            {group.zone.name}
                        </SelectLabel>
                        {group.tables.map((tb) => (
                            <SelectItem key={tb.id} value={tb.id} className="text-sm pl-4">
                                {tb.name}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                ))}

                {filteredGroups.length === 0 && !showTakeawayOption && search.trim() && (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        {t('tableSelect.noResults')}
                    </div>
                )}
            </SelectContent>
        </Select>
    );
}
