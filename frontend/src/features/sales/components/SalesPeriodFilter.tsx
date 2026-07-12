'use client';

import {
    PeriodFilter,
    type PeriodFilterProps,
    type PeriodFilterI18n,
    type PeriodPresetId,
} from '@/features/performances/components/PeriodFilter';

export type SalesPeriodPresetId = PeriodPresetId;
export type SalesPeriodFilterI18n = PeriodFilterI18n;
export type SalesPeriodFilterProps = Omit<PeriodFilterProps, 'i18nNamespace'>;

export function SalesPeriodFilter(props: SalesPeriodFilterProps) {
    return <PeriodFilter i18nNamespace="sales" {...props} />;
}
