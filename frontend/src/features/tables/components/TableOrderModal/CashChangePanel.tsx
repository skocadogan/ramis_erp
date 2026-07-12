import { useEffect, useState, useCallback, useMemo } from 'react';
import { Coins, ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '@/components/ui/number-input';
import { VirtualKeyboard } from '@/components/ui/VirtualKeyboard';
import { normalizeDecimalCashInput } from '@/lib/cashInputNormalize';
import { formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';

interface CashChangePanelProps {
    cashGiven: string;
    setCashGiven: (val: string) => void;
    /** Non-split CASH: grandTotal. Split CASH: splitCashAmount */
    cashTarget: number;
}

export const CashChangePanel: React.FC<CashChangePanelProps> = ({
    cashGiven,
    setCashGiven,
    cashTarget,
}) => {
    const t = useTranslations('tables.orderModal');
    const canViewAmounts = useCanViewAmounts();
    const [expanded, setExpanded] = useState(true);
    const [showKeyboard, setShowKeyboard] = useState(false);

    useEffect(() => {
        setExpanded(true);
    }, [cashTarget]);

    useEffect(() => {
        if (!expanded) setShowKeyboard(false);
    }, [expanded]);

    const setFromKeyboard = useCallback((next: string) => {
        setCashGiven(normalizeDecimalCashInput(next));
    }, [setCashGiven]);

    const cashGivenNum = parseFloat(cashGiven) || 0;
    const changeAmount = useMemo(() => cashGivenNum - cashTarget, [cashGivenNum, cashTarget]);

    return (
        <div className="border border-emerald-200 rounded-xl overflow-hidden dark:border-emerald-700/50">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-ui-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
            >
                <span className="flex items-center gap-1.5"><Coins size={14} />{t('cashChange')}</span>
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {expanded && (
                <div className="p-4 flex flex-col gap-3 bg-card">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <NumberInput
                                min="0"
                                step="0.5"
                                placeholder={t('cashGivenPlaceholder')}
                                value={cashGiven}
                                onChange={(val) => setCashGiven(val)}
                                onClick={() => setShowKeyboard(true)}
                                onFocus={() => setShowKeyboard(true)}
                                readOnly={showKeyboard}
                                inputMode="decimal"
                                autoComplete="off"
                                suffix=""
                                containerClassName="flex-1"
                            />
                        </div>
                        {showKeyboard && (
                            <VirtualKeyboard
                                value={cashGiven}
                                onChange={setFromKeyboard}
                                mode="numeric"
                                showModeToggle={false}
                                onSubmit={() => setShowKeyboard(false)}
                                onCancel={() => setShowKeyboard(false)}
                                className="shadow-md"
                            />
                        )}
                    </div>

                    {cashGivenNum > 0 && (
                        <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-mono ${
                            changeAmount >= 0
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'
                        }`}>
                            <span className="font-ui-semibold">{t('changeAmount')}</span>
                            <span className="font-ui-bold text-lg">
                                {changeAmount >= 0
                                    ? formatAmount(changeAmount, canViewAmounts)
                                    : `-${formatAmount(Math.abs(changeAmount), canViewAmounts)}`}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
