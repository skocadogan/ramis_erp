"use client";

import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Info,
  Laptop,
  Receipt,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton";
import { ShiftCashReportDto } from "../types";
import { CashReportTerminalVirtualTable } from "./CashReportTerminalVirtualTable";

interface CashReportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  data: ShiftCashReportDto | null;
  shiftId: string | null;
}

function MetricCard({
  label,
  value,
  subtitle,
  valueClassName,
  icon,
}: {
  label: string;
  value: string;
  subtitle: string;
  valueClassName?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <p className="mb-1 text-2xs font-ui-bold uppercase text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between">
        <span className={cn("text-xl font-ui-bold font-mono", valueClassName ?? "text-foreground")}>
          {value}
        </span>
        {icon}
      </div>
      <p className="mt-1 text-2xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function PaymentRow({
  icon,
  label,
  amount,
}: {
  icon: React.ReactNode;
  label: string;
  amount: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-ui-medium">{label}</span>
      </div>
      <span className="font-ui-bold">{amount}</span>
    </div>
  );
}


export function CashReportDialog({ isOpen, onOpenChange, data, shiftId }: CashReportDialogProps) {
  const t = useTranslations("shifts");
  const locale = useLocale();
  const canViewAmounts = useCanViewAmounts();

  if (!data) return null;

  const fmt = (n: number) => (formatAmount(n, canViewAmounts));
  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "tr" ? "tr-TR" : "en-US");

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[95vh]">
        <DialogHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pr-12">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="rounded-lg bg-primary p-2 text-primary-foreground">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-ui-bold">{t("cashReport.title")}</DialogTitle>
              <DialogDescription className="text-xs font-ui-medium uppercase tracking-wider">
                {t("cashReport.subtitle")}
              </DialogDescription>
            </div>
          </div>
          <AsyncPdfExportButton
            reportSlug="cash-report"
            params={{ shift_id: shiftId ?? "" }}
            filename={`kasa-raporu-${shiftId?.split("-")[0]}.pdf`}
            size="sm"
            className="shrink-0"
          />
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden py-4">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-[2fr_3fr] lg:grid-rows-[minmax(0,1fr)]">
            {/* Sol — özet */}
            <aside className="min-h-0 max-h-[38vh] space-y-4 overflow-y-auto overscroll-contain pr-1 scrollbar-thin lg:max-h-full">
              <div className="space-y-2 rounded-xl border border-border bg-background p-4 text-xs">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <Calendar size={14} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <span className="font-ui-medium">{t("cashReport.openedAt")}: </span>
                    <span className="font-ui-semibold text-foreground">{dateFmt(data.shift.opened_at)}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <Clock size={14} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <span className="font-ui-medium">{t("cashReport.closedAt")}: </span>
                    <span className="font-ui-semibold text-foreground">
                      {data.shift.closed_at
                        ? dateFmt(data.shift.closed_at)
                        : t("cashReport.openStatus")}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <User size={14} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <span className="font-ui-medium">{t("cashReport.cashier")}: </span>
                    <span className="font-ui-semibold text-foreground">
                      {data.shift.opened_by_name || "—"}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <span className="font-ui-medium">{t("cashReport.branch")}: </span>
                    <span className="font-ui-semibold text-foreground">{data.shift.branch_name}</span>
                  </div>
                </div>
              </div>

              <MetricCard
                label={t("cashReport.grossSales")}
                value={fmt(data.totals.gross_sales)}
                subtitle={t("cashReport.salesCount", { count: data.totals.sale_count })}
                icon={<TrendingUp size={18} className="mb-1 text-emerald-500" />}
              />
              <MetricCard
                label={t("cashReport.totalDiscount")}
                value={fmt(data.totals.total_discount)}
                valueClassName="text-rose-600"
                subtitle={`${t("cashReport.netSales")}: ${fmt(data.totals.gross_sales - data.totals.total_discount)}`}
                icon={<TrendingDown size={18} className="mb-1 text-rose-500" />}
              />
              <MetricCard
                label={t("cashReport.totalCancelled")}
                value={fmt(data.totals.total_cancelled)}
                valueClassName="text-amber-600"
                subtitle={t("cashReport.cancelledLabel")}
                icon={<Info size={18} className="mb-1 text-amber-500" />}
              />

              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs font-ui-bold uppercase tracking-widest text-muted-foreground">
                  <Receipt size={14} />
                  {t("cashReport.paymentBreakdown")}
                </h3>
                <div className="divide-y divide-border rounded-xl border border-border bg-background">
                  <PaymentRow
                    icon={
                      <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                        <Wallet size={16} />
                      </div>
                    }
                    label={t("cashReport.paymentCash")}
                    amount={fmt(data.payment_breakdown.CASH ?? 0)}
                  />
                  <PaymentRow
                    icon={
                      <div className="rounded-lg bg-purple-50 p-1.5 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                        <CreditCard size={16} />
                      </div>
                    }
                    label={t("cashReport.paymentCard")}
                    amount={fmt(data.payment_breakdown.CARD ?? 0)}
                  />
                  <PaymentRow
                    icon={
                      <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                        <Info size={16} />
                      </div>
                    }
                    label={t("cashReport.paymentOther")}
                    amount={fmt(data.payment_breakdown.OTHER ?? 0)}
                  />
                </div>
              </div>
            </aside>

            {/* Sağ — cihaz tablosu */}
            <section className="relative flex min-h-[min(420px,42vh)] min-w-0 flex-1 flex-col gap-3 overflow-hidden lg:min-h-0">
              <h3 className="flex shrink-0 items-center gap-2 text-xs font-ui-bold uppercase tracking-widest text-muted-foreground">
                <Laptop size={14} />
                {t("cashReport.terminalBreakdown")}
              </h3>
              <div className="relative min-h-0 flex-1">
                <CashReportTerminalVirtualTable
                  key={shiftId ?? "cash-report"}
                  terminals={data.terminals}
                  canViewAmounts={canViewAmounts}
                />
              </div>
            </section>
          </div>

          <div className="mt-4 shrink-0 border-t border-border pt-2">
            <div className="flex items-center justify-between text-2xs text-muted-foreground">
              <span>
                {t("cashReport.footerShiftId")}: {shiftId?.split("-")[0] || "—"}...
              </span>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {t("cashReport.footerGenerated")}:{" "}
                {new Date().toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-US")}
              </span>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
