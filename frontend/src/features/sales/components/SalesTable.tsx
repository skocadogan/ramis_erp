'use client';

import React, { memo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Banknote, Check, CreditCard, FileText, MoreHorizontal, ShoppingBag, Pencil, Trash2, Loader2, Wallet } from 'lucide-react';
import type { Sale } from '../types';
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';

;

interface SalesTableProps {
    sales: Sale[];
    canManage: boolean;
    onRowClick: (sale: Sale) => void;
    onEdit: (sale: Sale) => void;
    onDelete: (sale: Sale) => void;
    onInvoice?: (sale: Sale) => void;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
    onToggleAll?: (allIds: string[]) => void;
    infiniteControls?: {
        fetchNextPage: () => void;
        hasNextPage: boolean;
        isFetchingNextPage: boolean;
    };
}

const PAYMENT_ROW_COLOR: Record<string, string> = {
    CASH: 'hover:bg-emerald-50/60 dark:hover:bg-emerald-900/10',
    CARD: 'hover:bg-blue-50/60 dark:hover:bg-blue-900/10',
    OTHER: 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30',
    CREDIT: 'hover:bg-violet-50/60 dark:hover:bg-violet-900/10',
};

const PAYMENT_BADGE: Record<string, string> = {
    CASH: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700/40',
    CARD: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700/40',
    OTHER: 'bg-slate-100 text-slate-600 border-border bg-muted dark:text-muted-foreground border-border',
    CREDIT: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-700/40',
};

const PAYMENT_ICONS: Record<string, React.ElementType> = {
    CASH: Banknote,
    CARD: CreditCard,
    OTHER: MoreHorizontal,
    CREDIT: Wallet,
};

const SaleRow = memo(({
    sale,
    idx,
    isSelectable,
    isSelected,
    canManage,
    onRowClick,
    onEdit,
    onDelete,
    onInvoice,
    onToggleSelect,
    measureElement
}: {
    sale: Sale
    idx: number
    isSelectable: boolean
    isSelected: boolean
    canManage: boolean
    onRowClick: (sale: Sale) => void
    onEdit: (sale: Sale) => void
    onDelete: (sale: Sale) => void
    onInvoice?: (sale: Sale) => void
    onToggleSelect?: (id: string) => void
    measureElement: (el: HTMLElement | null) => void
}) => {
    const t = useTranslations('sales');
    const canViewAmounts = useCanViewAmounts();
    const Icon = PAYMENT_ICONS[sale.payment_method] ?? MoreHorizontal;

    const prices = React.useMemo(() => {
        const net = Number(sale.total_amount);
        const disc = Number(sale.discount_amount ?? 0);
        const list = net + disc;
        const hasDisc = disc > 0.0001;
        return {
            net, disc, list, hasDisc,
            netStr: formatCurrency(net),
            listAmountStr: formatNumber(list),
            discAmountStr: formatNumber(disc),
            netAmountStr: formatNumber(net),
        }
    }, [sale.total_amount, sale.discount_amount]);

    return (
        <tr
            data-index={idx}
            ref={measureElement}
            onClick={() => onRowClick(sale)}
            className={`border-b border-slate-100 border-border/60 last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-rose-50/40 dark:bg-rose-900/10' : PAYMENT_ROW_COLOR[sale.payment_method] ?? PAYMENT_ROW_COLOR.OTHER}`}
        >
            {isSelectable && (
                <td className="px-4 py-3 w-8" onClick={e => e.stopPropagation()}>
                    <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition text-left">
                        <span className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 transition ${isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300 border-border bg-muted"}`}>
                            {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                        </span>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect?.(sale.id)}
                            className="sr-only"
                        />
                    </label>
                </td>
            )}
            <td className="px-4 py-3 text-xs text-muted-foreground dark:text-muted-foreground font-mono tabular-nums">{idx + 1}</td>
            <td className="px-4 py-3 text-foreground">
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{sale.branch_name}</span>
                </div>
            </td>
            <td className="px-4 py-3 font-semibold text-foreground">
                <div className="flex flex-col">
                    {sale.table_name ?? <span className="text-muted-foreground dark:text-muted-foreground">{t('table.dash')}</span>}
                    {sale.order_type === 'TAKEAWAY' && (
                        <span className="text-2xs text-amber-600 font-bold uppercase">{t('table.takeaway')}</span>
                    )}
                </div>
            </td>
            <td className="px-4 py-3 text-muted-foreground">
                {sale.created_by_name ?? <span className="text-muted-foreground dark:text-muted-foreground">{t('table.dash')}</span>}
            </td>
            <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1 text-sub font-semibold px-2 py-0.5 rounded-full border ${PAYMENT_BADGE[sale.payment_method] ?? PAYMENT_BADGE.OTHER}`}>
                    <Icon size={10} />
                    {sale.payment_method_display}
                    {sale.is_split_payment ? <span className="ml-1 text-3xs opacity-80">{t('table.splitPayment')}</span> : null}
                </span>
            </td>
            <td className="px-4 py-3 text-foreground">
                {!canViewAmounts ? (
                    <span className="text-sm font-bold tabular-nums text-foreground min-w-[9rem] inline-block">
                        {AMOUNT_DISPLAY_MASK}
                    </span>
                ) : !prices.hasDisc ? (
                    <span className="text-sm font-bold tabular-nums text-foreground min-w-[9rem] inline-block">
                        {prices.netStr}
                    </span>
                ) : (
                    <div className="flex flex-col gap-1 items-start min-w-[9rem]">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                            {t('table.listPrice', { amount: prices.listAmountStr })}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                            {t('table.discountLine', { amount: prices.discAmountStr })}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-foreground">
                            {t('table.grandTotal', { amount: prices.netAmountStr })}
                        </span>
                    </div>
                )}
            </td>
            <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[12rem]" title={sale.notes || undefined}>
                {sale.notes || <span className="text-muted-foreground/60 dark:text-muted-foreground/60">{t('table.dash')}</span>}
            </td>
            <td className="px-4 py-3 text-xs text-muted-foreground">
                {formatDate(sale.paid_at)}
            </td>
            {canManage && (
                <td className="px-4 py-3">
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => onEdit(sale)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title={t('table.editTitle')}
                        >
                            <Pencil size={13} />
                        </button>
                        <button
                            onClick={() => onDelete(sale)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                            title={t('table.deleteTitle')}
                        >
                            <Trash2 size={13} />
                        </button>
                        {onInvoice && (
                            <button
                                onClick={() => onInvoice(sale)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                                title={t('table.invoiceTitle')}
                            >
                                <FileText size={13} />
                            </button>
                        )}
                    </div>
                </td>
            )}
        </tr>
    );
})
SaleRow.displayName = 'SaleRow';

export const SalesTable = memo(({ 
    sales, 
    canManage, 
    onRowClick, 
    onEdit, 
    onDelete, 
    onInvoice, 
    selectedIds, 
    onToggleSelect, 
    onToggleAll,
    infiniteControls
}: SalesTableProps) => {
    const t = useTranslations('sales');
    const isSelectable = selectedIds !== undefined && onToggleSelect !== undefined && onToggleAll !== undefined;
    const allSelected = isSelectable && sales.length > 0 && sales.every(s => selectedIds!.has(s.id));
    const someSelected = isSelectable && sales.some(s => selectedIds!.has(s.id));

    const containerRef = React.useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: sales.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => 60,
        overscan: 10,
        measureElement: (el) => el.getBoundingClientRect().height,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();

    // Trigger next page load
    useEffect(() => {
        const lastItem = virtualItems[virtualItems.length - 1];
        if (!lastItem || !infiniteControls) return;

        if (lastItem.index >= sales.length - 1 && infiniteControls.hasNextPage && !infiniteControls.isFetchingNextPage) {
            infiniteControls.fetchNextPage();
        }
    }, [virtualItems, sales.length, infiniteControls]);

    if (sales.length === 0 && !infiniteControls?.isFetchingNextPage) {
        return (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-muted-foreground dark:text-muted-foreground">
                <ShoppingBag size={36} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">{t('table.empty')}</p>
            </div>
        );
    }

    const headers = isSelectable
        ? ['', t('table.colIndex'), t('table.colBranch'), t('table.colTable'), t('table.colCashier'), t('table.colPayment'), t('table.colAmounts'), t('table.colNotes'), t('table.colDate')]
        : [t('table.colIndex'), t('table.colBranch'), t('table.colTable'), t('table.colCashier'), t('table.colPayment'), t('table.colAmounts'), t('table.colNotes'), t('table.colDate')];
    if (canManage) headers.push('');

    const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0;
    const paddingBottom = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end || 0)
        : 0;

    return (
        <div ref={containerRef} className="rounded-xl border border-border bg-card border-border overflow-auto h-full scrollbar-thin">
            <table className="w-full text-sm relative">
                <thead className="bg-muted border-b border-border sticky top-0 z-10 shadow-sm">
                    <tr>
                        {isSelectable && (
                            <th className="px-4 py-2.5 w-8" onClick={e => e.stopPropagation()}>
                                <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition text-left">
                                    <span className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 transition ${allSelected ? "bg-blue-600 border-blue-600" : "border-slate-300 border-border bg-muted"}`}>
                                        {allSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                                        onChange={() => onToggleAll!(sales.map(s => s.id))}
                                        className="sr-only"
                                    />
                                </label>
                            </th>
                        )}
                        {headers.filter(h => h !== '').map(h => (
                            <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                        ))}
                        {canManage && <th className="px-4 py-2.5" />}
                    </tr>
                </thead>
                <tbody>
                    {paddingTop > 0 && <tr><td colSpan={headers.length} style={{ height: `${paddingTop}px` }} /></tr>}
                    {virtualItems.map((virtualRow) => {
                        const sale = sales[virtualRow.index];
                        return (
                            <SaleRow
                                key={sale.id}
                                sale={sale}
                                idx={virtualRow.index}
                                isSelectable={isSelectable}
                                isSelected={isSelectable && selectedIds!.has(sale.id)}
                                canManage={canManage}
                                onRowClick={onRowClick}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onInvoice={onInvoice}
                                onToggleSelect={onToggleSelect}
                                measureElement={rowVirtualizer.measureElement}
                            />
                        );
                    })}
                    {paddingBottom > 0 && <tr><td colSpan={headers.length} style={{ height: `${paddingBottom}px` }} /></tr>}
                    
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
})
SalesTable.displayName = 'SalesTable';
