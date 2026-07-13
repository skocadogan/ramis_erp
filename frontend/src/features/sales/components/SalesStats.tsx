"use client";

import { useCallback, useState, memo } from "react";
import { useTranslations } from "next-intl";
import {
    SalesSummaryPeriodCard,
    SalesSummaryPeriodCardSkeleton,
    type SalesSummaryDiscount,
    type SalesSummaryPeriod,
} from "./SalesSummaryPeriodCard";

;

interface SalesSummary {
    today: SalesSummaryPeriod;
    this_week: SalesSummaryPeriod;
    last_week: SalesSummaryPeriod;
    this_month: SalesSummaryPeriod;
    last_month: SalesSummaryPeriod;
    last_3_months: SalesSummaryPeriod;
    last_6_months: SalesSummaryPeriod;
    last_9_months: SalesSummaryPeriod;
    this_year: SalesSummaryPeriod;
    all_time: {
        total: number;
        gross_total?: number;
        discount_total?: number;
        count: number;
        breakdown?: SalesSummaryPeriod["breakdown"];
        discount?: SalesSummaryDiscount;
    };
}

interface SalesStatsProps {
    summary: SalesSummary | null;
    isLoading: boolean;
}

const PERIOD_CARD_KEYS = [
    "today",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "last_3_months",
    "last_6_months",
    "last_9_months",
    "this_year",
] as const satisfies readonly (keyof SalesSummary)[];

type PeriodCardKey = (typeof PERIOD_CARD_KEYS)[number];

function emptyExpandedMap(): Record<PeriodCardKey, boolean> {
    return Object.fromEntries(PERIOD_CARD_KEYS.map((k) => [k, false])) as Record<PeriodCardKey, boolean>;
}

const SKELETON_COUNT = 7;

const GRID_CLASS =
    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3";

export const SalesStats = memo(({ summary, isLoading }: SalesStatsProps) => {
    const t = useTranslations("sales");
    const [expandedMap, setExpandedMap] = useState<Record<PeriodCardKey, boolean>>(emptyExpandedMap);

    const allOpen = PERIOD_CARD_KEYS.every((key) => expandedMap[key]);

    const setAllExpanded = useCallback((open: boolean) => {
        setExpandedMap(
            Object.fromEntries(PERIOD_CARD_KEYS.map((k) => [k, open])) as Record<PeriodCardKey, boolean>
        );
    }, []);

    if (isLoading) {
        return (
            <div className={GRID_CLASS}>
                {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                    <SalesSummaryPeriodCardSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (!summary) return null;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 shadow-sm border-border bg-card">
                <span className="text-sm font-medium text-foreground">{t("stats.expandAllLabel")}</span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={allOpen}
                    aria-label={allOpen ? t("stats.expandAllAriaCollapse") : t("stats.expandAllAriaExpand")}
                    onClick={() => setAllExpanded(!allOpen)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
                        allOpen ? "bg-blue-600 dark:bg-blue-500" : "bg-slate-300 bg-accent"
                    }`}
                >
                    <span
                        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full shadow transition-transform dark:bg-slate-100 ${
                            allOpen ? "translate-x-5" : "translate-x-0"
                        }`}
                    />
                </button>
            </div>
            <div className={GRID_CLASS}>
                {PERIOD_CARD_KEYS.map((key) => (
                    <SalesSummaryPeriodCard
                        key={key}
                        label={t(`stats.periods.${key}`)}
                        data={summary[key]}
                        expanded={expandedMap[key]}
                        onExpandedChange={(next) => setExpandedMap((m) => ({ ...m, [key]: next }))}
                    />
                ))}
            </div>
        </div>
    );
});
SalesStats.displayName = "SalesStats";
