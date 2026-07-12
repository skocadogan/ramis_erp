'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Branch } from '@/types/user.types';
import type { Zone, ZoneCreatePayload, ZoneUpdatePayload } from '../types/table.types';
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const selectClass =
    'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const PREDEFINED_COLORS = [
    { name: 'Slate', hex: '#94a3b8' },
    { name: 'Blue', hex: '#3b82f6' },
    { name: 'Emerald', hex: '#10b981' },
    { name: 'Rose', hex: '#f43f5e' },
    { name: 'Amber', hex: '#f59e0b' },
    { name: 'Indigo', hex: '#6366f1' },
    { name: 'Violet', hex: '#8b5cf6' },
    { name: 'Orange', hex: '#f97316' },
];

interface ZoneFormModalProps {
    zone?: Zone | null;
    branches: Branch[];
    defaultBranchId: string;
    canPickBranch: boolean;
    onClose: () => void;
    onCreate: (payload: ZoneCreatePayload) => Promise<void>;
    onUpdate: (id: string, payload: ZoneUpdatePayload) => Promise<void>;
    isSubmitting: boolean;
}

function ToggleSwitch({
    checked,
    onChange,
    activeClassName,
}: {
    checked: boolean;
    onChange: () => void;
    activeClassName?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            className={cn(
                'relative h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40',
                checked ? (activeClassName ?? 'bg-primary') : 'bg-muted-foreground/30'
            )}
        >
            <span
                className={cn(
                    'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform',
                    checked ? 'translate-x-4' : 'translate-x-0'
                )}
            />
        </button>
    );
}

export function ZoneFormModal({
    zone,
    branches,
    defaultBranchId,
    canPickBranch,
    onClose,
    onCreate,
    onUpdate,
    isSubmitting,
}: ZoneFormModalProps) {
    const t = useTranslations('tables.zones');
    const tForm = useTranslations('tables.form');
    const isEdit = Boolean(zone);
    const [branch, setBranch] = useState(defaultBranchId);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [isTakeaway, setIsTakeaway] = useState(false);
    const [color, setColor] = useState(PREDEFINED_COLORS[0].hex);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (zone) {
            setBranch(zone.branch);
            setName(zone.name);
            setDescription(zone.description ?? '');
            setIsActive(zone.is_active);
            setIsTakeaway(zone.is_takeaway);
            setColor(zone.color || PREDEFINED_COLORS[0].hex);
        } else {
            setBranch(defaultBranchId);
            setName('');
            setDescription('');
            setIsActive(true);
            setIsTakeaway(false);
            setColor(PREDEFINED_COLORS[0].hex);
        }
        setErrors({});
    }, [zone, defaultBranchId]);

    const validate = (): boolean => {
        const e: Record<string, string> = {};
        if (!name.trim()) e.name = t('errors.nameRequired');
        if (!branch) e.branch = t('errors.branchRequired');
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        if (zone) {
            await onUpdate(zone.id, {
                name: name.trim(),
                description: description.trim() || null,
                is_active: isActive,
                is_takeaway: isTakeaway,
                color: color,
            });
        } else {
            await onCreate({
                branch,
                name: name.trim(),
                description: description.trim() || undefined,
                color: color,
                is_takeaway: isTakeaway,
            });
        }
    };

    const branchLabel = branches.find(b => b.id === branch)?.name ?? '—';

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent
                layout="scroll"
                size="md"
                className="z-[110]"
                backdropClassName="z-[110]"
            >
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('edit') : t('add')}</DialogTitle>
                </DialogHeader>

                <DialogBody className="space-y-4">
                    {isEdit ? (
                        <div className="grid gap-2">
                            <Label>{t('branch')}</Label>
                            <p className="text-sm text-muted-foreground">{branchLabel}</p>
                        </div>
                    ) : canPickBranch && branches.length > 0 ? (
                        <div className="grid gap-2">
                            <Label htmlFor="zone-branch">{t('branch')}</Label>
                            <select
                                id="zone-branch"
                                value={branch}
                                onChange={e => {
                                    setBranch(e.target.value);
                                    if (errors.branch) setErrors(prev => ({ ...prev, branch: '' }));
                                }}
                                className={cn(selectClass, errors.branch && 'border-destructive')}
                            >
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                            {errors.branch && <p className="text-xs text-destructive">{errors.branch}</p>}
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            <Label>{t('branch')}</Label>
                            <p className="text-sm text-muted-foreground">{branchLabel}</p>
                        </div>
                    )}

                    <div className="grid gap-2">
                        <Label htmlFor="zone-name">{t('zoneName')}</Label>
                        <Input
                            id="zone-name"
                            value={name}
                            onChange={e => {
                                setName(e.target.value);
                                if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
                            }}
                            className={cn(errors.name && 'border-destructive')}
                            placeholder={t('zoneNamePlaceholder')}
                        />
                        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="zone-desc">{t('description')}</Label>
                        <Textarea
                            id="zone-desc"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={3}
                            placeholder={t('descriptionPlaceholder')}
                            className="min-h-0 resize-none"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>{t('zoneColor')}</Label>
                        <div className="mt-1 flex flex-wrap gap-2">
                            {PREDEFINED_COLORS.map(c => (
                                <button
                                    key={c.hex}
                                    type="button"
                                    onClick={() => setColor(c.hex)}
                                    className={cn(
                                        'h-8 w-8 rounded-full border-2 transition-all hover:scale-105',
                                        color === c.hex
                                            ? 'scale-110 border-primary ring-2 ring-primary/30 shadow-sm'
                                            : 'border-border hover:border-muted-foreground/50'
                                    )}
                                    style={{ backgroundColor: c.hex }}
                                    title={c.name}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        {isEdit && (
                            <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
                                <span className="text-sm font-medium">{t('activateZone')}</span>
                                <ToggleSwitch checked={isActive} onChange={() => setIsActive(v => !v)} />
                            </div>
                        )}

                        <div className="flex items-center justify-between rounded-lg border border-emerald-200/50 bg-emerald-50/30 p-2.5 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                    {t('isTakeaway')}
                                </span>
                                <span className="text-sub text-emerald-600/70 dark:text-emerald-500/70">
                                    {t('isTakeawayDesc')}
                                </span>
                            </div>
                            <ToggleSwitch
                                checked={isTakeaway}
                                onChange={() => setIsTakeaway(v => !v)}
                                activeClassName="bg-emerald-600 dark:bg-emerald-500"
                            />
                        </div>
                    </div>
                </DialogBody>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                        {tForm('cancel')}
                    </Button>
                    <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                        {isEdit ? tForm('save') : tForm('create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
