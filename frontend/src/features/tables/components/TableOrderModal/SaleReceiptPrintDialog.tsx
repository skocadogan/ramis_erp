'use client';

import { useEffect, useState } from 'react';
import { Loader2, Printer as PrinterIcon, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { adminApi, type Printer, type ReceiptTemplate } from '@/features/admin/services/adminApi';

type SaleReceiptPrintSelection = {
    printerId: string;
    templateSlug: string;
};

interface SaleReceiptPrintDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    branchId: string | undefined;
    onConfirm: (selection: SaleReceiptPrintSelection) => void | Promise<void>;
    isSubmitting?: boolean;
}

export function SaleReceiptPrintDialog({
    open,
    onOpenChange,
    branchId,
    onConfirm,
    isSubmitting = false,
}: SaleReceiptPrintDialogProps) {
    const t = useTranslations('tables.orderModal');
    const tPos = useTranslations('pos.settings');

    const [printers, setPrinters] = useState<Printer[]>([]);
    const [templates, setTemplates] = useState<ReceiptTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [printerId, setPrinterId] = useState('');
    const [templateSlug, setTemplateSlug] = useState('');

    useEffect(() => {
        if (!open) {
            setPrinterId('');
            setTemplateSlug('');
            setLoadError(false);
            return;
        }
        if (!branchId) return;

        let cancelled = false;
        setIsLoading(true);
        setLoadError(false);

        void (async () => {
            try {
                const [printerData, templateData] = await Promise.all([
                    adminApi.getPrinters({ branch_id: branchId, is_active: true, usage_type: 'POS' }),
                    adminApi.getReceiptTemplates({ category: 'POS_RECEIPT' }).catch(() =>
                        adminApi.getReceiptTemplates().then((all) =>
                            all.filter((tpl) => tpl.category === 'POS_RECEIPT'),
                        ),
                    ),
                ]);

                if (cancelled) return;

                const printerList =
                    'results' in printerData
                        ? (printerData.results as Printer[])
                        : (printerData as unknown as Printer[]);

                setPrinters(printerList);
                setTemplates(templateData);

                const first = printerList[0];
                if (first) {
                    setPrinterId(first.id);
                    setTemplateSlug(
                        first.receipt_template_slug || templateData[0]?.slug || '',
                    );
                }
            } catch {
                if (!cancelled) setLoadError(true);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, branchId]);

    const canSubmit = Boolean(printerId && templateSlug && !isLoading && !isSubmitting);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <PrinterIcon size={18} className="text-violet-600" />
                        {t('printDialogTitle')}
                    </DialogTitle>
                    <DialogDescription>{t('printDialogDesc')}</DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : loadError ? (
                    <p className="py-4 text-sm text-rose-600">{t('printDialogLoadError')}</p>
                ) : printers.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">{t('printDialogNoPrinters')}</p>
                ) : (
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {t('printDialogPrinter')}
                            </label>
                            <div className="flex items-center gap-2">
                                <PrinterIcon size={14} className="shrink-0 text-muted-foreground" />
                                <select
                                    value={printerId}
                                    onChange={(e) => {
                                        const nextId = e.target.value;
                                        setPrinterId(nextId);
                                        const nextPrinter = printers.find((p) => p.id === nextId);
                                        if (nextPrinter?.receipt_template_slug) {
                                            setTemplateSlug(nextPrinter.receipt_template_slug);
                                        }
                                    }}
                                    disabled={isSubmitting}
                                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                                >
                                    <option value="">{tPos('printerSelect')}</option>
                                    {printers.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {t('printDialogTemplate')}
                            </label>
                            <div className="flex items-center gap-2">
                                <FileText size={14} className="shrink-0 text-muted-foreground" />
                                <select
                                    value={templateSlug}
                                    onChange={(e) => setTemplateSlug(e.target.value)}
                                    disabled={isSubmitting}
                                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                                >
                                    <option value="">{tPos('templateSelect')}</option>
                                    {templates.map((tpl) => (
                                        <option key={tpl.slug} value={tpl.slug}>
                                            {tpl.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        {t('cancel')}
                    </Button>
                    <Button
                        type="button"
                        disabled={!canSubmit}
                        onClick={() => void onConfirm({ printerId, templateSlug })}
                        className="gap-2 bg-violet-600 hover:bg-violet-700"
                    >
                        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                        {t('printDialogConfirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
