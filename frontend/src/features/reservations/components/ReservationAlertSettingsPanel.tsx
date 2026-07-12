'use client';

import { useEffect, useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/operationalToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    fetchReservationBranchSettings,
    patchReservationBranchSettings,
} from '@/features/reservations/services/reservationsApi';

interface ReservationAlertSettingsPanelProps {
    branchId: string;
    canManage: boolean;
    open: boolean;
    onClose: () => void;
}

export function ReservationAlertSettingsPanel({
    branchId,
    canManage,
    open,
    onClose,
}: ReservationAlertSettingsPanelProps) {
    const t = useTranslations('reservations');
    const [leadMinutes, setLeadMinutes] = useState(15);
    const [intervalMinutes, setIntervalMinutes] = useState(5);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setDirty(false);
        void fetchReservationBranchSettings(branchId)
            .then((row) => {
                if (cancelled) return;
                setLeadMinutes(row.due_alert_lead_minutes);
                setIntervalMinutes(row.due_alert_interval_minutes);
            })
            .catch((e) => {
                if (!cancelled) toastApiError(e, t('alertSettings.loadFailed'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [branchId, t, open]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const row = await patchReservationBranchSettings({
                branch: branchId,
                due_alert_lead_minutes: leadMinutes,
                due_alert_interval_minutes: intervalMinutes,
            });
            setLeadMinutes(row.due_alert_lead_minutes);
            setIntervalMinutes(row.due_alert_interval_minutes);
            setDirty(false);
            toast.success(t('alertSettings.saveSuccess'));
            onClose();
        } catch (e) {
            toastApiError(e, t('alertSettings.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent layout="scroll" size="md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BellRing className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                        {t('alertSettings.title')}
                    </DialogTitle>
                    <DialogDescription>{t('alertSettings.description')}</DialogDescription>
                </DialogHeader>

                <DialogBody>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="alert-lead">{t('alertSettings.leadLabel')}</Label>
                                <Input
                                    id="alert-lead"
                                    type="number"
                                    min={0}
                                    max={180}
                                    step={1}
                                    value={leadMinutes}
                                    disabled={!canManage}
                                    onChange={(e) => {
                                        setLeadMinutes(Number(e.target.value));
                                        setDirty(true);
                                    }}
                                />
                                <p className="text-2xs text-muted-foreground">{t('alertSettings.leadHint')}</p>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="alert-interval">{t('alertSettings.intervalLabel')}</Label>
                                <Input
                                    id="alert-interval"
                                    type="number"
                                    min={1}
                                    max={60}
                                    step={1}
                                    value={intervalMinutes}
                                    disabled={!canManage}
                                    onChange={(e) => {
                                        setIntervalMinutes(Number(e.target.value));
                                        setDirty(true);
                                    }}
                                />
                                <p className="text-2xs text-muted-foreground">{t('alertSettings.intervalHint')}</p>
                            </div>
                        </div>
                    )}
                </DialogBody>

                {canManage && !loading && (
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            {t('editModal.cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={saving || !dirty}
                        >
                            {saving && <Loader2 size={15} className="animate-spin" />}
                            {saving ? t('alertSettings.saving') : t('alertSettings.save')}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
