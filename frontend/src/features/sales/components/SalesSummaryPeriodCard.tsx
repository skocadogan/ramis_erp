"use client";

import { useState, memo } from "react";
import { useTranslations } from "next-intl";
import { Banknote, ChevronDown, ChevronUp, CreditCard, MoreHorizontal, Tag, TrendingUp } from "lucide-react";
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';

export interface SalesSummaryDiscount {
    /** Verilen indirimlerin toplamı */
    total: number;
    /** İndirim uygulanan satış adedi */
    count: number;
    /** İndirimli satışlarda tahsil edilen toplam (indirim sonrası) */
    sales_revenue: number;
}

export interface SalesSummaryPeriod {
    /** Tahsilat (net); indirim sonrası genel toplam */
    total: number;
    /** Liste / brüt tutar toplamı (tahsilat + indirim) */
    gross_total?: number;
    /** Toplam indirim */
    discount_total?: number;
    count: number;
    breakdown?: Record<string, { total: number; gross: number; count: number }>;
    discount?: SalesSummaryDiscount;
    takeaway?: { total: number; gross: number; count: number };
    table_total?: number;
}

const PAYMENT_ICONS: Record<string, React.ElementType> = {
    CASH: Banknote,
    CARD: CreditCard,
    OTHER: MoreHorizontal,
};

function paymentMethodLabel(method: string, t: (key: string, values?: Record<string, string | number>) => string): string {
    if (method === "CASH") return t("summaryCard.paymentLabels.CASH");
    if (method === "CARD") return t("summaryCard.paymentLabels.CARD");
    if (method === "OTHER") return t("summaryCard.paymentLabels.OTHER");
    return method;
}

const PAYMENT_ROW_STYLES: Record<string, string> = {
    CASH:
        'border-emerald-200 bg-emerald-50/90 dark:border-emerald-800/70 dark:bg-emerald-950/35',
    CARD: 'border-blue-200 bg-blue-50/90 dark:border-blue-800/70 dark:bg-blue-950/35',
    OTHER: 'border-border /90 border-border bg-muted/80',
};

const PAYMENT_ACCENT: Record<string, string> = {
    CASH: 'text-emerald-700 dark:text-emerald-300',
    CARD: 'text-blue-700 dark:text-blue-300',
    OTHER: 'text-foreground',
};

const PAYMENT_AMOUNT_CLASS: Record<string, string> = {
    CASH: 'text-emerald-800 dark:text-emerald-200',
    CARD: 'text-blue-800 dark:text-blue-200',
    OTHER: 'text-foreground',
};

function orderedBreakdownKeys(breakdown: Record<string, { total: number; gross: number; count: number }>): string[] {
    const pref = ['CASH', 'CARD', 'OTHER'];
    const keys = Object.keys(breakdown);
    return [...pref.filter(k => keys.includes(k)), ...keys.filter(k => !pref.includes(k))];
}

export interface SalesSummaryPeriodCardProps {
    label: string;
    data: SalesSummaryPeriod;
    className?: string;
    /** Verilirse kart daralt/genişlet üst bileşenden kontrol edilir */
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
}

function num(n: unknown, fallback = 0): number {
    if (typeof n === 'number' && !Number.isNaN(n)) return n;
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
}

export const SalesSummaryPeriodCard = memo(({
    label,
    data,
    className = '',
    expanded: expandedProp,
    onExpandedChange,
}: SalesSummaryPeriodCardProps) => {
    const t = useTranslations("sales");
    const canViewAmounts = useCanViewAmounts();
    const [internalExpanded, setInternalExpanded] = useState(false);
    const controlled = expandedProp !== undefined && onExpandedChange !== undefined;
    const expanded = controlled ? expandedProp : internalExpanded;
    const setExpanded = (next: boolean) => {
        if (controlled) onExpandedChange(next);
        else setInternalExpanded(next);
    };
    const breakdown = data.breakdown ?? {};
    const hasBreakdown = Object.keys(breakdown).length > 0;
    const net = num(data.total);
    const discountTotal = num(data.discount_total ?? data.discount?.total);
    const gross =
        data.gross_total !== undefined && data.gross_total !== null && String(data.gross_total) !== ''
            ? num(data.gross_total)
            : net + discountTotal;
    const hasDiscount = discountTotal > 0.0001;
    const disc = data.discount;
    const discountCount = disc != null ? num(disc.count) : 0;
    const discountRevenue = disc != null ? num(disc.sales_revenue) : 0;
    const hasDiscountDetail = disc != null && (discountCount > 0 || discountRevenue > 0.0001);


    return (
        <div
            className={`rounded-xl border border-border p-4 shadow-sm bg-card border-border flex flex-col ${className}`}
        >
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-start justify-between gap-2 text-left rounded-lg -m-1 p-1 transition-colors hover:/80 dark:hover:/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                aria-expanded={expanded}
            >
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
                            {label}
                        </span>
                        {!expanded && (
                            <TrendingUp size={14} className="text-muted-foreground shrink-0" />
                        )}
                    </div>
                    {!expanded && (
                        <>
                            <p className="text-base font-bold tabular-nums text-foreground">
                                {formatAmount(net, canViewAmounts)}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {t("summaryCard.transactions", { count: data.count })}
                            </p>
                        </>
                    )}
                </div>
                <span className="shrink-0 text-muted-foreground dark:text-muted-foreground">
                    {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </span>
            </button>

            {expanded && (
                <>
                    <dl className="mb-1 mt-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                            <dt className="font-medium text-muted-foreground">{t("summaryCard.tableGross")}</dt>
                            <dd className="font-semibold tabular-nums text-foreground">
                                {formatAmount(gross - num(data.takeaway?.total), canViewAmounts)}
                            </dd>
                        </div>
                        {data.takeaway && data.takeaway.count > 0 && (
                            <div className="flex items-center justify-between gap-2 text-sm">
                                <dt className="font-medium text-muted-foreground">{t("summaryCard.takeawayGross")}</dt>
                                <dd className="font-semibold tabular-nums text-foreground">
                                    {formatAmount(data.takeaway.total, canViewAmounts)}</dd>
                            </div>
                        )}
                        {hasDiscount && (
                            <div className="flex items-center justify-between gap-2 text-sm">
                                <dt className="font-medium text-amber-700 dark:text-amber-400">{t("summaryCard.discountsAllMethods")}</dt>
                                <dd className="font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                                    {canViewAmounts ? `−${formatCurrency(discountTotal)}` : AMOUNT_DISPLAY_MASK}
                                </dd>
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-2 border-t border-border pt-1 text-sm border-border">
                            <dt className="font-bold text-foreground">{t("summaryCard.netGain")}</dt>
                            <dd className="font-bold tabular-nums text-foreground leading-tight">
                                {formatAmount(net, canViewAmounts)}
                            </dd>
                        </div>
                    </dl>


                </>
            )}

            {expanded && hasDiscountDetail && disc && (
                <div className="mt-3 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 dark:border-amber-800/60 dark:bg-amber-950/35">
                    <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-2">
                        <Tag size={12} className="shrink-0" />
                        {t("summaryCard.discountDetailTitle")}
                    </div>
                    <dl className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-amber-800/90 dark:text-amber-200/85">{t("summaryCard.discountCountLabel")}</dt>
                            <dd className="font-bold tabular-nums text-amber-900 dark:text-amber-100">
                                {t("summaryCard.discountCountUnit", { count: discountCount })}
                            </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-200/70 dark:border-amber-800/50">
                            <dt className="text-amber-800/90 dark:text-amber-200/85">{t("summaryCard.discountedNetLabel")}</dt>
                            <dd className="font-bold tabular-nums text-amber-900 dark:text-amber-100">
                                {formatAmount(discountRevenue, canViewAmounts)}
                            </dd>
                        </div>
                    </dl>
                </div>
            )}

            {expanded && hasBreakdown && (
                <div className="mt-4 pt-3 border-t border-border flex flex-col gap-2 flex-1">
                    <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t("summaryCard.paymentTypesTitle")}{" "}
                        <span className="font-normal normal-case">{t("summaryCard.paymentTypesSubtitle")}</span>
                    </p>
                    <ul className="space-y-2">
                        {orderedBreakdownKeys(breakdown).map((method) => {
                            const Icon = PAYMENT_ICONS[method] ?? MoreHorizontal;
                            const bd = breakdown[method];
                            const paymentName = paymentMethodLabel(method, t);
                            const payCount = num(bd?.count);
                            const netM = num(bd?.total);
                            const grossM = bd?.gross !== undefined ? num(bd.gross) : netM;
                            const rowBg = PAYMENT_ROW_STYLES[method] ?? PAYMENT_ROW_STYLES.OTHER;
                            const labelCls = PAYMENT_ACCENT[method] ?? PAYMENT_ACCENT.OTHER;
                            const amtCls = PAYMENT_AMOUNT_CLASS[method] ?? PAYMENT_AMOUNT_CLASS.OTHER;
                            return (
                                <li
                                    key={method}
                                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 ${rowBg}`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className={`flex size-9 shrink-0 items-center justify-center rounded-md bg-white/80 bg-card/50 ${labelCls}`}
                                        >
                                            <Icon size={18} strokeWidth={2} />
                                        </span>
                                        <div className="min-w-0">
                                            <p className={`text-sm font-bold leading-tight ${labelCls}`}>
                                                {t("summaryCard.paymentAllTypes", { label: paymentName })}
                                            </p>
                                            <p className="text-sub text-muted-foreground">
                                                {t("summaryCard.paymentNetLine", { count: payCount })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className={`text-right shrink-0 ${amtCls}`}>
                                        {grossM > netM + 0.005 && (
                                            <p className="text-xs font-medium text-muted-foreground tabular-nums">
                                                {canViewAmounts
                                                    ? t("summaryCard.grossAmount", { amount: formatCurrency(grossM) })
                                                    : t("summaryCard.grossMasked", { mask: AMOUNT_DISPLAY_MASK })}
                                            </p>
                                        )}
                                        <p className="text-base font-bold tabular-nums tracking-tight">
                                            {formatAmount(netM, canViewAmounts)}
                                        </p>

                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
})
SalesSummaryPeriodCard.displayName = 'SalesSummaryPeriodCard';

export interface SalesSummaryPeriodCardSkeletonProps {
    className?: string;
}

export function SalesSummaryPeriodCardSkeleton({ className = '' }: SalesSummaryPeriodCardSkeletonProps) {
    return (
        <div
            className={`rounded-xl border border-border bg-muted/30 p-4 ${className}`}
        >
            <div className="h-3 w-20 bg-accent rounded mb-3" />
            <div className="h-7 w-28 bg-accent rounded mb-2" />
            <div className="h-3 w-24 bg-muted rounded mb-4" />
            <div className="space-y-2">
                <div className="h-10 bg-muted rounded-lg" />
                <div className="h-10 bg-muted rounded-lg" />
            </div>
        </div>
    );
}
