'use client';

import { useState, useMemo } from 'react';
import { Search, LayoutGrid, List } from 'lucide-react';
import { Table, TableStatus, ZoneSummary } from '../types/table.types';
import { getTableCardStyleConfig } from './TableStatusBadge';
import { TableCard } from './TableCard';
import { TableActionsMenu } from './TableActionsMenu';
import { tableActiveOrdersGrossTotal } from '../utils/tableOrderTotals';
import { formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';
import { useTranslations } from 'next-intl';

type StatusFilter = TableStatus | 'ALL' | 'BEKLEYEN';
type ViewMode = 'grid' | 'list';

function isTableBekleyenKitchen(t: Table): boolean {
    return t.status === 'OCCUPIED' && t.pos_occupied_flow === 'KITCHEN';
}

interface TableGridProps {
    tables: Table[];
    zones: ZoneSummary[];
    isLoading: boolean;
    canManage: boolean;
    onEdit: (table: Table) => void;
    onDelete: (table: Table) => void;
    onStatusChange: (id: string, action: 'open' | 'close' | 'out_of_service' | 'start_cleaning' | 'finish_cleaning') => void;
    onReserveRequest: (table: Table) => void;
    onViewOrder?: (table: Table) => void;
    onTransferRequest?: (table: Table) => void;
    onQrCodeRequest?: (table: Table) => void;
    onForceClose?: (table: Table) => void;
}

const STATUS_FILTER_VALUES: StatusFilter[] = ['ALL', 'FREE', 'OCCUPIED', 'BEKLEYEN', 'CLEANING', 'RESERVED', 'OUT_OF_SERVICE'];

function TableSkeleton() {
    return (
        <div className="rounded-xl border-2 border-border overflow-hidden bg-muted/20">
            <div className="h-1 bg-slate-200 dark:bg-slate-700" />
            <div className="p-4 space-y-3">
                <div className="flex gap-2.5">
                    <div className="w-11 h-11 rounded-lg bg-slate-200 dark:bg-slate-700" />
                    <div className="space-y-1.5 flex-1">
                        <div className="h-3.5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                        <div className="h-2.5 w-12 bg-muted rounded" />
                    </div>
                </div>
                <div className="flex justify-between">
                    <div className="h-3 w-14 bg-muted rounded" />
                    <div className="h-4 w-10 bg-muted rounded-full" />
                </div>
            </div>
        </div>
    );
}

function EmptyState({ filtered }: { filtered: boolean }) {
    const t = useTranslations('tables.grid');
    return (
        <div className="col-span-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 px-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <LayoutGrid size={22} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-ui-medium text-slate-600 dark:text-slate-300">
                {filtered ? t('noTablesFiltered') : t('noTables')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
                {filtered ? t('clearFilters') : t('addTableHint')}
            </p>
        </div>
    );
}

export function TableGrid({ tables, zones, isLoading, canManage, onEdit, onDelete, onStatusChange, onReserveRequest, onViewOrder, onTransferRequest, onQrCodeRequest, onForceClose }: TableGridProps) {
    const tGrid = useTranslations('tables.grid');
    const tStatus = useTranslations('tables.status');
    const canViewAmounts = useCanViewAmounts();
    const [activeZone, setActiveZone] = useState<string>('ALL');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');

    const STATUS_FILTERS = useMemo(() => STATUS_FILTER_VALUES.map(v => ({
        value: v,
        label: v === 'ALL' ? tGrid('all') : (v === 'BEKLEYEN' ? tStatus('waiting') : tStatus(v.toLowerCase()))
    })), [tGrid, tStatus]);

    const filteredTables = useMemo(() => {
        return tables.filter(t => {
            if (activeZone !== 'ALL' && t.zone !== activeZone) return false;
            if (statusFilter !== 'ALL') {
                if (statusFilter === 'BEKLEYEN') {
                    if (!isTableBekleyenKitchen(t)) return false;
                } else if (t.status !== statusFilter) {
                    return false;
                }
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                return (
                    t.name.toLowerCase().includes(q) ||
                    t.zone_name.toLowerCase().includes(q) ||
                    t.branch_name.toLowerCase().includes(q) ||
                    (t.reservation_info ?? '').toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [tables, activeZone, statusFilter, search]);

    const statusCounts = useMemo(() => {
        const src = activeZone === 'ALL' ? tables : tables.filter(t => t.zone === activeZone);
        return STATUS_FILTERS.reduce((acc, f) => {
            if (f.value === 'ALL') {
                acc[f.value] = src.length;
            } else if (f.value === 'BEKLEYEN') {
                acc[f.value] = src.filter(isTableBekleyenKitchen).length;
            } else {
                acc[f.value] = src.filter(t => t.status === f.value).length;
            }
            return acc;
        }, {} as Record<string, number>);
    }, [tables, activeZone, STATUS_FILTERS]);

    return (
        <div className="space-y-4">
            {/* Zone tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                <button
                    onClick={() => setActiveZone('ALL')}
                    className={`shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-ui-medium transition-colors ${activeZone === 'ALL' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-border text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'}`}
                >
                    {tGrid('all')} <span className="ml-1 opacity-70">{tables.length}</span>
                </button>
                {zones.map(z => (
                    <button
                        key={z.id}
                        onClick={() => setActiveZone(z.id)}
                        className={`shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-ui-medium transition-colors ${activeZone === z.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-border text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'}`}
                    >
                        {z.name} <span className="ml-1 opacity-70">{z.total_tables}</span>
                    </button>
                ))}
            </div>

            {/* Filter & search bar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-44">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={tGrid('searchPlaceholder')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                    />
                </div>

                <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-1 dark:bg-slate-900 dark:border-slate-700">
                    {STATUS_FILTERS.map(f => (
                        <button
                            key={f.value}
                            onClick={() => setStatusFilter(f.value)}
                            className={`px-2.5 py-1 rounded-md text-xs font-ui-medium transition-colors ${statusFilter === f.value ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-muted-foreground hover:text-slate-700 dark:text-muted-foreground dark:hover:text-slate-200'}`}
                        >
                            {f.label}
                            {statusCounts[f.value] !== undefined && (
                                <span className="ml-1 tabular-nums opacity-70">{statusCounts[f.value]}</span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-0.5 bg-white border border-border rounded-lg p-1 dark:bg-slate-900 dark:border-slate-700">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' : 'text-muted-foreground hover:text-slate-600'}`}
                        aria-label={tGrid('gridView')}
                    >
                        <LayoutGrid size={14} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' : 'text-muted-foreground hover:text-slate-600'}`}
                        aria-label={tGrid('listView')}
                    >
                        <List size={14} />
                    </button>
                </div>
            </div>

            {/* Results */}
            {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {[...Array(12)].map((_, i) => <TableSkeleton key={i} />)}
                </div>
            ) : filteredTables.length === 0 ? (
                <div className="grid">
                    <EmptyState filtered={search.trim().length > 0 || statusFilter !== 'ALL'} />
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {filteredTables.map(t => (
                        <TableCard
                            key={t.id}
                            table={t}
                            canManage={canManage}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onStatusChange={onStatusChange}
                            onReserveRequest={onReserveRequest}
                            onViewOrder={onViewOrder}
                            onTransferRequest={onTransferRequest}
                            onQrCodeRequest={onQrCodeRequest}
                            onForceClose={onForceClose}
                        />
                    ))}
                </div>
            ) : (
                // List view — overflow-visible: satır menüsü kesilmesin
                <div className="rounded-xl border border-border bg-card dark:border-slate-700">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-border dark:bg-slate-800 dark:border-slate-700">
                            <tr>
                                {[tGrid('header.table'), tGrid('header.zone'), tGrid('header.capacity'), tGrid('header.size'), tGrid('header.shape'), tGrid('header.status'), tGrid('header.reservation'), tGrid('header.activeOrder')].map(h => (
                                    <th key={h} className="text-left px-4 py-2.5 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{h}</th>
                                ))}
                                {canManage && (
                                    <th className="text-right px-4 py-2.5 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground w-[1%] whitespace-nowrap">
                                        {tGrid('header.actions')}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTables.map(t => (
                                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-700/60 dark:hover:bg-slate-800/40">
                                    <td className="px-4 py-3 font-ui-semibold text-foreground">{t.name}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{t.zone_name}</td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{t.min_capacity}–{t.capacity}</td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs">{t.size}</td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs">{t.shape}</td>
                                    <td className="px-4 py-3">
                                        {(() => {
                                            const sc = getTableCardStyleConfig(t);
                                            const isWaiting = t.status === 'OCCUPIED' && t.pos_occupied_flow === 'KITCHEN';
                                            const label = isWaiting ? tStatus('waiting') : tStatus(t.status.toLowerCase());
                                            return (
                                                <span className={`inline-flex items-center gap-1 text-sub font-ui-medium px-2 py-0.5 rounded-full border ${sc.bgClass} ${sc.textClass} ${sc.borderClass}`}>
                                                    {label}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="max-w-[200px] px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                                        {t.status === 'RESERVED' && t.reservation_info?.trim() ? (
                                            <span className="line-clamp-2">{t.reservation_info.trim()}</span>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {t.active_order ? (
                                            <button
                                                type="button"
                                                onClick={() => onViewOrder?.(t)}
                                                className={`text-xs font-ui-semibold hover:underline ${t.status === 'OCCUPIED' && t.pos_occupied_flow === 'KITCHEN' ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400'}`}
                                            >
                                                {formatAmount(tableActiveOrdersGrossTotal(t), canViewAmounts)}
                                            </button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    {canManage && (
                                        <td className="relative px-4 py-2 text-right align-middle">
                                            <TableActionsMenu
                                                table={t}
                                                canManage={canManage}
                                                onEdit={onEdit}
                                                onDelete={onDelete}
                                                onStatusChange={onStatusChange}
                                                onReserveRequest={onReserveRequest}
                                                onViewOrder={onViewOrder}
                                                onTransferRequest={onTransferRequest}
                                                onQrCodeRequest={onQrCodeRequest}
                                                onForceClose={onForceClose}
                                                align="right"
                                            />
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
