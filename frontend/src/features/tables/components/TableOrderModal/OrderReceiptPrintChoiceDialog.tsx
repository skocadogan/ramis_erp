'use client';

import { ChefHat, Loader2, Printer, ReceiptText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface OrderReceiptPrintChoiceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    showKitchenOption: boolean;
    onPrintKitchen?: () => void | Promise<void>;
    onPrintOrder?: () => void | Promise<void>;
    isReprinting?: boolean;
}

export function OrderReceiptPrintChoiceDialog({
    open,
    onOpenChange,
    showKitchenOption,
    onPrintKitchen,
    onPrintOrder,
    isReprinting = false,
}: OrderReceiptPrintChoiceDialogProps) {
    const t = useTranslations('tables.orderModal');

    const handleKitchen = () => {
        onOpenChange(false);
        void onPrintKitchen?.();
    };

    const handleOrder = () => {
        onOpenChange(false);
        void onPrintOrder?.();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <Printer size={20} className="shrink-0 text-violet-600" aria-hidden />
                        {t('printReceipt')}
                    </DialogTitle>
                    <DialogDescription>{t('printChoiceDesc')}</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 py-1">
                    {showKitchenOption && onPrintKitchen && (
                        <Button
                            type="button"
                            disabled={isReprinting}
                            onClick={handleKitchen}
                            className="h-14 min-h-14 w-full touch-manipulation justify-start gap-3 px-4 text-base font-ui-bold bg-violet-600 hover:bg-violet-700"
                        >
                            {isReprinting ? (
                                <Loader2 size={22} className="shrink-0 animate-spin" aria-hidden />
                            ) : (
                                <ChefHat size={22} className="shrink-0" aria-hidden />
                            )}
                            {t('printKitchenReceipt')}
                        </Button>
                    )}
                    {onPrintOrder && (
                        <Button
                            type="button"
                            variant={showKitchenOption ? 'outline' : 'default'}
                            disabled={isReprinting}
                            onClick={handleOrder}
                            className={
                                showKitchenOption
                                    ? 'h-14 min-h-14 w-full touch-manipulation justify-start gap-3 border-violet-200 px-4 text-base font-ui-bold text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-900/20'
                                    : 'h-14 min-h-14 w-full touch-manipulation justify-start gap-3 px-4 text-base font-ui-bold bg-violet-600 hover:bg-violet-700'
                            }
                        >
                            {isReprinting && !showKitchenOption ? (
                                <Loader2 size={22} className="shrink-0 animate-spin" aria-hidden />
                            ) : (
                                <ReceiptText size={22} className="shrink-0" aria-hidden />
                            )}
                            {t('printOrderReceipt')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
