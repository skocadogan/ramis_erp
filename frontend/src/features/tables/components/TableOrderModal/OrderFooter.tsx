import React, { memo, useMemo } from 'react';
import { Tag, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';
import { OrderDetail, PaymentMethod, SplitPaymentMethod } from './types';
import { PAYMENT_METHODS } from './constants';

export type SplitAmountsState = Record<SplitPaymentMethod, string>;

type OrderFooterMode = 'full' | 'summary' | 'payment';

interface OrderFooterProps {
    orders: OrderDetail[];
    totalOrderDiscount: number;
    subtotalBeforeOrderDiscount: number;
    grandTotal: number;
    paymentMethod: PaymentMethod;
    setPaymentMethod: (val: PaymentMethod) => void;
    handlePayment: () => void;
    isPaying: boolean;
    isLoading: boolean;
    payError: string | null;
    /** Masa genel toplamı üzerinden bölünmüş ödeme */
    allowSplitPayment?: boolean;
    useSplitPayment?: boolean;
    onToggleSplit?: (v: boolean) => void;
    splitAmounts?: SplitAmountsState;
    onSplitAmountChange?: (method: SplitPaymentMethod, value: string) => void;
    /** Geçmiş satış: sadece tutar özeti, ödeme aksiyonu yok */
    readOnly?: boolean;
    onCreditClick?: () => void;
    creditAccountName?: string | null;
    isCreditSelected?: boolean;
    /** Tüm siparişleri iptal et butonu callback'i */
    onCancelAll?: () => void;
    isCancelling?: boolean;
    /** Hangi bölümün render edileceği: full (tümü), summary (sadece toplamlar), payment (sadece ödeme kontrolleri) */
    mode?: OrderFooterMode;
}

export const defaultSplitAmounts = (): SplitAmountsState => ({
    CASH: '',
    CARD: '',
    OTHER: '',
});

const OrderFooterImpl = ({
    orders,
    totalOrderDiscount,
    subtotalBeforeOrderDiscount,
    grandTotal,
    paymentMethod,
    setPaymentMethod,
    handlePayment,
    isPaying,
    isLoading,
    payError,
    allowSplitPayment = false,
    useSplitPayment = false,
    onToggleSplit,
    splitAmounts,
    onSplitAmountChange,
    readOnly = false,
    onCreditClick,
    creditAccountName,
    isCreditSelected = false,
    onCancelAll,
    isCancelling = false,
    mode = 'full',
}: OrderFooterProps) => {
    const t = useTranslations('tables.orderModal');
    const tPos = useTranslations('pos');
    const tCredit = useTranslations('credit');
    const locale = useLocale();
    const canViewAmounts = useCanViewAmounts();
    
    const splitSum = useMemo(() => {
        if (!splitAmounts) return 0;
        return (['CASH', 'CARD', 'OTHER'] as const).reduce(
            (s, k) => s + (parseFloat(splitAmounts[k]) || 0),
            0
        );
    }, [splitAmounts]);

    const formattedDate = useMemo(() => {
        if (orders.length !== 1) return null;
        return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { 
            dateStyle: 'short', 
            timeStyle: 'short' 
        }).format(new Date(orders[0].created_at));
    }, [orders, locale]);

    const showTotals = mode === 'full' || mode === 'summary';
    const showPayment = mode === 'full' || mode === 'payment';

    return (
        <div className="space-y-4">
            {showTotals && totalOrderDiscount > 0 && (
                <div className="flex flex-col gap-1 border-b border-slate-50 border-border pb-2 mb-1">
                    <div className="flex items-center justify-between text-sm font-mono">
                        <span>{t('orderSubtotal')}</span>
                        <span className="font-medium font-mono sm:text-lg">
                            {formatAmount(subtotalBeforeOrderDiscount, canViewAmounts)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-semibold text-amber-600 font-mono">
                        <div className="flex items-center gap-1">
                            <Tag size={12} />
                            <span>{t('discount')}</span>
                        </div>
                        <span className="font-bold sm:text-lg">
                            {canViewAmounts ? `-${formatCurrency(totalOrderDiscount)}` : AMOUNT_DISPLAY_MASK}
                        </span>
                    </div>
                </div>
            )}
            {showTotals && (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xl font-semibold font-mono text-muted-foreground">
                        {orders.length > 1 ? t('grandTotal') : t('total')}
                    </span>
                    <span className="text-xl font-bold text-foreground sm:text-4xl font-mono">
                        {formatAmount(grandTotal, canViewAmounts)}
                    </span>
                </div>
            )}

            {showTotals && formattedDate && (
                <p className="text-2xs text-muted-foreground -mt-2">
                    {formattedDate}
                </p>
            )}

            {showPayment && !readOnly && (
                <>
                    {allowSplitPayment && onToggleSplit && (
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={useSplitPayment}
                                onChange={(e) => onToggleSplit(e.target.checked)}
                                className="rounded border-slate-300"
                            />
                            {t('splitPayment')}
                        </label>
                    )}

                    {useSplitPayment && splitAmounts && onSplitAmountChange ? (
                        <div className="space-y-2.5 rounded-lg border border-border /80 p-3.5 border-border bg-muted/40 sm:p-4">
                            {PAYMENT_METHODS.map(({ value }) => (
                                <div key={value} className="flex items-center gap-2">
                                    <span className="w-16 shrink-0 text-sub font-semibold text-muted-foreground">
                                        {tPos(`payment.${value.toLowerCase()}`)}
                                    </span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0"
                                        value={splitAmounts[value]}
                                        onChange={(e) => onSplitAmountChange(value, e.target.value)}
                                        className="min-h-10 flex-1 rounded-md border border-border px-3 py-2 text-sm border-border bg-card"
                                    />
                                </div>
                            ))}
                            <p className="text-sub text-muted-foreground">
                                {t('splitSum')}:{' '}
                                <span className="font-bold text-foreground">
                                    {formatAmount(splitSum ?? 0, canViewAmounts)}
                                </span>
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                {PAYMENT_METHODS.map(({ value, icon: Icon }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setPaymentMethod(value)}
                                        className={`flex min-h-11 flex-1 touch-manipulation items-center justify-center gap-2 rounded-lg border px-1 py-2.5 text-xs font-semibold transition-all sm:text-sm
 ${paymentMethod === value && !isCreditSelected
 ? 'border-blue-600 bg-blue-600 text-white'
 : 'border-border hover:border-blue-300 hover:text-blue-600 border-border text-muted-foreground'
 }`}
                                    >
                                        <Icon size={15} className="shrink-0" aria-hidden />
                                        {tPos(`payment.${value.toLowerCase()}`)}
                                    </button>
                                ))}
                            </div>
                            {onCreditClick && (
                                <button
                                    type="button"
                                    onClick={onCreditClick}
                                    className={`flex w-full min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm
 ${isCreditSelected
 ? 'border-violet-600 bg-violet-600 text-white'
 : 'border-border hover:border-violet-300 hover:text-violet-600 border-border text-muted-foreground'
 }`}
                                >
                                    {tCredit('pos.button')}
                                </button>
                            )}
                            {isCreditSelected && creditAccountName && (
                                <p className="text-center text-xs text-violet-600 dark:text-violet-400">
                                    {tCredit('pos.selected', { name: creditAccountName })}
                                </p>
                            )}
                        </div>
                    )}

                    {payError && (
                        <p className="text-xs text-rose-500 text-center">{payError}</p>
                    )}

                    {onCancelAll && (
                        <button
                            type="button"
                            onClick={onCancelAll}
                            disabled={isCancelling || isPaying || isLoading}
                            className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-600 transition-all hover:bg-rose-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                        >
                            {isCancelling ? (
                                <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
                            ) : (
                                <XCircle size={16} className="shrink-0" aria-hidden />
                            )}
                            {t('cancelAllOrders')}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => void handlePayment()}
                        disabled={isPaying || isLoading}
                        className={`flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl px-3 py-3.5 text-sm font-bold transition-all sm:text-base
 ${isPaying || isLoading
 ? 'cursor-not-allowed text-muted-foreground'
 : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]'
 }`}
                    >
                        {isPaying ? (
                            <>
                                <Loader2 size={18} className="animate-spin shrink-0" aria-hidden />
                                {tPos('misc.processing')}
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={18} className="shrink-0" aria-hidden />
                                {orders.length > 1
                                    ? t('payAllOrders', { count: orders.length })
                                    : t('payNow')
                                }
                            </>
                        )}
                    </button>
                </>
            )}
        </div>
    );
};

const OrderFooter = memo(OrderFooterImpl) as typeof OrderFooterImpl & { displayName?: string };
OrderFooter.displayName = "OrderFooter";
export { OrderFooter };
