import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";

import type { ConfirmCancelState } from './types';

interface CancelConfirmationDialogProps {
    confirmCancel: ConfirmCancelState | null;
    setConfirmCancel: (v: null) => void;
    processCancellation: (reasonCode: string, reasonText: string) => void;
}

const COMMON_REASONS = [
  { code: "MISTAKE", key: "mistake" },
  { code: "CUSTOMER_CANCEL", key: "customerCancel" },
  { code: "OUT_OF_STOCK", key: "outOfStock" },
  { code: "KITCHEN_ERROR", key: "kitchenError" },
  { code: "QUALITY_ISSUE", key: "qualityIssue" },
  { code: "OTHER", key: "other" },
];

export function CancelConfirmationDialog({
    confirmCancel,
    setConfirmCancel,
    processCancellation,
}: CancelConfirmationDialogProps) {
    const t = useTranslations('tables.orderModal.cancelDialog');
    const tForm = useTranslations('tables.form');
    const [reasonCode, setReasonCode] = useState("");
    const [reasonText, setReasonText] = useState("");

    const handleConfirm = () => {
        if (!reasonCode) return;
        processCancellation(reasonCode, reasonText);
        setReasonCode("");
        setReasonText("");
    };

    return (
        <AlertDialog open={!!confirmCancel} onOpenChange={(open) => {
            if (!open) {
                setConfirmCancel(null);
                setReasonCode("");
                setReasonText("");
            }
        }}>
            <AlertDialogContent size="sm">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-rose-600">{t('title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {confirmCancel?.type === 'TABLE_ALL'
                            ? t('confirmAllOrders')
                            : confirmCancel?.type === 'ORDER'
                            ? t('confirmOrder', { name: confirmCancel.name ?? '' })
                            : t('confirmItem', { name: confirmCancel?.name ?? '' })}
                        <br /><br />
                        <span className="font-ui-semibold text-foreground">{t('auditLogNotice')}</span>
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <label className="text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider">{t('reason')}</label>
                        <Select onValueChange={(val) => setReasonCode(val || "")} value={reasonCode}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={t('selectReason')}>
                                    {reasonCode ? t(`reasons.${COMMON_REASONS.find(r => r.code === reasonCode)?.key}`) : t('selectReason')}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {COMMON_REASONS.map((r) => (
                                    <SelectItem key={r.code} value={r.code}>
                                        {t(`reasons.${r.key}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider">{t('description')}</label>
                        <Textarea 
                            placeholder={t('descriptionPlaceholder')} 
                            value={reasonText}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReasonText(e.target.value)}
                            className="min-h-[60px]"
                        />
                    </div>
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel>{tForm('cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleConfirm();
                        }}
                        className="bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
                        disabled={!reasonCode}
                    >
                        {t('submit')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
