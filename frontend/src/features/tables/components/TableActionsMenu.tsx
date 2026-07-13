'use client';

import {
    MoreHorizontal,
    Pencil,
    Trash2,
    DoorOpen,
    DoorClosed,
    CalendarClock,
    Wrench,
    ReceiptText,
    ArrowRightLeft,
    QrCode,
    Sparkles,
    ShieldAlert,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Table } from '../types/table.types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface TableActionsMenuProps {
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
    /** Liste satırında hücre taşması için */
    align?: 'left' | 'right';
}

export function TableActionsMenu({
    table,
    canManage,
    onEdit,
    onDelete,
    onStatusChange,
    onReserveRequest,
    onViewOrder,
    onTransferRequest,
    onQrCodeRequest,
    onForceClose,
    align = 'right',
}: TableActionsMenuProps) {
    const t = useTranslations('tables.actions');

    if (!canManage) return null;

    const menuAlign = align === 'right' ? 'end' : 'start';

    const showOpen = table.status === 'FREE' || table.status === 'RESERVED';
    const showClose = table.status === 'OCCUPIED';
    const showForceClose = table.status === 'OCCUPIED' && onForceClose;
    const showReserve = table.status === 'FREE';
    const cleaningEnabled = !table.zone_is_takeaway;
    const showStartCleaning = cleaningEnabled && table.status === 'FREE';
    const showFinishCleaning = cleaningEnabled && table.status === 'CLEANING';
    const showOutOfService = table.status !== 'OCCUPIED' && table.status !== 'OUT_OF_SERVICE';
    const hasStatusSection = showOpen || showClose || showReserve || showStartCleaning || showFinishCleaning || showOutOfService;

    return (
        <div
            className={`inline-flex shrink-0 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
        >
            <DropdownMenu>
                <DropdownMenuTrigger
                    className="p-1.5 rounded-md text-muted-foreground hover: hover: dark:hover: transition-colors flex items-center justify-center"
                    aria-label={t('viewDetails')}
                >
                    <MoreHorizontal size={18} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align={menuAlign} className="w-48">
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>{t('viewDetails')}</DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        {showOpen && (
                            <DropdownMenuItem
                                onClick={() => onStatusChange(table.id, 'open')}
                                className="text-emerald-600 dark:text-emerald-400"
                            >
                                <DoorOpen className="mr-2 h-4 w-4" />
                                {t('openAccount')}
                            </DropdownMenuItem>
                        )}
                        {showClose && (
                            <DropdownMenuItem
                                onClick={() => onStatusChange(table.id, 'close')}
                                className="text-blue-600 dark:text-blue-400"
                            >
                                <DoorClosed className="mr-2 h-4 w-4" />
                                {t('bringToService')}
                            </DropdownMenuItem>
                        )}
                        {showForceClose && (
                            <DropdownMenuItem
                                onClick={() => onForceClose(table)}
                                className="text-rose-600 dark:text-rose-400"
                            >
                                <ShieldAlert className="mr-2 h-4 w-4" />
                                {t('forceClose')}
                            </DropdownMenuItem>
                        )}
                        {showReserve && (
                            <DropdownMenuItem
                                onClick={() => onReserveRequest(table)}
                                className="text-amber-600 dark:text-amber-400"
                            >
                                <CalendarClock className="mr-2 h-4 w-4" />
                                {t('reserve')}
                            </DropdownMenuItem>
                        )}
                        {showStartCleaning && (
                            <DropdownMenuItem
                                onClick={() => onStatusChange(table.id, 'start_cleaning')}
                                className="text-sky-600 dark:text-sky-400"
                            >
                                <Sparkles className="mr-2 h-4 w-4" />
                                {t('startCleaning')}
                            </DropdownMenuItem>
                        )}
                        {showFinishCleaning && (
                            <DropdownMenuItem
                                onClick={() => onStatusChange(table.id, 'finish_cleaning')}
                                className="text-emerald-600 dark:text-emerald-400"
                            >
                                <DoorOpen className="mr-2 h-4 w-4" />
                                {t('finishCleaning')}
                            </DropdownMenuItem>
                        )}
                        {showOutOfService && (
                            <DropdownMenuItem
                                onClick={() => onStatusChange(table.id, 'out_of_service')}
                                className="text-amber-600 dark:text-amber-400"
                            >
                                <Wrench className="mr-2 h-4 w-4" />
                                {t('outOfService')}
                            </DropdownMenuItem>
                        )}

                        {hasStatusSection && <DropdownMenuSeparator />}

                        <DropdownMenuItem onClick={() => onEdit(table)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('edit')}
                        </DropdownMenuItem>
                        {onQrCodeRequest && (
                            <DropdownMenuItem
                                onClick={() => onQrCodeRequest(table)}
                                className="text-indigo-600 dark:text-indigo-400"
                            >
                                <QrCode className="mr-2 h-4 w-4" />
                                {t('qrCode')}
                            </DropdownMenuItem>
                        )}
                        {onViewOrder && table.status === 'OCCUPIED' && table.active_order && (
                            <DropdownMenuItem
                                onClick={() => onViewOrder(table)}
                                className="text-blue-600 dark:text-blue-400"
                            >
                                <ReceiptText className="mr-2 h-4 w-4" />
                                {t('viewOrder')}
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            onClick={() => onDelete(table)}
                            className="text-rose-600 dark:text-rose-400"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('delete')}
                        </DropdownMenuItem>
                        {onTransferRequest && table.status === 'OCCUPIED' && (
                            <DropdownMenuItem
                                onClick={() => onTransferRequest(table)}
                                className="text-blue-600 dark:text-blue-400"
                            >
                                <ArrowRightLeft className="mr-2 h-4 w-4" />
                                {t('transfer')}
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
