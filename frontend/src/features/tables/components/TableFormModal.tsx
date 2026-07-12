'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { NumberInput } from '@/components/ui/number-input';
import { useTranslations } from 'next-intl';
import {
    Table,
    TableCreatePayload,
    TableSize,
    TableShape,
    TableStatus,
    Zone,
    TABLE_STATUS_LABELS,
    TABLE_SIZE_LABELS,
    TABLE_SHAPE_LABELS,
} from '../types/table.types';
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
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const selectClass =
    'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

interface TableFormModalProps {
    table?: Table | null;
    zones: Zone[];
    onClose: () => void;
    onSubmit: (payload: TableCreatePayload) => Promise<void>;
    isSubmitting: boolean;
}

type FormState = {
    name: string;
    table_number: string;
    zone: string;
    capacity: string;
    min_capacity: string;
    size: TableSize;
    shape: TableShape;
    status: TableStatus;
    reservation_info: string;
    reservation_scheduled_local: string;
    reservation_party_size: string;
    notes: string;
    is_active: boolean;
};

const DEFAULT_FORM: FormState = {
    name: '',
    table_number: '1',
    zone: '',
    capacity: '4',
    min_capacity: '1',
    size: 'MEDIUM',
    shape: 'SQUARE',
    status: 'FREE',
    reservation_info: '',
    reservation_scheduled_local: '',
    reservation_party_size: '',
    notes: '',
    is_active: true,
};

/** Dışarıda tanımlı olmalı: içeride tanımlanırsa her render yeni bileşen tipi olur ve input odak kaybeder. */
function FormField({
    label,
    htmlFor,
    required,
    error,
    children,
}: {
    label: string;
    htmlFor?: string;
    required?: boolean;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div className="grid gap-2">
            <Label htmlFor={htmlFor}>
                {label}
                {required && <span className="text-destructive"> *</span>}
            </Label>
            {children}
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}

export function TableFormModal({ table, zones, onClose, onSubmit, isSubmitting }: TableFormModalProps) {
    const t = useTranslations('tables.form');
    const tErrors = useTranslations('tables.errors');
    const tStatus = useTranslations('tables.status');
    const isEdit = Boolean(table);
    const [form, setForm] = useState<FormState>(DEFAULT_FORM);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (table) {
            setForm({
                name: table.name,
                table_number: String(table.table_number),
                zone: table.zone,
                capacity: String(table.capacity),
                min_capacity: String(table.min_capacity),
                size: table.size,
                shape: table.shape,
                status: table.status,
                reservation_info: table.reservation_info ?? '',
                reservation_scheduled_local: toDatetimeLocalValue(table.reservation_scheduled_at),
                reservation_party_size:
                    table.reservation_party_size != null ? String(table.reservation_party_size) : '',
                notes: table.notes ?? '',
                is_active: table.is_active,
            });
        } else {
            setForm({ ...DEFAULT_FORM, zone: zones[0]?.id ?? '' });
        }
        setErrors({});
    }, [table, zones]);

    const isTakeawayZone = zones.find(z => z.id === form.zone)?.is_takeaway ?? false;

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm(prev => ({ ...prev, [key]: value }));
        if (errors[key]) setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
    };

    const validate = (): boolean => {
        const e: Record<string, string> = {};
        if (!form.name.trim()) e.name = tErrors('tableNameRequired');
        if (!form.zone) e.zone = tErrors('zoneRequired');

        if (!isTakeawayZone) {
            const cap = Number(form.capacity);
            const minCap = Number(form.min_capacity);
            if (!cap || cap < 1) e.capacity = tErrors('invalidCapacity');
            if (!minCap || minCap < 1) e.min_capacity = tErrors('invalidMinCapacity');
            if (cap && minCap && minCap > cap) e.min_capacity = tErrors('minCapExceedsMax');
        }

        if (form.status === 'RESERVED' && !form.reservation_info.trim()) {
            e.reservation_info = tErrors('reservationInfoRequired');
        }
        if (form.status === 'RESERVED' && form.reservation_party_size.trim()) {
            const p = Number(form.reservation_party_size);
            if (!p || p < 1) e.reservation_party_size = tErrors('invalidPartySize');
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        const payload: TableCreatePayload = {
            name: form.name.trim(),
            table_number: Number(form.table_number),
            zone: form.zone,
            capacity: isTakeawayZone ? 1 : Number(form.capacity),
            min_capacity: isTakeawayZone ? 1 : Number(form.min_capacity),
            size: isTakeawayZone ? 'MEDIUM' : form.size,
            shape: isTakeawayZone ? 'SQUARE' : form.shape,
            status: isTakeawayZone ? 'FREE' : form.status,
            reservation_info:
                form.status === 'RESERVED' ? (form.reservation_info.trim() || undefined) : undefined,
            reservation_scheduled_at:
                form.status === 'RESERVED'
                    ? (fromDatetimeLocalValue(form.reservation_scheduled_local) ?? null)
                    : undefined,
            reservation_party_size:
                form.status === 'RESERVED'
                    ? form.reservation_party_size.trim()
                        ? Number(form.reservation_party_size)
                        : null
                    : undefined,
            notes: form.notes.trim() || undefined,
            is_active: form.is_active,
        };
        await onSubmit(payload);
    };

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent layout="scroll" size="lg">
                <DialogHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                    <div className="min-w-0 flex-1 pr-2">
                        <DialogTitle>{isEdit ? t('edit') : t('add')}</DialogTitle>
                        <DialogDescription>
                            {isEdit ? t('editDesc', { name: table!.name }) : t('addDesc')}
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <DialogBody className="space-y-4">
                    {errors.general && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {errors.general}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <FormField label={t('tableName')} htmlFor="table-name" required error={errors.name}>
                            <Input
                                id="table-name"
                                value={form.name}
                                onChange={e => set('name', e.target.value)}
                                placeholder={t('tableNamePlaceholder')}
                                className={cn(errors.name && 'border-destructive')}
                            />
                        </FormField>
                        <FormField label={t('tableNumber')} error={errors.table_number}>
                            <NumberInput
                                min={1}
                                value={form.table_number}
                                onChange={val => set('table_number', val)}
                                className={errors.table_number ? 'border-destructive' : ''}
                            />
                        </FormField>
                    </div>

                    <FormField label={t('zone')} required error={errors.zone}>
                        {zones.length === 0 ? (
                            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 dark:bg-amber-900/20 dark:border-amber-700/50">
                                <span className="shrink-0 text-amber-500">⚠</span>
                                <span className="text-xs text-amber-700 dark:text-amber-400">
                                    {t('noZonesError')}
                                </span>
                            </div>
                        ) : (
                            <select
                                value={form.zone}
                                onChange={e => set('zone', e.target.value)}
                                className={cn(selectClass, errors.zone && 'border-destructive')}
                            >
                                <option value="">{t('selectZone')}</option>
                                {zones.map(z => (
                                    <option key={z.id} value={z.id}>{z.name}</option>
                                ))}
                            </select>
                        )}
                    </FormField>

                    {!isTakeawayZone && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label={t('capacity')} required error={errors.capacity}>
                                    <NumberInput
                                        min={1}
                                        value={form.capacity}
                                        onChange={val => set('capacity', val)}
                                        className={errors.capacity ? 'border-destructive' : ''}
                                    />
                                </FormField>
                                <FormField label={t('minCapacity')} error={errors.min_capacity}>
                                    <NumberInput
                                        min={1}
                                        value={form.min_capacity}
                                        onChange={val => set('min_capacity', val)}
                                        className={errors.min_capacity ? 'border-destructive' : ''}
                                    />
                                </FormField>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <FormField label={t('size')}>
                                    <select
                                        value={form.size}
                                        onChange={e => set('size', e.target.value as TableSize)}
                                        className={selectClass}
                                    >
                                        {(Object.keys(TABLE_SIZE_LABELS) as TableSize[]).map(k => (
                                            <option key={k} value={k}>{t(`sizeLabels.${k.toLowerCase()}`)}</option>
                                        ))}
                                    </select>
                                </FormField>
                                <FormField label={t('shape')}>
                                    <select
                                        value={form.shape}
                                        onChange={e => set('shape', e.target.value as TableShape)}
                                        className={selectClass}
                                    >
                                        {(Object.keys(TABLE_SHAPE_LABELS) as TableShape[]).map(k => (
                                            <option key={k} value={k}>{t(`shapeLabels.${k.toLowerCase()}`)}</option>
                                        ))}
                                    </select>
                                </FormField>
                            </div>

                            <FormField label={t('status')}>
                                <div className="grid grid-cols-2 gap-2">
                                    {(Object.keys(TABLE_STATUS_LABELS) as TableStatus[]).map(s => (
                                        <label
                                            key={s}
                                            className={cn(
                                                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors',
                                                form.status === s
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-border hover:border-muted-foreground/40',
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="status"
                                                value={s}
                                                checked={form.status === s}
                                                onChange={() => set('status', s)}
                                                className="accent-primary"
                                            />
                                            <span className="text-sm text-foreground">{tStatus(s.toLowerCase())}</span>
                                        </label>
                                    ))}
                                </div>
                            </FormField>
                        </>
                    )}

                    {form.status === 'RESERVED' && (
                        <FormField label={t('reservationInfo')} required error={errors.reservation_info}>
                            <Textarea
                                value={form.reservation_info}
                                onChange={e => {
                                    set('reservation_info', e.target.value);
                                    if (errors.reservation_info) setErrors(prev => ({ ...prev, reservation_info: '' }));
                                }}
                                rows={2}
                                placeholder={t('reservationInfoPlaceholder')}
                                className={cn('min-h-0 resize-none', errors.reservation_info && 'border-destructive')}
                            />
                        </FormField>
                    )}

                    {form.status === 'RESERVED' && (
                        <>
                            <FormField label={t('reservationTime')}>
                                <Input
                                    type="datetime-local"
                                    value={form.reservation_scheduled_local}
                                    onChange={e => set('reservation_scheduled_local', e.target.value)}
                                />
                            </FormField>
                            <FormField label={t('reservationPartySize')} error={errors.reservation_party_size}>
                                <NumberInput
                                    min={1}
                                    value={form.reservation_party_size}
                                    onChange={val => {
                                        set('reservation_party_size', val);
                                        if (errors.reservation_party_size)
                                            setErrors(prev => ({ ...prev, reservation_party_size: '' }));
                                    }}
                                    className={errors.reservation_party_size ? 'border-destructive' : ''}
                                    placeholder={t('optional')}
                                />
                            </FormField>
                        </>
                    )}

                    <FormField label={t('notes')}>
                        <Textarea
                            value={form.notes}
                            onChange={e => set('notes', e.target.value)}
                            rows={2}
                            placeholder={t('notesPlaceholder')}
                            className="min-h-0 resize-none"
                        />
                    </FormField>

                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="table-is-active"
                            checked={form.is_active}
                            onCheckedChange={checked => set('is_active', checked === true)}
                        />
                        <Label htmlFor="table-is-active" className="cursor-pointer font-normal">
                            {t('isActive')}
                        </Label>
                    </div>
                </DialogBody>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                        {t('cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={isSubmitting}
                    >
                        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                        {isSubmitting ? t('saving') : (isEdit ? t('update') : t('create'))}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
