"use client";

import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { AMOUNT_DISPLAY_MASK, formatCurrency } from "@/lib/formatters";
import { useLocale } from "next-intl";

export interface MiniSparklineProps {
  data: { date: string; value: number }[];
  color: string;
}

export function MiniSparkline({ data, color }: MiniSparklineProps) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((row, i) => ({
    index: i,
    value: typeof row === "object" && row != null && "value" in row
      ? Number((row as { value: number }).value)
      : 0,
  }));

  return (
    <div className="w-full h-12 opacity-25 pointer-events-none overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            strokeWidth={2.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export interface DashboardChartsSectionProps {
  revenueSeries: { date: string; revenue: number }[];
  categoryRows: { category: string; revenue: number }[];
  canViewAmounts: boolean;
}

export function DashboardChartsSection({
  revenueSeries,
  categoryRows,
  canViewAmounts,
}: DashboardChartsSectionProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();

  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-ui-semibold text-foreground">
          {t("charts.revenueCurve")}
        </h2>
        <div className="h-64 min-h-[256px] min-w-0 w-full">
          <ResponsiveContainer width="100%" height={256} debounce={32}>
            <LineChart data={revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip
                formatter={(v) => {
                  const raw = Array.isArray(v) ? v[0] : v;
                  return [
                    canViewAmounts ? formatCurrency(raw ?? 0, locale) : AMOUNT_DISPLAY_MASK,
                    t("charts.tooltipRevenue"),
                  ];
                }}
              />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="min-w-0 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-ui-semibold text-foreground">
          {t("charts.categoryDay")}
        </h2>
        <div className="h-64 min-h-[256px] min-w-0 w-full">
          <ResponsiveContainer width="100%" height={256} debounce={32}>
            <PieChart>
              <Pie
                data={categoryRows}
                dataKey="revenue"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {categoryRows.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(v) => {
                  const raw = Array.isArray(v) ? v[0] : v;
                  return canViewAmounts ? formatCurrency(raw ?? 0, locale) : AMOUNT_DISPLAY_MASK;
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
