'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '@/components/ui/number-input';
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
import type { Table, TableReservePayload } from '../types/table.types';
import { fromDatetimeLocalValue } from '@/lib/reservationDatetime';

interface TableReserveModalProps {
    table: Table;
    onClose: () => void;
    onSubmit: (payload: TableReservePayload) => Promise<void>;
    isSubmitting: boolean;
}

export function TableReserveModal({ table, onClose, onSubmit, isSubmitting }: TableReserveModalProps) {
    const t = useTranslations('tables.reserveModal');
    const tForm = useTranslations('tables.form');
    const tErrors = useTranslations('tables.errors');
    const [info, setInfo] = useState('');
    const [scheduledLocal, setScheduledLocal] = useState('');
    const [partySize, setPartySize] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        setInfo('');
        setScheduledLocal('');
        setPartySize('');
        setError('');
    }, [table.id]);

    const handleSubmit = async () => {
        const infoVal = info.trim();
        if (!infoVal) {
            setError(tErrors('reservationInfoRequired'));
            return;
        }
        let party: number | null = null;
        if (partySize.trim()) {
            const n = Number(partySize);
            if (!n || n < 1) {
                setError(tErrors('invalidPartySize'));
                return;
            }
            party = n;
        }
        setError('');
        const scheduledIso = fromDatetimeLocalValue(scheduledLocal);
        await onSubmit({
            reservation_info: infoVal,
            reservation_scheduled_at: scheduledIso ?? null,
            reservation_party_size: party,
        });
    };

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent layout="scroll" size="md" className="z-[120]" backdropClassName="z-[120]">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>
                        <span className="font-medium text-foreground">{table.name}</span>
                        {' · '}
                        {table.zone_name}
                    </DialogDescription>
                </DialogHeader>

                <DialogBody className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reserve-info">
                            {tForm('reservationInfo')} <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                            id="reserve-info"
                            value={info}
                            onChange={e => {
                                setInfo(e.target.value);
                                if (error) setError('');
                            }}
                            rows={3}
                            placeholder={tForm('reservationInfoPlaceholder')}
                            autoFocus
                            className="min-h-0 resize-none"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="reserve-time">{tForm('reservationTime')}</Label>
                        <Input
                            id="reserve-time"
                            type="datetime-local"
                            value={scheduledLocal}
                            onChange={e => setScheduledLocal(e.target.value)}
                        />
                        <p className="text-sm text-muted-foreground">{t('timeHint')}</p>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="reserve-party">{tForm('reservationPartySize')}</Label>
                        <NumberInput
                            id="reserve-party"
                            min={1}
                            value={partySize}
                            onChange={setPartySize}
                            placeholder={tForm('optional')}
                        />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <p className="text-sm text-muted-foreground">{t('helpHint')}</p>
                </DialogBody>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                        {tForm('cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={isSubmitting}
                        className="bg-amber-600 text-white hover:bg-amber-700"
                    >
                        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                        {isSubmitting ? tForm('saving') : t('submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
