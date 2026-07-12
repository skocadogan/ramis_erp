'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { NumberInput } from '@/components/ui/number-input';
import type { Table } from '@/features/tables/types/table.types';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/reservationDatetime';
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ReservationEditModalProps {
    table: Table;
    onClose: () => void;
    onSubmit: (payload: {
        reservation_info: string;
        reservation_scheduled_at?: string | null;
        reservation_party_size?: number | null;
    }) => Promise<void>;
    isSubmitting: boolean;
}

export function ReservationEditModal({ table, onClose, onSubmit, isSubmitting }: ReservationEditModalProps) {
    const t = useTranslations('reservations');
    const [info, setInfo] = useState('');
    const [scheduledLocal, setScheduledLocal] = useState('');
    const [partySize, setPartySize] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        setInfo(table.reservation_info ?? '');
        setScheduledLocal(toDatetimeLocalValue(table.reservation_scheduled_at));
        setPartySize(table.reservation_party_size != null ? String(table.reservation_party_size) : '');
        setError('');
    }, [table]);

    const handleSubmit = async () => {
        const text = info.trim();
        if (!text) {
            setError(t('editModal.errorInfoRequired'));
            return;
        }
        setError('');
        const iso = fromDatetimeLocalValue(scheduledLocal);
        let party: number | null = null;
        if (partySize.trim()) {
            const n = Number(partySize);
            if (!n || n < 1) {
                setError(t('editModal.errorPartyInvalid'));
                return;
            }
            party = n;
        }
        await onSubmit({
            reservation_info: text,
            reservation_scheduled_at: iso ?? null,
            reservation_party_size: party,
        });
    };

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent layout="scroll" size="md" className="z-[100]" backdropClassName="z-[100]">
                <DialogHeader>
                    <DialogTitle>{t('editModal.title')}</DialogTitle>
                    <DialogDescription>
                        <span className="font-medium text-foreground">{table.name}</span>
                        {' · '}
                        {table.zone_name}
                    </DialogDescription>
                </DialogHeader>

                <DialogBody className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="edit-res-info">
                            {t('editModal.infoLabel')} <span className="text-destructive">{t('editModal.requiredMark')}</span>
                        </Label>
                        <Textarea
                            id="edit-res-info"
                            value={info}
                            onChange={e => {
                                setInfo(e.target.value);
                                if (error) setError('');
                            }}
                            rows={3}
                            className="min-h-0 resize-none"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-res-time">{t('editModal.scheduledLabel')}</Label>
                        <Input
                            id="edit-res-time"
                            type="datetime-local"
                            value={scheduledLocal}
                            onChange={e => setScheduledLocal(e.target.value)}
                        />
                        <p className="text-sm text-muted-foreground">{t('editModal.scheduledHint')}</p>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit-res-party">{t('editModal.partyLabel')}</Label>
                        <NumberInput
                            id="edit-res-party"
                            min={1}
                            value={partySize}
                            onChange={setPartySize}
                            placeholder={t('editModal.partyPlaceholder')}
                        />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </DialogBody>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                        {t('editModal.cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={isSubmitting}
                    >
                        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                        {isSubmitting ? t('editModal.saving') : t('editModal.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
