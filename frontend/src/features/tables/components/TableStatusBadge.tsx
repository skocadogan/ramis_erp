import { memo } from "react";
import { useTranslations } from 'next-intl';
import type { Table, TableStatus } from '../types/table.types';

export type TableCardStyleConfig = {
    dotClass: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    cardBg: string;
    cardBorder: string;
};

const TABLE_STATUS_CONFIG: Record<TableStatus, TableCardStyleConfig> = {
    FREE: {
        dotClass: 'bg-emerald-500',
        bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
        textClass: 'text-emerald-700 dark:text-emerald-400',
        borderClass: 'border-emerald-200 dark:border-emerald-700/50',
        cardBg: 'bg-gradient-to-b from-white to-emerald-50/60 dark:from-slate-900 dark:to-emerald-950/20',
        cardBorder: 'border-emerald-200 dark:border-emerald-800/60',
    },
    OCCUPIED: {
        dotClass: 'bg-rose-500',
        bgClass: 'bg-rose-50 dark:bg-rose-900/20',
        textClass: 'text-rose-700 dark:text-rose-400',
        borderClass: 'border-rose-200 dark:border-rose-700/50',
        cardBg: 'bg-gradient-to-b from-white to-rose-50/60 dark:from-slate-900 dark:to-rose-950/20',
        cardBorder: 'border-rose-200 dark:border-rose-800/60',
    },
    RESERVED: {
        dotClass: 'bg-amber-500',
        bgClass: 'bg-amber-50 dark:bg-amber-900/20',
        textClass: 'text-amber-700 dark:text-amber-400',
        borderClass: 'border-amber-200 dark:border-amber-700/50',
        cardBg: 'bg-gradient-to-b from-white to-amber-50/60 dark:from-slate-900 dark:to-amber-950/20',
        cardBorder: 'border-amber-200 dark:border-amber-800/60',
    },
    OUT_OF_SERVICE: {
        dotClass: 'bg-slate-400',
        bgClass: 'bg-muted',
        textClass: 'text-muted-foreground',
        borderClass: 'border-border',
        cardBg: 'bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-800/40',
        cardBorder: 'border-border',
    },
    CLEANING: {
        dotClass: 'bg-sky-500',
        bgClass: 'bg-sky-50 dark:bg-sky-900/20',
        textClass: 'text-sky-700 dark:text-sky-400',
        borderClass: 'border-sky-200 dark:border-sky-700/50',
        cardBg: 'bg-gradient-to-b from-white to-sky-50/60 dark:from-slate-900 dark:to-sky-950/20',
        cardBorder: 'border-sky-200 dark:border-sky-800/60',
    },
};

/** POS / masa kartı: mutfak veya teslim bekleyen ürün varken turuncu “Bekleyen”. */
const OCCUPIED_KITCHEN_STYLE: TableCardStyleConfig = {
    dotClass: 'bg-orange-500',
    bgClass: 'bg-orange-50 dark:bg-orange-900/20',
    textClass: 'text-orange-700 dark:text-orange-400',
    borderClass: 'border-orange-200 dark:border-orange-700/50',
    cardBg: 'bg-gradient-to-b from-white to-orange-50/60 dark:from-slate-900 dark:to-orange-950/20',
    cardBorder: 'border-orange-200 dark:border-orange-800/60',
};

export function getTableCardStyleConfig(table: Pick<Table, 'status' | 'pos_occupied_flow'>): TableCardStyleConfig {
    if (table.status === 'OCCUPIED' && table.pos_occupied_flow === 'KITCHEN') {
        return OCCUPIED_KITCHEN_STYLE;
    }
    return TABLE_STATUS_CONFIG[table.status];
}

interface TableStatusBadgeProps {
    status: TableStatus;
    posOccupiedFlow?: Table['pos_occupied_flow'];
    size?: 'xs' | 'sm' | 'md';
    showDot?: boolean;
}

export const TableStatusBadge = memo(function TableStatusBadge({ status, posOccupiedFlow, size = 'sm', showDot = true }: TableStatusBadgeProps) {
    const t = useTranslations('tables.status');
    const isWaiting = status === 'OCCUPIED' && posOccupiedFlow === 'KITCHEN';
    const cfg = isWaiting ? OCCUPIED_KITCHEN_STYLE : TABLE_STATUS_CONFIG[status];
    const label = isWaiting ? t('waiting') : t(status.toLowerCase());

    const sizeClasses = {
        xs: 'px-1.5 py-0 text-2xs',
        sm: 'px-2 py-0.5 text-sub',
        md: 'px-2.5 py-1 text-xs',
    }[size];
    const dotSize = size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5';

    return (
        <span className={`inline-flex items-center gap-1.5 font-ui-medium border rounded-full ${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass} ${sizeClasses}`}>
            {showDot && <span className={`rounded-full shrink-0 ${cfg.dotClass} ${dotSize}`} />}
            {label}
        </span>
    );
});
