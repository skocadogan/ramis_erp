'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api, { skipInterceptorToast } from '@/lib/api';
import { toastApiError, toastApiSuccess } from '@/lib/operationalToast';
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

interface TableSettingsPanelProps {
    branchId: string | undefined;
    canManage: boolean;
    open: boolean;
    onClose: () => void;
}

export function TableSettingsPanel({ branchId, canManage, open, onClose }: TableSettingsPanelProps) {
    const t = useTranslations('tables.settings');
    const queryClient = useQueryClient();
    const [minutes, setMinutes] = useState('5');

    const { data: branch, isLoading } = useQuery({
        queryKey: ['branch', branchId, 'table-settings'],
        queryFn: async () => {
            const { data } = await api.get<{ id: string; table_cleaning_duration_minutes?: number }>(
                `/branches/${branchId}/`,
            );
            return data;
        },
        enabled: Boolean(branchId) && canManage && open,
    });

    useEffect(() => {
        if (branch?.table_cleaning_duration_minutes != null) {
            setMinutes(String(branch.table_cleaning_duration_minutes));
        }
    }, [branch?.table_cleaning_duration_minutes]);

    const saveMutation = useMutation({
        mutationFn: async (value: number) => {
            const { data } = await api.patch(
                `/branches/${branchId}/`,
                { table_cleaning_duration_minutes: value },
                { ...skipInterceptorToast },
            );
            return data;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['branch', branchId] });
            toastApiSuccess(t('saved'));
            onClose();
        },
        onError: (e) => toastApiError(e, t('saveError')),
    });

    if (!canManage || !branchId) return null;

    const parsed = Number.parseInt(minutes, 10);
    const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 60;

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent layout="scroll" size="md">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                <DialogBody>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            <Label htmlFor="cleaning-minutes">{t('cleaningDuration')}</Label>
                            <Input
                                id="cleaning-minutes"
                                type="number"
                                min={1}
                                max={60}
                                value={minutes}
                                onChange={(e) => setMinutes(e.target.value)}
                            />
                        </div>
                    )}
                </DialogBody>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button
                        type="button"
                        disabled={!valid || isLoading || saveMutation.isPending}
                        onClick={() => saveMutation.mutate(parsed)}
                    >
                        {saveMutation.isPending && <Loader2 className="animate-spin" size={15} />}
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
