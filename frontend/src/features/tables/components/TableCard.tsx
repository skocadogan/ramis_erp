'use client';

import { Users, Receipt, User } from 'lucide-react';
import { Table, TableShape, TableSize } from '../types/table.types';
import { TableStatusBadge, getTableCardStyleConfig, type TableCardStyleConfig } from './TableStatusBadge';
import { TableActionsMenu } from './TableActionsMenu';
import { tableActiveOrdersGrossTotal } from '../utils/tableOrderTotals';
import { formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';
import { useTranslations } from 'next-intl';
import {
    formatCleaningCountdown,
    useAutoFinishCleaningOnExpire,
    useCleaningCountdown,
} from '@/hooks/useCleaningCountdown';
import { useTableCleaningActions } from '../hooks/useTableCleaningActions';

const SIZE_SHORT: Record<TableSize, string> = {
    SMALL: 'S',
    MEDIUM: 'M',
    LARGE: 'L',
    EXTRA_LARGE: 'XL',
};

function TableShapeIcon({ shape, size, cfg }: { shape: TableShape; size: TableSize; cfg: TableCardStyleConfig }) {
    const base = `flex items-center justify-center border-2 ${cfg.borderClass} ${cfg.bgClass} transition-colors`;
    const shapeClass = {
        ROUND: `${base} rounded-full w-11 h-11`,
        SQUARE: `${base} rounded-lg w-11 h-11`,
        RECTANGLE: `${base} rounded-lg w-16 h-9`,
    }[shape];

    return (
        <div className={shapeClass}>
            <span className={`text-sub font-bold ${cfg.textClass}`}>{SIZE_SHORT[size]}</span>
        </div>
    );
}

interface TableCardProps {
    table: Table;
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

export function TableCard({ table, canManage, onEdit, onDelete, onStatusChange, onReserveRequest, onViewOrder, onTransferRequest, onQrCodeRequest, onForceClose }: TableCardProps) {
    const tStatus = useTranslations('tables.status');
    const tGrid = useTranslations('tables.grid');
    const canViewAmounts = useCanViewAmounts();
    const cfg = getTableCardStyleConfig(table);
    const isOccupiedKitchen = table.status === 'OCCUPIED' && table.pos_occupied_flow === 'KITCHEN';
    const cleaningEnabled = !table.zone_is_takeaway;
    const cleaningSeconds = useCleaningCountdown(table.cleaning_until, table.cleaning_remaining_seconds);
    const { finishCleaning } = useTableCleaningActions();

    useAutoFinishCleaningOnExpire(
        cleaningEnabled && table.status === 'CLEANING',
        table.id,
        table.cleaning_until,
        cleaningSeconds,
        (tableId) => void finishCleaning(tableId, { silent: true }),
    );

    return (
        <div
            className={`relative rounded-xl border-2 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${cfg.cardBg} ${cfg.cardBorder} ${!table.is_active ? 'opacity-50' : ''}`}
        >
            <div className="overflow-hidden rounded-t-xl">
                <div className={`h-1 w-full ${cfg.dotClass}`} />
            </div>

            <div className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <TableShapeIcon shape={table.shape} size={table.size} cfg={cfg} />
                        <div className="min-w-0">
                            <p className="text-base font-bold leading-tight text-foreground truncate">{table.name}</p>
                            <p className="truncate text-sub text-muted-foreground">{table.zone_name}</p>
                            {table.status === 'RESERVED' && table.reservation_info?.trim() && (
                                <p className="mt-1 line-clamp-2 text-sub font-medium text-amber-800 dark:text-amber-200/90">
                                    {table.reservation_info.trim()}
                                </p>
                            )}
                        </div>
                    </div>

                    <TableActionsMenu
                        table={table}
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
                </div>

                {table.assigned_waiters && table.assigned_waiters.length > 0 && (
                    <div className="flex items-center gap-1 text-2xs font-medium text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5 w-fit max-w-full">
                        <User size={10} className="shrink-0" />
                        <span className="truncate" title={table.assigned_waiters.join(", ")}>
                            {table.assigned_waiters.join(", ")}
                        </span>
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-muted-foreground">
                        <Users size={12} />
                        <span className="text-xs font-medium">
                            {table.min_capacity}–{table.capacity} {tStatus('capacityShort')}
                        </span>
                    </div>
                    <TableStatusBadge status={table.status} posOccupiedFlow={table.pos_occupied_flow} size="xs" />
                </div>

                {cleaningEnabled && table.status === 'CLEANING' && cleaningSeconds != null && (
                    <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                        {tStatus('cleaningRemaining', { time: formatCleaningCountdown(cleaningSeconds) })}
                    </p>
                )}

                {table.status === 'OCCUPIED' && table.active_order && (
                    <button
                        type="button"
                        onClick={() => onViewOrder?.(table)}
                        className={`flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left transition-colors ${isOccupiedKitchen ? 'border-orange-100 bg-orange-50/80 hover:bg-orange-100 dark:border-orange-800/40 dark:bg-orange-900/20 dark:hover:bg-orange-900/40' : 'border-rose-100 bg-rose-50/80 hover:bg-rose-100 dark:border-rose-800/40 dark:bg-rose-900/20 dark:hover:bg-rose-900/40'}`}
                    >
                        <Receipt size={12} className={`shrink-0 ${isOccupiedKitchen ? 'text-orange-500' : 'text-rose-500'}`} />
                        <span className={`truncate text-sub font-semibold ${isOccupiedKitchen ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {formatAmount(tableActiveOrdersGrossTotal(table), canViewAmounts)}
                        </span>
                        {((table.active_orders ? table.active_orders.length : table.order_count) || 1) > 1 && (
                            <span className={`ml-auto shrink-0 text-2xs ${isOccupiedKitchen ? 'text-orange-400' : 'text-rose-400'}`}>
                                +{(table.active_orders ? table.active_orders.length : table.order_count) - 1} {tGrid('more')}
                            </span>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}
