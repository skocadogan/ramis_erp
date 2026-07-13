"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shell/AppShell";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useBranchContext } from "@/hooks/useBranchContext";
import { fetchInvoices } from "@/features/invoices/services/invoicesApi";
import { formatDate, formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import { useDebounce } from "@/hooks/useDebounce";
import { Loader2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table";
import { pageFromDrfNext } from "@/lib/pagination";

const INVOICE_PAGE_SIZE = 50;

type PdfFilter = "all" | "yes" | "no";

export default function InvoicesPage() {
  return (
    <AuthGuard module="invoices">
      <AppShell>
        <InvoicesPageContent />
      </AppShell>
    </AuthGuard>
  );
}

function InvoicesPageContent() {
  const t = useTranslations("invoices");
  const canViewAmounts = useCanViewAmounts();
  const { effectiveBranchId, branchName, showBranchPicker, branchList, setBranchOverride } =
    useBranchContext({ queryKey: "invoices-bc" });

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterHasPdf, setFilterHasPdf] = useState<PdfFilter>("all");
  const [filterSearchRaw, setFilterSearchRaw] = useState("");
  const debouncedSearch = useDebounce(filterSearchRaw.trim(), 400);

  useEffect(() => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterHasPdf("all");
    setFilterSearchRaw("");
  }, [effectiveBranchId]);

  const listQuery = useInfiniteQuery({
    queryKey: [
      "invoices",
      "infinite",
      effectiveBranchId,
      filterDateFrom,
      filterDateTo,
      filterHasPdf,
      debouncedSearch,
    ],
    queryFn: ({ pageParam = 1 }) =>
      fetchInvoices({
        branch_id: effectiveBranchId || undefined,
        page: pageParam as number,
        page_size: INVOICE_PAGE_SIZE,
        ...(filterDateFrom ? { date_from: filterDateFrom } : {}),
        ...(filterDateTo ? { date_to: filterDateTo } : {}),
        ...(filterHasPdf === "yes" ? { has_pdf: "1" } : filterHasPdf === "no" ? { has_pdf: "0" } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: !!effectiveBranchId,
  });

  const invoices = useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [listQuery.data?.pages],
  );
  const totalCount = listQuery.data?.pages[0]?.count ?? 0;

  return (
    <div className="flex h-full flex-col overflow-auto p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("page.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("page.description", {
              branchSuffix: branchName ? t("page.branchSuffixWithName", { name: branchName }) : "",
            })}
          </p>
        </div>
        {showBranchPicker && (
          <select
            value={effectiveBranchId ?? ""}
            onChange={(e) => setBranchOverride(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm border-border bg-card text-foreground"
          >
            {branchList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!effectiveBranchId ? (
        <p className="text-sm text-amber-700">{t("page.branchRequired")}</p>
      ) : listQuery.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      ) : (
        <Card className="p-0 gap-0 border-border shadow-md border-border bg-card ring-1 py-0 gap-0">
          <div className="border-b border-border px-4 py-3 border-border bg-muted/40">
            <h2 className="text-sm font-semibold text-foreground">{t("page.listTitle")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {totalCount > 0
                ? t("page.listHint") + ` (${invoices.length}/${totalCount})`
                : t("page.listHint")}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex min-w-[9.5rem] flex-col gap-1">
                <label
                  className="text-sub font-medium uppercase tracking-wide text-muted-foreground"
                  htmlFor="inv-filter-date-from"
                >
                  {t("page.dateFrom")}
                </label>
                <input
                  id="inv-filter-date-from"
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="rounded-lg border border-border px-2 py-1.5 text-sm border-input bg-card text-foreground"
                />
              </div>
              <div className="flex min-w-[9.5rem] flex-col gap-1">
                <label
                  className="text-sub font-medium uppercase tracking-wide text-muted-foreground"
                  htmlFor="inv-filter-date-to"
                >
                  {t("page.dateTo")}
                </label>
                <input
                  id="inv-filter-date-to"
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="rounded-lg border border-border px-2 py-1.5 text-sm border-input bg-card text-foreground"
                />
              </div>
              <div className="flex min-w-[9rem] flex-col gap-1">
                <label
                  className="text-sub font-medium uppercase tracking-wide text-muted-foreground"
                  htmlFor="inv-filter-pdf"
                >
                  {t("page.pdfFilter")}
                </label>
                <select
                  id="inv-filter-pdf"
                  value={filterHasPdf}
                  onChange={(e) => setFilterHasPdf(e.target.value as PdfFilter)}
                  className="rounded-lg border border-border px-2 py-1.5 text-sm border-input bg-card text-foreground"
                >
                  <option value="all">{t("page.pdfAll")}</option>
                  <option value="yes">{t("page.pdfYes")}</option>
                  <option value="no">{t("page.pdfNo")}</option>
                </select>
              </div>
              <div className="flex min-w-[12rem] flex-1 flex-col gap-1 sm:min-w-[14rem]">
                <label
                  className="text-sub font-medium uppercase tracking-wide text-muted-foreground"
                  htmlFor="inv-filter-search"
                >
                  {t("page.searchLabel")}
                </label>
                <input
                  id="inv-filter-search"
                  type="search"
                  value={filterSearchRaw}
                  onChange={(e) => setFilterSearchRaw(e.target.value)}
                  placeholder={t("page.searchPlaceholder")}
                  autoComplete="off"
                  className="rounded-lg border border-border px-2 py-1.5 text-sm placeholder:text-muted-foreground border-input bg-card text-foreground"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilterDateFrom("");
                  setFilterDateTo("");
                  setFilterHasPdf("all");
                  setFilterSearchRaw("");
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover: border-border bg-muted text-muted-foreground dark:hover:"
              >
                {t("page.resetFilters")}
              </button>
            </div>
          </div>
          <CardContent className="p-4">
            {invoices.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground dark:text-muted-foreground">
                {t("page.empty")}
              </p>
            ) : (
              <VirtualTable
                rows={invoices}
                rowHeight={44}
                overscan={10}
                fetchMore={listQuery.fetchNextPage}
                hasMore={!!listQuery.hasNextPage}
                isFetchingNextPage={listQuery.isFetchingNextPage}
                className="max-h-[calc(100vh-20rem)] bg-card"
                tableClassName="w-full text-sm"
                header={
                  <thead className={virtualTableStickyHeadClass}>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-widertext-muted-foreground">
                        {t("table.number")}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-widertext-muted-foreground">
                        {t("table.customer")}
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold tracking-widertext-muted-foreground">
                        {t("table.amount")}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-widertext-muted-foreground">
                        {t("table.date")}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-widertext-muted-foreground">
                        {t("table.pdf")}
                      </th>
                    </tr>
                  </thead>
                }
                loadingMore={
                  <tr>
                    <td colSpan={5} className="py-3 text-center">
                      <Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" />
                    </td>
                  </tr>
                }
                renderRow={(inv) => (
                  <>
                    <td className="px-3 py-2 font-mono text-xs font-medium text-foreground">
                      {inv.invoice_number}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {inv.customer_name || t("table.missing")}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                      {formatAmount(Number(inv.total_amount), canViewAmounts)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDate(inv.issued_at)}
                    </td>
                    <td className="px-3 py-2">
                      {inv.pdf_url ? (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium shadow-sm transition-colors hover: border-input bg-muted text-foreground dark:hover:"
                        >
                          <Download size={14} /> {t("table.download")}
                        </a>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-accent text-muted-foreground">
                          {t("table.noPdf")}
                        </span>
                      )}
                    </td>
                  </>
                )}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
