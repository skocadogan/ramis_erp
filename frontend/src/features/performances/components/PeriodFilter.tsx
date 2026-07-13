'use client';

import React, { useMemo } from 'react';
import { CalendarRange } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
    getRangeForPeriodPreset,
    type PeriodPresetId,
    type PeriodDateRange,
} from '@/features/performances/utils/periodFilter';

export type { PeriodPresetId, PeriodDateRange };
export { getRangeForPeriodPreset };

export type PeriodFilterVariant = 'buttons' | 'list';

export type PeriodFilterI18n = {
    periodLabel: string;
    selectPlaceholder: string;
    groupAriaLabel: string;
    selectAriaLabel: string;
    presets: Record<PeriodPresetId, string>;
};

const PRESET_IDS: PeriodPresetId[] = [
    'today',
    'this_week',
    'last_week',
    'this_month',
    'last_month',
    'last_3_months',
    'last_6_months',
    'last_9_months',
    'this_year',
    'custom',
];

function periodFilterDefaults(t: (key: string) => string): PeriodFilterI18n {
    return {
        periodLabel: t('periodFilter.label'),
        selectPlaceholder: t('periodFilter.selectPlaceholder'),
        groupAriaLabel: t('periodFilter.groupAriaLabel'),
        selectAriaLabel: t('periodFilter.selectAriaLabel'),
        presets: {
            today: t('presets.today'),
            this_week: t('presets.this_week'),
            last_week: t('presets.last_week'),
            this_month: t('presets.this_month'),
            last_month: t('presets.last_month'),
            last_3_months: t('presets.last_3_months'),
            last_6_months: t('presets.last_6_months'),
            last_9_months: t('presets.last_9_months'),
            this_year: t('presets.this_year'),
            custom: t('presets.custom'),
        },
    };
}

function getPresetRows(resolved: PeriodFilterI18n) {
    return PRESET_IDS.map((id) => ({
        id,
        label: resolved.presets[id],
    }));
}

const PRESET_BUTTON_THEME: Record<
    PeriodPresetId,
    { active: string; idle: string; ring: string }
> = {
    today: {
        active: 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/30',
        idle: 'border-emerald-200/90 text-emerald-800 bg-emerald-50/90 hover:bg-emerald-100 hover:border-emerald-300 dark:border-emerald-700/80 dark:text-emerald-100 dark:bg-emerald-950/45 dark:hover:bg-emerald-900/55 dark:hover:border-emerald-600',
        ring: 'focus-visible:ring-emerald-500/40',
    },
    this_week: {
        active: 'bg-cyan-600 border-cyan-600 text-white shadow-md shadow-cyan-600/30',
        idle: 'border-cyan-200/90 text-cyan-900 bg-cyan-50/90 hover:bg-cyan-100 hover:border-cyan-300 dark:border-cyan-700/80 dark:text-cyan-100 dark:bg-cyan-950/45 dark:hover:bg-cyan-900/55 dark:hover:border-cyan-600',
        ring: 'focus-visible:ring-cyan-500/40',
    },
    last_week: {
        active: 'bg-teal-600 border-teal-600 text-white shadow-md shadow-teal-600/30',
        idle: 'border-teal-200/90 text-teal-900 bg-teal-50/90 hover:bg-teal-100 hover:border-teal-300 dark:border-teal-700/80 dark:text-teal-100 dark:bg-teal-950/45 dark:hover:bg-teal-900/55 dark:hover:border-teal-600',
        ring: 'focus-visible:ring-teal-500/40',
    },
    this_month: {
        active: 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/30',
        idle: 'border-blue-200/90 text-blue-900 bg-blue-50/90 hover:bg-blue-100 hover:border-blue-300 dark:border-blue-700/80 dark:text-blue-100 dark:bg-blue-950/45 dark:hover:bg-blue-900/55 dark:hover:border-blue-600',
        ring: 'focus-visible:ring-blue-500/40',
    },
    last_month: {
        active: 'bg-sky-600 border-sky-600 text-white shadow-md shadow-sky-600/30',
        idle: 'border-sky-200/90 text-sky-900 bg-sky-50/90 hover:bg-sky-100 hover:border-sky-300 dark:border-sky-700/80 dark:text-sky-100 dark:bg-sky-950/45 dark:hover:bg-sky-900/55 dark:hover:border-sky-600',
        ring: 'focus-visible:ring-sky-500/40',
    },
    last_3_months: {
        active: 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/30',
        idle: 'border-indigo-200/90 text-indigo-900 bg-indigo-50/90 hover:bg-indigo-100 hover:border-indigo-300 dark:border-indigo-700/80 dark:text-indigo-100 dark:bg-indigo-950/45 dark:hover:bg-indigo-900/55 dark:hover:border-indigo-600',
        ring: 'focus-visible:ring-indigo-500/40',
    },
    last_6_months: {
        active: 'bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-600/30',
        idle: 'border-violet-200/90 text-violet-900 bg-violet-50/90 hover:bg-violet-100 hover:border-violet-300 dark:border-violet-700/80 dark:text-violet-100 dark:bg-violet-950/45 dark:hover:bg-violet-900/55 dark:hover:border-violet-600',
        ring: 'focus-visible:ring-violet-500/40',
    },
    last_9_months: {
        active: 'bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-600/30',
        idle: 'border-rose-200/90 text-rose-900 bg-rose-50/90 hover:bg-rose-100 hover:border-rose-300 dark:border-rose-700/80 dark:text-rose-100 dark:bg-rose-950/45 dark:hover:bg-rose-900/55 dark:hover:border-rose-600',
        ring: 'focus-visible:ring-rose-500/40',
    },
    this_year: {
        active: 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/30',
        idle: 'border-amber-200/90 text-amber-900 bg-amber-50/90 hover:bg-amber-100 hover:border-amber-300 dark:border-amber-700/80 dark:text-amber-100 dark:bg-amber-950/45 dark:hover:bg-amber-900/55 dark:hover:border-amber-600',
        ring: 'focus-visible:ring-amber-500/40',
    },
    custom: {
        active: '  text-white shadow-md shadow-slate-700/30   ',
        idle: '  hover: hover: border-input text-muted-foreground bg-card dark:hover: dark:hover:',
        ring: 'focus-visible:ring-slate-500/40',
    },
};

export interface PeriodFilterProps {
    activePreset: PeriodPresetId | null;
    onSelect: (preset: PeriodPresetId, range: PeriodDateRange) => void;
    variant?: PeriodFilterVariant;
    className?: string;
    disabled?: boolean;
    i18n?: PeriodFilterI18n;
    /** Varsayılan: performances */
    i18nNamespace?: 'performances' | 'sales';
}

export function PeriodFilter({
    activePreset,
    onSelect,
    variant = 'buttons',
    className = '',
    disabled = false,
    i18n,
    i18nNamespace = 'performances',
}: PeriodFilterProps) {
    const t = useTranslations(i18nNamespace);
    const resolvedI18n = useMemo(
        () => i18n ?? periodFilterDefaults(t),
        [i18n, t],
    );
    const presetRows = getPresetRows(resolvedI18n);

    if (variant === 'list') {
        return (
            <div className={`flex flex-wrap items-center gap-2 ${className}`}>
                <span className="flex items-center gap-1.5 text-muted-foreground text-ui font-medium shrink-0">
                    <CalendarRange size={16} aria-hidden />
                    {resolvedI18n.periodLabel}
                </span>
                <select
                    aria-label={resolvedI18n.selectAriaLabel}
                    disabled={disabled}
                    value={activePreset ?? ''}
                    onChange={e => {
                        const v = e.target.value as PeriodPresetId | '';
                        if (!v) return;
                        onSelect(v, getRangeForPeriodPreset(v));
                    }}
                    className="min-w-[10.5rem] rounded-md border border-border py-1.5 pr-8 pl-2.5 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50 border-input bg-muted text-foreground dark:focus:border-blue-400 dark:focus:ring-blue-400/25"
                >
                    <option value="">{resolvedI18n.selectPlaceholder}</option>
                    {presetRows.map(({ id, label }) => (
                        <option key={id} value={id}>
                            {label}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    return (
        <div
            className={`flex flex-wrap items-center gap-1.5 ${className}`}
            role="group"
            aria-label={resolvedI18n.groupAriaLabel}
        >
            <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground shrink-0 mr-0.5">
                <CalendarRange size={12} aria-hidden />
                {resolvedI18n.periodLabel}
            </span>
            {presetRows.map(({ id, label }) => {
                const isActive = activePreset === id;
                const theme = PRESET_BUTTON_THEME[id];
                return (
                    <button
                        key={id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelect(id, getRangeForPeriodPreset(id))}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900
 ${theme.ring}
 ${isActive ? theme.active : theme.idle}
 ${isActive ? 'ring-2 ring-offset-1 ring-slate-900/15 dark:ring-white/25' : ''}
 disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
