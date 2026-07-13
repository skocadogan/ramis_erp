import { useState } from 'react';
import { X, Loader2, ReceiptText, ArrowRightLeft, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { OrderReceiptPrintChoiceDialog } from './OrderReceiptPrintChoiceDialog';

interface OrderModalHeaderProps {
    tableName: string;
    isTransferring: boolean;
    setIsTransferring: (v: boolean) => void;
    hasActiveOrders: boolean;
    orderId?: string;
    onNewOrder?: () => void;
    onClose: () => void;
    fetchAllTables: () => void;
    canManageTakeaway: boolean;
    isHistoricalSaleView: boolean;
    saleId?: string;
    onReprintKitchen?: () => void;
    onReprintOrder?: () => void;
    isReprinting?: boolean;
}

export function OrderModalHeader({
    tableName,
    isTransferring,
    setIsTransferring,
    hasActiveOrders,
    orderId,
    onNewOrder,
    onClose,
    fetchAllTables,
    canManageTakeaway,
    isHistoricalSaleView,
    saleId,
    onReprintKitchen,
    onReprintOrder,
    isReprinting = false,
}: OrderModalHeaderProps) {
    const t = useTranslations('tables.orderModal');
    const tForm = useTranslations('tables.form');
    const [printChoiceOpen, setPrintChoiceOpen] = useState(false);

    const showActiveOrderPrintMenu =
        !isTransferring &&
        hasActiveOrders &&
        !orderId &&
        !isHistoricalSaleView &&
        Boolean(onReprintKitchen || onReprintOrder);
    const showHistoricalPrintMenu =
        !isTransferring &&
        isHistoricalSaleView &&
        hasActiveOrders &&
        Boolean(onReprintOrder);
    const showPrintMenu = showActiveOrderPrintMenu || showHistoricalPrintMenu;
    const showKitchenPrintOption = showActiveOrderPrintMenu && Boolean(onReprintKitchen);

    return (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 border-border sm:px-5 sm:py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
                {isTransferring ? (
                    <button 
                        type="button"
                        onClick={() => setIsTransferring(false)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover: dark:hover: touch-manipulation"
                    >
                        <Loader2 size={18} className="rotate-180" />
                    </button>
                ) : (
                    <ReceiptText size={20} className="shrink-0 text-blue-600" aria-hidden />
                )}
                <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold sm:text-base text-foreground">
                        {isTransferring ? t('selectTargetTable') : isHistoricalSaleView ? t('saleDetail') : t('orderDetail')}
                    </h2>
                    {isHistoricalSaleView && saleId && (
                        <p
                            className="truncate font-mono text-2xs text-muted-foreground sm:text-xs dark:text-muted-foreground"
                            title={saleId}
                        >
                            {t('saleIdLabel', { id: saleId })}
                        </p>
                    )}
                    <p className="truncate text-sub text-muted-foreground sm:text-xs dark:text-muted-foreground">
                        {tableName}
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
                {!isTransferring && hasActiveOrders && !orderId && (
                    <button
                        type="button"
                        onClick={() => {
                            setIsTransferring(true);
                            fetchAllTables();
                        }}
                        className="flex touch-manipulation items-center gap-1 rounded-lg border border-blue-200 px-2 py-1.5 text-2xs font-bold text-blue-600 transition-all hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-900/20 sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs"
                    >
                        <ArrowRightLeft size={14} className="shrink-0" aria-hidden />
                        {t('transfer')}
                    </button>
                )}
                {showPrintMenu && (
                    <>
                        <button
                            type="button"
                            disabled={isReprinting}
                            onClick={() => setPrintChoiceOpen(true)}
                            className="flex min-h-10 touch-manipulation items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-2 text-xs font-bold text-violet-600 transition-all hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-800 dark:hover:bg-violet-900/20 sm:px-3.5 sm:text-sm"
                        >
                            {isReprinting ? (
                                <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
                            ) : (
                                <Printer size={16} className="shrink-0" aria-hidden />
                            )}
                            {t('printReceipt')}
                        </button>
                        <OrderReceiptPrintChoiceDialog
                            open={printChoiceOpen}
                            onOpenChange={setPrintChoiceOpen}
                            showKitchenOption={showKitchenPrintOption}
                            onPrintKitchen={onReprintKitchen}
                            onPrintOrder={onReprintOrder}
                            isReprinting={isReprinting}
                        />
                    </>
                )}
                {onNewOrder && canManageTakeaway && (
                     <button
                        type="button"
                        onClick={onNewOrder}
                        className="flex touch-manipulation items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1.5 text-2xs font-bold text-emerald-600 transition-all hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20 sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs"
                     >
                         {t('newOrder')}
                     </button>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-muted-foreground transition-colors hover: dark:hover:"
                    aria-label={tForm('cancel')}
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
}
