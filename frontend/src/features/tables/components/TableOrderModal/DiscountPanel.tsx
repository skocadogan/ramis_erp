import { useEffect, useState } from 'react';
import { Tag, ChevronUp, ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '@/components/ui/number-input';
import { VirtualKeyboard } from '@/components/ui/VirtualKeyboard';
import { normalizeDecimalCashInput } from '@/lib/cashInputNormalize';
import { OrderDetail } from './types';
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';

interface DiscountPanelProps {
    showDiscountPanel: boolean;
    setShowDiscountPanel: (val: boolean) => void;
    discountType: 'ORDER' | 'ITEM';
    setDiscountType: (val: 'ORDER' | 'ITEM') => void;
    discountAmount: string;
    setDiscountAmount: (val: string) => void;
    discountOrderId: string;
    setDiscountOrderId: (val: string) => void;
    discountItemId: string;
    setDiscountItemId: (val: string) => void;
    isApplyingDiscount: boolean;
    discountError: string | null;
    setDiscountError: (val: string | null) => void;
    applyDiscount: () => void;
    handleRemoveDiscount: (id: string) => void;
    orders: OrderDetail[];
}

export const DiscountPanel: React.FC<DiscountPanelProps> = ({
    showDiscountPanel,
    setShowDiscountPanel,
    discountType,
    setDiscountType,
    discountAmount,
    setDiscountAmount,
    discountOrderId,
    setDiscountOrderId,
    discountItemId,
    setDiscountItemId,
    isApplyingDiscount,
    discountError,
    setDiscountError,
    applyDiscount,
    handleRemoveDiscount,
    orders,
}) => {
    const t = useTranslations('tables.orderModal');
    const canViewAmounts = useCanViewAmounts();
    const [showDiscountKeyboard, setShowDiscountKeyboard] = useState(false);

    useEffect(() => {
        if (!showDiscountPanel) setShowDiscountKeyboard(false);
    }, [showDiscountPanel]);

    const setAmountFromKeyboard = (next: string) => {
        setDiscountAmount(normalizeDecimalCashInput(next));
        setDiscountError(null);
    };

    return (
        <div className="border border-amber-200 rounded-xl overflow-hidden dark:border-amber-700/50">
            <button
                type="button"
                onClick={() => { setShowDiscountPanel(!showDiscountPanel); setDiscountError(null); }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
            >
                <span className="flex items-center gap-1.5"><Tag size={14} />{t('applyDiscount')}</span>
                {showDiscountPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showDiscountPanel && (
                <div className="p-4 flex flex-col gap-3 bg-card">
                    <div className="flex gap-2">
                        {(['ORDER', 'ITEM'] as const).map(type => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setDiscountType(type)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all
 ${discountType === type ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'border-border hover:border-amber-300 border-border text-muted-foreground'}`}
                            >
                                {type === 'ORDER' ? `🧾 ${t('discountOrder')}` : `🍽️ ${t('discountItem')}`}
                            </button>
                        ))}
                    </div>

                    {orders.length > 1 && (
                        <select
                            value={discountOrderId}
                            onChange={e => setDiscountOrderId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-muted border-input text-muted-foreground"
                        >
                            <option value="">— {t('selectOrder')} —</option>
                            {orders.map((o, i) => (
                                <option key={o.id} value={o.id}>
                                    {t('orderNum', { num: i + 1 })} —{" "}
                                    {formatAmount(Number(o.total_amount), canViewAmounts)}
                                </option>
                            ))}
                        </select>
                    )}

                    {discountType === 'ITEM' && (
                        <select
                            value={discountItemId}
                            onChange={e => setDiscountItemId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-muted border-input text-muted-foreground"
                        >
                            <option value="">— {t('selectProduct')} —</option>
                            {(discountOrderId ? orders.find(o => o.id === discountOrderId) : orders[0])?.items
                                .filter(it => it.status !== 'CANCELLED' && it.status !== 'COMPLETED')
                                .map(it => (
                                    <option key={it.id} value={it.id}>
                                        {it.product_name} {it.unit_name ? `(${it.unit_name})` : ''} —{" "}
                                        {formatAmount(it.total_price, canViewAmounts)}
                                    </option>
                                ))}
                        </select>
                    )}

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <NumberInput
                                min="0.01"
                                step="0.5"
                                placeholder={t('discountAmountPlaceholder')}
                                value={discountAmount}
                                onChange={(val) => {
                                    setDiscountAmount(val);
                                    setDiscountError(null);
                                }}
                                onClick={() => {
                                    setShowDiscountKeyboard(true);
                                    setDiscountError(null);
                                }}
                                onFocus={() => {
                                    setShowDiscountKeyboard(true);
                                    setDiscountError(null);
                                }}
                                readOnly={showDiscountKeyboard}
                                inputMode="decimal"
                                autoComplete="off"
                                suffix=""
                                containerClassName="flex-1"
                            />
                            <button
                                type="button"
                                onClick={applyDiscount}
                                disabled={isApplyingDiscount || !discountAmount}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg disabled:opacity-50 transition-colors"
                            >
                                {isApplyingDiscount ? <Loader2 size={12} className="animate-spin" /> : t('apply')}
                            </button>
                        </div>
                        {showDiscountKeyboard && (
                            <VirtualKeyboard
                                value={discountAmount}
                                onChange={setAmountFromKeyboard}
                                mode="numeric"
                                showModeToggle={false}
                                onSubmit={() => {
                                    if (!isApplyingDiscount && discountAmount) applyDiscount();
                                }}
                                onCancel={() => setShowDiscountKeyboard(false)}
                                className="shadow-md"
                            />
                        )}
                    </div>
                    {discountError && <p className="text-xs text-rose-500">{discountError}</p>}

                    {orders.some(o => (o.discount_amount || 0) > 0) && (
                        <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 space-y-2 dark:bg-amber-900/20 dark:text-amber-400">
                            <p className="font-bold border-b border-amber-200 dark:border-amber-700/50 pb-1 mb-1">{t('appliedDiscounts')}</p>
                            {orders.filter(o => (o.discount_amount || 0) > 0).map(o => (
                                <div key={o.id} className="flex justify-between items-center group">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-2xs uppercase opacity-80">{o.discount_type === 'ORDER' ? t('discountOrder') : t('discountItem')}</span>
                                        <span className="text-sub">{o.discount_by_name ? `${o.discount_by_name}` : t('manager')}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold">
                                            {canViewAmounts ? `-${formatCurrency(o.discount_amount ?? 0)}` : AMOUNT_DISPLAY_MASK}
                                        </span>
                                        <button
                                            onClick={() => handleRemoveDiscount(o.id)}
                                            className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                                            title={t('removeDiscount')}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
