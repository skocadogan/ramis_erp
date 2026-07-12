"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { formatCurrency, formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import { toastApiError } from "@/lib/operationalToast";
import type { PaginatedResponse } from "@/lib/types";
import type { CreditAccount, CreditTransaction } from "../types";
import {
  downloadCreditStatement,
  fetchCreditAccount,
  fetchCreditTransactionsPage,
  saveBlob,
  topupCreditAccount,
} from "../services/creditApi";
import { CreditTransactionsTable } from "./CreditTransactionsTable";

interface CreditAccountDetailModalProps {
  account: CreditAccount;
  onClose: () => void;
  canManage: boolean;
  onUpdated: () => void | Promise<void>;
}

function parseNextPage(next: string | null): number | undefined {
  if (!next) return undefined;
  try {
    const url = new URL(next, "http://local");
    const page = url.searchParams.get("page");
    return page ? parseInt(page, 10) : undefined;
  } catch {
    return undefined;
  }
}

export function CreditAccountDetailModal({
  account,
  onClose,
  canManage,
  onUpdated,
}: CreditAccountDetailModalProps) {
  const t = useTranslations("credit");
  const canViewAmounts = useCanViewAmounts();
  const qc = useQueryClient();
  const [topupAmount, setTopupAmount] = useState("");
  const [topupNotes, setTopupNotes] = useState("");
  const [topupLoading, setTopupLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const { data: saleDetail, isLoading: saleLoading } = useQuery({
    queryKey: ["sale-detail", selectedSaleId],
    queryFn: async () => {
      const { data } = await api.get<Record<string, unknown>>(`/sales/${selectedSaleId}/`);
      return data;
    },
    enabled: !!selectedSaleId,
    staleTime: 60_000,
  });

  const { data: accountLive = account } = useQuery({
    queryKey: ["credit-account", account.id],
    queryFn: () => fetchCreditAccount(account.id),
    initialData: account,
    staleTime: 30_000,
  });

  const {
    data: txPages,
    isLoading: txLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedResponse<CreditTransaction>>({
    queryKey: ["credit-transactions", account.id],
    queryFn: ({ pageParam }) =>
      fetchCreditTransactionsPage(account.id, {
        page: typeof pageParam === "number" ? pageParam : 1,
      }),
    getNextPageParam: (lastPage) => parseNextPage(lastPage.next),
    initialPageParam: 1,
    staleTime: 30_000,
  });

  const transactions = useMemo(
    () => txPages?.pages.flatMap((page) => page.results) ?? [],
    [txPages],
  );

  const refreshCreditData = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["credit-account", account.id] }),
      qc.invalidateQueries({ queryKey: ["credit-transactions", account.id] }),
      qc.invalidateQueries({ queryKey: ["credit-accounts"] }),
    ]);
    await onUpdated();
  };

  const handleTopup = async () => {
    const n = parseFloat(topupAmount);
    if (!Number.isFinite(n) || n <= 0) return;
    setTopupLoading(true);
    try {
      await topupCreditAccount(account.id, {
        amount: n.toFixed(4),
        notes: topupNotes,
        branch: accountLive.branch,
      });
      toast.success(t("toast.topupSuccess"));
      setTopupAmount("");
      setTopupNotes("");
      await refreshCreditData();
    } catch (e) {
      toastApiError(e, t("toast.operationFailed"));
    } finally {
      setTopupLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const blob = await downloadCreditStatement(account.id, "excel");
      saveBlob(blob, `odenmez-${accountLive.full_name}.xlsx`);
    } catch (e) {
      toastApiError(e, t("toast.exportFailed"));
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
        <DialogContent layout="scroll" size="2xl" className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {accountLive.full_name} — {t("page.credit")}
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-background p-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("table.balance")}</p>
                <p className="font-ui-bold tabular-nums">
                  {formatAmount(accountLive.balance, canViewAmounts)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("table.credited")}</p>
                <p className="tabular-nums">
                  {formatAmount(accountLive.total_credited, canViewAmounts)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("table.spent")}</p>
                <p className="tabular-nums">
                  {formatAmount(accountLive.total_spent, canViewAmounts)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <AsyncPdfExportButton
                reportSlug="credit-account-statement"
                params={{ account_id: account.id }}
                filename={`odenmez-${accountLive.full_name}.pdf`}
                size="sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exportingExcel}
                onClick={() => void handleExportExcel()}
              >
                {exportingExcel ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={14} />
                )}
                <span className="ml-1">{t("detail.exportExcel")}</span>
              </Button>
            </div>

            {canManage && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-sm font-ui-semibold">{t("detail.topup")}</p>
                <div className="flex flex-wrap gap-2">
                  <div className="grid min-w-[140px] flex-1 gap-1.5">
                    <Label htmlFor="topup-amount" className="sr-only">
                      {t("detail.topupAmount")}
                    </Label>
                    <Input
                      id="topup-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={t("detail.topupAmount")}
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                    />
                  </div>
                  <div className="grid min-w-[160px] flex-[2] gap-1.5">
                    <Label htmlFor="topup-notes" className="sr-only">
                      {t("detail.topupNotes")}
                    </Label>
                    <Input
                      id="topup-notes"
                      placeholder={t("detail.topupNotes")}
                      value={topupNotes}
                      onChange={(e) => setTopupNotes(e.target.value)}
                    />
                  </div>
                  <Button type="button" size="sm" className="self-end" onClick={() => void handleTopup()} disabled={topupLoading}>
                    {topupLoading && <Loader2 size={14} className="animate-spin" />}
                    {t("detail.confirmTopup")}
                  </Button>
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-ui-semibold">{t("detail.transactions")}</p>
              {txLoading ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              ) : transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("detail.noTransactions")}</p>
              ) : (
                <CreditTransactionsTable
                  transactions={transactions}
                  infiniteControls={{
                    fetchNextPage: () => void fetchNextPage(),
                    hasNextPage: !!hasNextPage,
                    isFetchingNextPage,
                  }}
                  onRowClick={(tx) => { if (tx.sale_id) setSelectedSaleId(tx.sale_id); }}
                />
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("form.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedSaleId} onOpenChange={(next) => { if (!next) setSelectedSaleId(null) }}>
        <DialogContent layout="scroll" size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt size={16} />
              {t("detail.saleDetailTitle")}
            </DialogTitle>
            {saleDetail && (
              <DialogDescription className="font-mono text-xs">
                #{String(saleDetail.order_number ?? "")}
              </DialogDescription>
            )}
          </DialogHeader>

          <DialogBody>
            {saleLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : saleDetail ? (
              <div className="space-y-2 text-sm">
                {[
                  { label: t("detail.saleTotal"), value: saleDetail.total_amount ? formatCurrency(Number(saleDetail.total_amount)) : "—" },
                  { label: t("detail.saleDiscount"), value: saleDetail.discount_amount ? formatCurrency(Number(saleDetail.discount_amount)) : "—" },
                  { label: t("detail.saleTable"), value: String(saleDetail.table_name ?? "—") },
                  { label: t("detail.saleDate"), value: saleDetail.paid_at ? new Date(String(saleDetail.paid_at)).toLocaleString("tr-TR") : "—" },
                  { label: t("detail.saleCreatedBy"), value: String(saleDetail.created_by_name ?? saleDetail.created_by ?? "—") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between border-b border-border pb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-ui-medium">{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("detail.saleNotFound")}</p>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelectedSaleId(null)}>
              {t("form.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
