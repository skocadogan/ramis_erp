import { ClipboardList, MoreHorizontal, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatDate, formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';
import { SaleDetail } from './types';
import { PAYMENT_ICONS } from './constants';

function SalePaymentMethodRow({ sale }: { sale: SaleDetail }) {
    const t = useTranslations('tables.orderModal');
    
    // Split payment visualization
    if (sale.is_split_payment && sale.payments && sale.payments.length > 0) {
        return (
            <div className="space-y-1.5 pt-1 mt-1 border-t border-dashed border-border border-border">
                <span className="text-2xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">
                    {t('paymentBreakdown')}
                </span>
                {sale.payments.map((p) => {
                    const Icon = PAYMENT_ICONS[p.payment_method] ?? MoreHorizontal;
                    return (
                        <div key={p.id} className="flex items-center justify-between text-xs pl-2 border-l-2 border-blue-400/30">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                <Icon size={11} className="text-blue-500" />
                                {p.payment_method_display}
                            </span>
                            <span className="font-semibold text-foreground">
                                {formatCurrency(p.amount)}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('paymentMethod')}</span>
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
                {sale.original_payment_method && sale.payment_method !== sale.original_payment_method && (
                    <>
                        <span className="line-through text-muted-foreground inline-flex items-center gap-0.5">
                            {(() => { const Icon = PAYMENT_ICONS[sale.original_payment_method] ?? MoreHorizontal; return <Icon size={11} />; })()}
                            {sale.original_payment_method_display}
                        </span>
                        <span className="text-muted-foreground mx-0.5">→</span>
                    </>
                )}
                {(() => { const Icon = PAYMENT_ICONS[sale.payment_method] ?? MoreHorizontal; return <Icon size={11} />; })()}
                {sale.payment_method_display}
            </span>
        </div>
    );
}

interface SaleDetailViewProps {
    sale: SaleDetail;
    grandTotal: number;
    hasSaleChanges: boolean;
    /** Geçmiş satış detayı (/sales): tüm satış alanlarını göster */
    variant?: 'changes' | 'full';
    actionSlot?: React.ReactNode;
}

export const SaleDetailView: React.FC<SaleDetailViewProps> = ({
    sale,
    grandTotal,
    hasSaleChanges,
    variant = 'changes',
    actionSlot,
}) => {
    const t = useTranslations('tables.orderModal');
    const canViewAmounts = useCanViewAmounts();
    if (variant === 'changes' && !hasSaleChanges) return null;

    const isFull = variant === 'full';

    if (isFull) {
        return (
            <div className="rounded-lg border border-border bg-muted/50 border-input px-3 py-2.5 space-y-1.5">
                <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-sub font-semibold text-foreground">
                        <ClipboardList size={12} />
                        {t('saleInfo')}
                    </div>
                    {actionSlot}
                </div>
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('totalRegistered')}</span>
                    <span className="font-bold text-foreground">
                        {formatAmount(sale.total_amount, canViewAmounts)}
                    </span>
                </div>
                {Number(sale.total_amount) !== grandTotal && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t('orderSubtotal')}</span>
                        <span>{formatAmount(grandTotal, canViewAmounts)}</span>
                    </div>
                )}
                {sale.notes.trim() && (
                    <div className="flex items-start justify-between gap-2 text-xs">
                        <span className="text-muted-foreground shrink-0">{t('note')}</span>
                        <span className="text-foreground text-right">{sale.notes}</span>
                    </div>
                )}
                <SalePaymentMethodRow sale={sale} />
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('posTerminal')}</span>
                    <span className="font-medium text-foreground text-right">
                        {sale.pos_terminal_display?.trim() || '—'}
                    </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('cashier')}</span>
                    <span className="font-medium text-foreground">{sale.created_by_name ?? '—'}</span>
                </div>
                {(Number(sale.discount_amount || 0)) > 0 && (
                    <div className="flex items-center justify-between text-xs pt-1 mt-1 border-t border-border border-input">
                        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-semibold">
                            <Tag size={11} />
                            <span>{t('discountWithInfo', { type: sale.discount_type_display ?? sale.discount_type ?? '' })}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="font-bold text-amber-700 dark:text-amber-400">
                                {canViewAmounts ? `-${formatCurrency(sale.discount_amount ?? 0)}` : AMOUNT_DISPLAY_MASK}
                            </span>
                            {sale.discount_applied_by_name && (
                                <span className="text-3xs text-amber-600/80 dark:text-amber-500/70">{t('appliedBy', { name: sale.discount_applied_by_name })}</span>
                            )}
                        </div>
                    </div>
                )}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border border-input">
                    <span className="text-muted-foreground">{t('paidAt')}</span>
                    <span className="font-medium text-foreground">
                        {formatDate(sale.paid_at)}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/40 px-3 py-2.5 space-y-1.5">
            <div className="mb-1 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-sub font-semibold text-amber-700 dark:text-amber-400">
                    <ClipboardList size={12} />
                    {t('appliedChanges')}
                </div>
                {actionSlot}
            </div>
            {Number(sale.total_amount) !== grandTotal && (
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('amountUpdated')}</span>
                    <span className="font-semibold text-foreground">
                        <span className="line-through text-muted-foreground mr-1.5">
                            {formatAmount(grandTotal, canViewAmounts)}
                        </span>
                        {formatAmount(sale.total_amount, canViewAmounts)}
                    </span>
                </div>
            )}
            {sale.notes.trim() && (
                <div className="flex items-start justify-between gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0">{t('note')}</span>
                    <span className="text-foreground text-right">{sale.notes}</span>
                </div>
            )}
            <SalePaymentMethodRow sale={sale} />
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('posTerminal')}</span>
                <span className="font-medium text-foreground text-right">
                    {sale.pos_terminal_display?.trim() || '—'}
                </span>
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('cashier')}</span>
                <span className="font-medium text-foreground">{sale.created_by_name ?? '—'}</span>
            </div>
            {(Number(sale.discount_amount || 0)) > 0 && (
                <div className="flex items-center justify-between text-xs pt-1 mt-1 border-t border-amber-200 dark:border-amber-700/40">
                    <div className="flex items-center gap-1.5 text-amber-600 font-semibold">
                        <Tag size={11} />
                        <span>{t('discountWithInfo', { type: sale.discount_type_display ?? '' })}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="font-bold text-amber-600">
                            {canViewAmounts ? `-${formatCurrency(sale.discount_amount ?? 0)}` : AMOUNT_DISPLAY_MASK}
                        </span>
                        {sale.discount_applied_by_name && (
                            <span className="text-3xs text-amber-500/70">{t('appliedBy', { name: sale.discount_applied_by_name })}</span>
                        )}
                    </div>
                </div>
            )}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-amber-200 dark:border-amber-700/40">
                <span className="text-muted-foreground dark:text-muted-foreground">
                    {sale.created_by_name ?? '—'}
                </span>
                <span className="text-muted-foreground dark:text-muted-foreground">
                    {formatDate(sale.paid_at)}
                </span>
            </div>
        </div>
    );
};
