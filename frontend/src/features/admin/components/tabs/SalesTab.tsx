'use client';

import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { getRangeForSalesPeriodPreset } from '@/features/sales/utils/salesPeriod';
import { Banknote, CreditCard, MoreHorizontal, RotateCcw, TrendingUp, Loader2 } from 'lucide-react';
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatDate, formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TableSelect } from '@/features/tables/components/TableSelect';
import { CashierSelect } from './CashierSelect';
import type { Sale as SalesFeatSale } from '@/features/sales/types';

export type Sale = Pick<SalesFeatSale, "id" | "table_name" | "created_by_name" | "payment_method" | "payment_method_display" | "total_amount" | "discount_amount" | "paid_at" | "branch_name" | "notes">

interface SalesTabProps {
    sales: Sale[];
    tableId: string;
    setTableId: (s: string) => void;
    cashierId: string;
    setCashierId: (s: string) => void;
    paymentFilter: string;
    setPaymentFilter: (s: string) => void;
    startDate: string;
    setStartDate: (s: string) => void;
    endDate: string;
    setEndDate: (s: string) => void;
    infiniteControls: {
        fetchNextPage: () => void;
        hasNextPage: boolean;
        isFetchingNextPage: boolean;
        totals: { gross_total: number; discount_total: number; net_total: number };
        totalCount: number;
    };
}

const PAYMENT_BADGE: Record<string, string> = {
    CASH: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-200/20',
    CARD: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-200/20',
    OTHER: 'bg-slate-100 text-slate-600 border-border dark:bg-slate-800 dark:text-muted-foreground dark:border-slate-700',
};

const PAYMENT_ICONS: Record<string, React.ElementType> = {
    CASH: Banknote,
    CARD: CreditCard,
    OTHER: MoreHorizontal,
};

export function SalesTab({ 
    sales, 
    tableId,
    setTableId,
    cashierId,
    setCashierId,
    paymentFilter,
    setPaymentFilter,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    infiniteControls 
}: SalesTabProps) {
    const t = useTranslations("admin")
    const canViewAmounts = useCanViewAmounts();
    
    const parentRef = useRef<HTMLDivElement>(null);

    // ── Tables ──────────────────────────────────────────────────────────────
    // (TableSelect kendi verisini çeker)

    // ── Cashiers ────────────────────────────────────────────────────────────
    // (CashierSelect kendi verisini çeker)

    const rowVirtualizer = useVirtualizer({
        count: sales.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 52,
        overscan: 10,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();

    const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0;
    const paddingBottom = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end || 0)
        : 0;

    useEffect(() => {
        const lastItem = virtualItems[virtualItems.length - 1];
        if (!lastItem) return;
        if (lastItem.index >= sales.length - 1 && infiniteControls.hasNextPage && !infiniteControls.isFetchingNextPage) {
            infiniteControls.fetchNextPage();
        }
    }, [virtualItems, sales.length, infiniteControls]);

    const totals = infiniteControls.totals;

    const todayR = getRangeForSalesPeriodPreset('today');
    const isAtDefaultToday =
        paymentFilter === 'ALL' &&
        startDate === todayR.start &&
        endDate === todayR.end;
    const hasFilters = !isAtDefaultToday || paymentFilter !== 'ALL' || tableId !== "" || cashierId !== "";

    return (
        <div className="space-y-4 h-full flex flex-col">
            {/* Header and Summary */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 shrink-0">
                <div>
                    <h2 className="text-2xl font-ui-bold text-foreground">{t('sales.title')}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{t('sales.description')}</p>
                </div>
                <div className="flex flex-col items-stretch sm:items-end gap-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground dark:bg-slate-800">
                    <div className="flex items-center gap-1.5 font-ui-semibold text-slate-600 dark:text-slate-300">
                        <TrendingUp size={14} />
                        <span>{t('sales.summary.selected')}</span>
                    </div>
                    <div className="text-sm font-ui-semibold tabular-nums text-foreground">
                        {t('sales.summary.gross')} {formatAmount(totals.gross_total, canViewAmounts)}
                    </div>
                    {totals.discount_total > 0.005 && (
                        <div className="text-sm font-ui-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                            {canViewAmounts ? `${t('sales.summary.discount')} −${formatCurrency(totals.discount_total)}` : AMOUNT_DISPLAY_MASK}
                        </div>
                    )}
                    <div className="text-sm font-ui-bold text-foreground tabular-nums border-t border-border dark:border-slate-600 pt-1">
                        {t('sales.summary.net')} {formatAmount(totals.net_total, canViewAmounts)}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
                {/* Table Select */}
                <TableSelect
                    value={tableId}
                    onChange={setTableId}
                    className="w-full sm:w-[200px] h-10 bg-card border-border text-sm dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                />

                {/* Cashier Select */}
                <CashierSelect
                    value={cashierId}
                    onChange={setCashierId}
                    className="w-full sm:w-[220px] h-10 bg-card border-border text-sm dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                />

                {/* Payment type filter */}
                <select
                    value={paymentFilter}
                    onChange={e => setPaymentFilter(e.target.value)}
                    className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none dark:bg-slate-900 dark:border-slate-700 h-10"
                >
                    <option value="ALL">{t('sales.filters.allPayments')}</option>
                    <option value="CASH">{t('sales.filters.cash')}</option>
                    <option value="CARD">{t('sales.filters.card')}</option>
                    <option value="OTHER">{t('sales.filters.other')}</option>
                </select>

                {/* Date range */}
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 h-10 dark:bg-slate-900 dark:border-slate-700">
                    <span className="text-2xs font-ui-semibold text-muted-foreground uppercase">{t('sales.filters.date')}</span>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        className="bg-transparent border-none p-0 text-sm text-slate-800 dark:text-slate-100 focus:outline-none w-32" />
                    <span className="text-slate-300 dark:text-slate-600">–</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        className="bg-transparent border-none p-0 text-sm text-slate-800 dark:text-slate-100 focus:outline-none w-32" />
                </div>

                {/* Reset */}
                {hasFilters && (
                    <button
                        onClick={() => {
                            setPaymentFilter('ALL');
                            setTableId("");
                            setCashierId("");
                            const t_range = getRangeForSalesPeriodPreset('today');
                            setStartDate(t_range.start);
                            setEndDate(t_range.end);
                        }}
                        className="p-2 text-muted-foreground hover:text-rose-500 transition-colors"
                        title={t('sales.filters.resetTitle')}
                    >
                        <RotateCcw size={15} />
                    </button>
                )}
            </div>

            {/* Table Container */}
            <div 
                ref={parentRef}
                className="bg-card rounded-2xl border border-border shadow-sm flex-1 overflow-auto scrollbar-thin dark:bg-slate-900 dark:border-slate-700"
            >
                <table className="w-full text-sm border-collapse table-fixed min-w-[1344px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-border dark:border-slate-700 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-16">{t('sales.table.index')}</th>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">{t('sales.table.table')}</th>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-40">{t('sales.table.cashier')}</th>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">{t('sales.table.method')}</th>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">{t('sales.table.gross')}</th>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">{t('sales.table.discount')}</th>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">{t('sales.table.total')}</th>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">{t('sales.table.branch')}</th>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-48">{t('sales.table.notes')}</th>
                            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground text-xs uppercase tracking-wider w-40">{t('sales.table.date')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paddingTop > 0 && (
                            <tr>
                                <td colSpan={10} style={{ height: `${paddingTop}px` }} />
                            </tr>
                        )}
                        {sales.length === 0 && !infiniteControls.isFetchingNextPage ? (
                            <tr>
                                <td colSpan={10} className="text-center py-20 text-muted-foreground">
                                    {t('common.noMatch')}
                                </td>
                            </tr>
                        ) : (
                            virtualItems.map((virtualRow) => {
                                const sale = sales[virtualRow.index];
                                const Icon = PAYMENT_ICONS[sale.payment_method] ?? MoreHorizontal;
                                const net = Number(sale.total_amount);
                                const disc = Number(sale.discount_amount ?? 0);
                                const list = net + disc;
                                
                                return (
                                    <tr
                                        key={virtualRow.key}
                                        data-index={virtualRow.index}
                                        ref={rowVirtualizer.measureElement}
                                        className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-default"
                                    >
                                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{virtualRow.index + 1}</td>
                                        <td className="px-4 py-3 font-ui-semibold text-foreground truncate">{sale.table_name ?? '—'}</td>
                                        <td className="px-4 py-3 text-muted-foreground truncate">{sale.created_by_name ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-ui-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${PAYMENT_BADGE[sale.payment_method] ?? PAYMENT_BADGE.OTHER}`}>
                                                <Icon size={10} />
                                                {sale.payment_method_display}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm font-ui-semibold tabular-nums text-foreground">
                                            {formatAmount(list, canViewAmounts)}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-ui-semibold tabular-nums">
                                            {disc > 0.005 ? (
                                                <span className="text-amber-700 dark:text-amber-400">
                                                    {canViewAmounts ? `−${formatCurrency(disc)}` : AMOUNT_DISPLAY_MASK}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground font-ui-normal">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-ui-bold tabular-nums text-foreground">
                                            {formatAmount(net, canViewAmounts)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs truncate">{sale.branch_name}</td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs truncate" title={sale.notes || undefined}>{sale.notes || '—'}</td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                                            {formatDate(sale.paid_at)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                        {paddingBottom > 0 && (
                            <tr>
                                <td colSpan={10} style={{ height: `${paddingBottom}px` }} />
                            </tr>
                        )}
                        {infiniteControls.isFetchingNextPage && (
                            <tr>
                                <td colSpan={10} className="py-4 text-center">
                                    <div className="flex items-center justify-center">
                                        <Loader2 size={24} className="animate-spin text-blue-600" />
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-800 border-t border-border dark:border-slate-700 sticky bottom-0 z-10 shadow-[0_-1px_0_rgba(0,0,0,0.05)]">
                        <tr className="divide-x-0">
                            <td colSpan={4} className="px-4 py-2.5 text-sm font-ui-semibold text-muted-foreground">
                                {t('sales.table.count', { count: sales.length })} / {t('sales.table.count', { count: infiniteControls.totalCount })}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-ui-semibold tabular-nums text-foreground">
                                {formatAmount(totals.gross_total, canViewAmounts)}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-ui-semibold tabular-nums text-amber-700 dark:text-amber-400">
                                {totals.discount_total > 0.005
                                    ? canViewAmounts
                                        ? `−${formatCurrency(totals.discount_total)}`
                                        : AMOUNT_DISPLAY_MASK
                                    : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-ui-bold tabular-nums text-foreground">
                                {formatAmount(totals.net_total, canViewAmounts)}
                            </td>
                            <td colSpan={3} className="px-4 py-2.5" />
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
