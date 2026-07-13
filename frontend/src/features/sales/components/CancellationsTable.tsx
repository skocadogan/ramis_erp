'use client';

import React, { memo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2, ShoppingBag } from 'lucide-react';
import type { CancellationRecord } from '../types';
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatDate } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';

interface CancellationsTableProps {
    rows: CancellationRecord[];
    onRowClick?: (row: CancellationRecord) => void;
    infiniteControls?: {
        fetchNextPage: () => void;
        hasNextPage: boolean;
        isFetchingNextPage: boolean;
    };
}

const ROW_HOVER = 'hover:bg-rose-50/60 dark:hover:bg-rose-900/10';

const CancellationRow = memo(({
    row,
    idx,
    onRowClick,
    measureElement,
    reasonLabel,
}: {
    row: CancellationRecord;
    idx: number;
    onRowClick?: (row: CancellationRecord) => void;
    measureElement: (el: HTMLElement | null) => void;
    reasonLabel: string;
}) => {
    const t = useTranslations('sales');
    const canViewAmounts = useCanViewAmounts();
    const totalStr = formatCurrency(Number(row.total_price));
    const unitStr = formatCurrency(Number(row.unit_price));

    return (
        <tr
            data-index={idx}
            ref={measureElement}
            onClick={() => onRowClick?.(row)}
            className={`border-b border-slate-100 border-border/60 last:border-0 cursor-pointer transition-colors ${ROW_HOVER}`}
        >
            <td className="px-4 py-3 text-xs text-muted-foreground font-mono tabular-nums">{idx + 1}</td>
            <td className="px-4 py-3 text-xs text-muted-foreground">
                {formatDate(row.cancelled_at)}
            </td>
            <td className="px-4 py-3 text-foreground">
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{row.branch_name}</span>
                </div>
            </td>
            <td className="px-4 py-3 font-semibold text-foreground">
                <div className="flex flex-col">
                    {row.table_name ?? (
                        <span className="text-muted-foreground">{t('table.dash')}</span>
                    )}
                    {row.order_type === 'TAKEAWAY' && (
                        <span className="text-2xs text-amber-600 font-bold uppercase">{t('table.takeaway')}</span>
                    )}
                </div>
            </td>
            <td className="px-4 py-3 text-muted-foreground">
                {row.cancelled_by_name ?? (
                    <span className="text-muted-foreground">{t('table.dash')}</span>
                )}
            </td>
            <td className="px-4 py-3 text-sm text-foreground max-w-[220px]">
                <span className="line-clamp-2" title={reasonLabel}>{reasonLabel}</span>
            </td>
            <td className="px-4 py-3 text-foreground">
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{row.product_name}</span>
                    <span className="text-xs text-muted-foreground">
                        {t('cancellations.quantityLine', { qty: row.quantity })}
                    </span>
                </div>
            </td>
            <td className="px-4 py-3 text-foreground">
                {!canViewAmounts ? (
                    <span className="text-sm font-bold tabular-nums">{AMOUNT_DISPLAY_MASK}</span>
                ) : (
                    <div className="flex flex-col gap-0.5 min-w-[7rem]">
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {t('cancellations.unitPrice', { amount: unitStr })}
                        </span>
                        <span className="text-sm font-bold tabular-nums">{totalStr}</span>
                    </div>
                )}
            </td>
        </tr>
    );
});
CancellationRow.displayName = 'CancellationRow';

export const CancellationsTable = memo(({
    rows,
    onRowClick,
    infiniteControls,
}: CancellationsTableProps) => {
    const t = useTranslations('sales');
    const tAdmin = useTranslations('admin.cancellationReason');

    const containerRef = React.useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => 64,
        overscan: 10,
        measureElement: (el) => el.getBoundingClientRect().height,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();

    useEffect(() => {
        const lastItem = virtualItems[virtualItems.length - 1];
        if (!lastItem || !infiniteControls) return;

        if (
            lastItem.index >= rows.length - 1 &&
            infiniteControls.hasNextPage &&
            !infiniteControls.isFetchingNextPage
        ) {
            infiniteControls.fetchNextPage();
        }
    }, [virtualItems, rows.length, infiniteControls]);

    const reasonForRow = (row: CancellationRecord) => {
        if (row.cancel_reason_text?.trim()) return row.cancel_reason_text.trim();
        if (row.cancel_reason_code) {
            return tAdmin(`reasons.${row.cancel_reason_code}` as 'reasons.MISTAKE');
        }
        return t('cancellations.noReason');
    };

    if (rows.length === 0 && !infiniteControls?.isFetchingNextPage) {
        return (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-muted-foreground">
                <ShoppingBag size={36} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">{t('cancellations.empty')}</p>
            </div>
        );
    }

    const headers = [
        t('table.colIndex'),
        t('cancellations.colDate'),
        t('table.colBranch'),
        t('table.colTable'),
        t('cancellations.colCancelledBy'),
        t('cancellations.colReason'),
        t('cancellations.colProduct'),
        t('cancellations.colAmounts'),
    ];

    const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0;
    const paddingBottom = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end || 0)
        : 0;

    return (
        <div ref={containerRef} className="rounded-xl border border-border bg-card border-border overflow-auto h-full scrollbar-thin">
            <table className="w-full text-sm relative">
                <thead className="bg-muted border-b border-border sticky top-0 z-10 shadow-sm">
                    <tr>
                        {headers.map((h) => (
                            <th
                                key={h}
                                className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {paddingTop > 0 && (
                        <tr><td colSpan={headers.length} style={{ height: `${paddingTop}px` }} /></tr>
                    )}
                    {virtualItems.map((virtualRow) => {
                        const row = rows[virtualRow.index];
                        return (
                            <CancellationRow
                                key={row.id}
                                row={row}
                                idx={virtualRow.index}
                                onRowClick={onRowClick}
                                measureElement={rowVirtualizer.measureElement}
                                reasonLabel={reasonForRow(row)}
                            />
                        );
                    })}
                    {paddingBottom > 0 && (
                        <tr><td colSpan={headers.length} style={{ height: `${paddingBottom}px` }} /></tr>
                    )}
                    {infiniteControls?.isFetchingNextPage && (
                        <tr>
                            <td colSpan={headers.length} className="py-4">
                                <div className="flex items-center justify-center gap-2 text-blue-600">
                                    <Loader2 className="animate-spin" size={20} />
                                    <span className="text-xs font-medium">{t('list.loadingHint')}</span>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
});
CancellationsTable.displayName = 'CancellationsTable';
