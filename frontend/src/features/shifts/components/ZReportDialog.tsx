"use client";

import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShiftZReportDto } from "../types";
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton";
import {
  FileBarChart,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Receipt,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  Info,
} from "lucide-react";

interface ZReportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  data: ShiftZReportDto | null;
  shiftId: string | null;
}

export function ZReportDialog({ isOpen, onOpenChange, data, shiftId }: ZReportDialogProps) {
  const t = useTranslations("shifts");
  const locale = useLocale();
  const canViewAmounts = useCanViewAmounts();

  if (!data) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[95vh]">
        <DialogHeader className="flex flex-row items-center justify-between gap-3 pr-12">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-primary p-2 text-primary-foreground">
              <FileBarChart size={20} />
            </div>
            <div>
              <DialogTitle className="text-lg font-ui-bold">{t("zReport.title")}</DialogTitle>
              <p className="text-xs font-ui-medium uppercase tracking-wider text-muted-foreground">
                {t("zReport.subtitle")}
              </p>
            </div>
          </div>

          <AsyncPdfExportButton
            reportSlug="z-report"
            params={{ shift_id: shiftId ?? "" }}
            filename={`${t("zReport.downloadNamePrefix")}-${shiftId?.split("-")[0]}.pdf`}
            size="sm"
            className="shrink-0"
          />
        </DialogHeader>

        <DialogBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* --- Sütun 1: Özet Kartları + Ödeme Kırılımı --- */}
            <div className="space-y-6">
              {/* --- Özet Kartları --- */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                  <p className="text-2xs uppercase font-ui-bold text-muted-foreground mb-1">{t("zReport.totalSales")}</p>
                  <div className="flex items-end justify-between">
                    <span className="text-xl font-ui-bold text-foreground font-mono">
                      {formatAmount(data.totals.gross_sales, canViewAmounts)}
                    </span>
                    <TrendingUp size={18} className="text-emerald-500 mb-1" />
                  </div>
                  <p className="text-2xs text-muted-foreground mt-1">
                    {t("zReport.transactions", { count: data.totals.sale_count })}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                  <p className="text-2xs uppercase font-ui-bold text-muted-foreground mb-1">{t("zReport.expensesOut")}</p>
                  <div className="flex items-end justify-between">
                    <span className="text-xl font-ui-bold text-foreground font-mono">
                      {formatAmount(data.expenses_total, canViewAmounts)}
                    </span>
                    <TrendingDown size={18} className="text-rose-500 mb-1" />
                  </div>
                  <p className="text-2xs text-muted-foreground mt-1">
                    {t("zReport.expenseLines", { count: data.expenses.length })}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                  <p className="text-2xs uppercase font-ui-bold text-muted-foreground mb-1">{t("zReport.cashNet")}</p>
                  <div className="flex items-end justify-between">
                    <span className={cn(
                      "text-xl font-ui-bold font-mono",
                      data.cash_movements_net >= 0 ? "text-foreground" : "text-rose-600"
                    )}>
                      {data.cash_movements_net >= 0 ? "+" : ""}
                      {formatAmount(data.cash_movements_net, canViewAmounts)}
                    </span>
                    <Wallet size={18} className="text-muted-foreground mb-1" />
                  </div>
                  <p className="text-2xs text-muted-foreground mt-1">{t("zReport.cashInOutLabel")}</p>
                </div>

                <div className="rounded-xl border border-orange-200 bg-background p-4 shadow-sm dark:border-orange-900/30">
                  <p className="text-2xs uppercase font-ui-bold text-orange-600 dark:text-orange-400 mb-1">{t("zReport.creditLabel")}</p>
                  <div className="flex items-end justify-between">
                    <span className="text-xl font-ui-bold text-orange-600 dark:text-orange-400 font-mono">
                      {formatAmount(data.payment_breakdown.CREDIT ?? 0, canViewAmounts)}
                    </span>
                    <CreditCard size={18} className="text-orange-400 mb-1" />
                  </div>
                  <p className="text-2xs text-muted-foreground mt-1">{t("zReport.creditSubLabel")}</p>
                </div>
              </div>

              {/* --- Kasa Nakit Toplamı --- */}
              <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                <p className="text-2xs uppercase font-ui-bold text-muted-foreground mb-1">{t("zReport.cashRegisterTotal")}</p>
                <div className="flex items-end justify-between">
                  <span className={cn(
                    "text-xl font-ui-bold font-mono",
                    (data.cash_movements_net + (data.payment_breakdown.CASH ?? 0) - data.expenses_total) >= 0
                      ? "text-foreground"
                      : "text-rose-600"
                  )}>
                    {formatAmount(
                      data.cash_movements_net + (data.payment_breakdown.CASH ?? 0) - data.expenses_total,
                      canViewAmounts,
                    )}
                  </span>
                  <Wallet size={18} className="text-amber-500 mb-1" />
                </div>
                <p className="text-2xs text-muted-foreground mt-1">
                  {t("zReport.cashInOutLabel")} + {t("zReport.cashCash")} - {t("zReport.expensesOut")}
                </p>
              </div>

              {/* --- Ödeme Kırılımı --- */}
              <div className="space-y-3">
                <h3 className="text-xs font-ui-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Receipt size={14} /> {t("zReport.paymentTypes")}
                </h3>
                <div className="divide-y divide-border rounded-xl border border-border bg-background">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 text-blue-600 p-1.5 rounded-lg dark:bg-blue-900/20 dark:text-blue-400">
                        <Wallet size={16} />
                      </div>
                      <span className="text-sm font-ui-medium">{t("zReport.cashCash")}</span>
                    </div>
                    <span className="font-ui-bold">{formatAmount(data.payment_breakdown.CASH ?? 0, canViewAmounts)}</span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-50 text-purple-600 p-1.5 rounded-lg dark:bg-purple-900/20 dark:text-purple-400">
                        <CreditCard size={16} />
                      </div>
                      <span className="text-sm font-ui-medium">{t("zReport.cardCard")}</span>
                    </div>
                    <span className="font-ui-bold">{formatAmount(data.payment_breakdown.CARD ?? 0, canViewAmounts)}</span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-50 text-amber-600 p-1.5 rounded-lg dark:bg-amber-900/20 dark:text-amber-400">
                        <Info size={16} />
                      </div>
                      <span className="text-sm font-ui-medium">{t("zReport.otherPayments")}</span>
                    </div>
                    <span className="font-ui-bold">{formatAmount(data.payment_breakdown.OTHER ?? 0, canViewAmounts)}</span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-50 text-orange-600 p-1.5 rounded-lg dark:bg-orange-900/20 dark:text-orange-400">
                        <CreditCard size={16} />
                      </div>
                      <span className="text-sm font-ui-medium">{t("zReport.creditLabel")}</span>
                    </div>
                    <span className="font-ui-bold text-orange-600 dark:text-orange-400">{formatAmount(data.payment_breakdown.CREDIT ?? 0, canViewAmounts)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* --- Sütun 2: Vardiya Giderleri (Tablo) --- */}
            <div className="space-y-2">
              <h3 className="text-xs font-ui-bold text-muted-foreground uppercase tracking-widest">{t("zReport.shiftExpenses")}</h3>
              <div className="overflow-hidden rounded-xl border border-border bg-background">
                {data.expenses.length > 0 ? (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-background">
                        <th className="px-3 py-2 text-muted-foreground font-ui-medium">{t("zReport.expenseDescription")}</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-ui-medium">{t("zReport.expenseAmount")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.expenses.map((exp) => (
                        <tr key={exp.id}>
                          <td className="px-3 py-2 text-muted-foreground">{exp.description}</td>
                          <td className="px-3 py-2 text-right font-ui-bold text-rose-600 font-mono">{formatAmount(Number(exp.amount), canViewAmounts)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-3 text-2xs text-muted-foreground text-center italic">{t("zReport.noExpenses")}</p>
                )}
              </div>
            </div>

            {/* --- Sütun 3: Kasa Giriş Çıkış (Tablo) --- */}
            <div className="space-y-2">
              <h3 className="text-xs font-ui-bold text-muted-foreground uppercase tracking-widest">{t("zReport.cashMovements")}</h3>
              <div className="overflow-hidden rounded-xl border border-border bg-background">
                {data.cash_movements.length > 0 ? (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-background">
                        <th className="px-3 py-2 text-muted-foreground font-ui-medium">{t("zReport.movementDescription")}</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-ui-medium">{t("zReport.movementAmount")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.cash_movements.map((mov) => (
                        <tr key={mov.id}>
                          <td className="px-3 py-2 flex items-center gap-1.5">
                            {mov.movement_type === "IN" ? (
                              <ArrowUpCircle size={12} className="text-emerald-500 shrink-0" />
                            ) : (
                              <ArrowDownCircle size={12} className="text-rose-500 shrink-0" />
                            )}
                            <span className="truncate">
                              {mov.description || t("zReport.movementDefault")}
                            </span>
                          </td>
                          <td className={cn(
                            "px-3 py-2 text-right font-ui-bold font-mono whitespace-nowrap",
                            mov.movement_type === "IN" ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {mov.movement_type === "IN" ? "+" : "-"}
                            {formatAmount(Number(mov.amount), canViewAmounts)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-3 text-2xs text-muted-foreground text-center italic">{t("zReport.noCashMovements")}</p>
                )}
              </div>
            </div>
          </div>

          {/* --- Dip Not --- */}
          <div className="border-t border-border pt-2">
            <div className="flex items-center justify-between text-2xs text-muted-foreground">
              <span>
                {t("zReport.footerShiftId")} {shiftId?.split("-")[0] || t("page.dash")}...
              </span>
              <span className="flex items-center gap-1">
                <Clock size={10} /> {t("zReport.footerGenerated")}{" "}
                {new Date().toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-US")}
              </span>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
