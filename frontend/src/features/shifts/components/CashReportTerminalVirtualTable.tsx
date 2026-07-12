"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/formatters";
import { Laptop, Loader2 } from "lucide-react";
import type { ShiftCashReportDto } from "../types";

type TerminalData = ShiftCashReportDto["terminals"][number];
type SaleData = TerminalData["sales_list"][number];

const BATCH_SIZE = 50;
const LOAD_MORE_THRESHOLD_PX = 240;
const SALE_ROW_ESTIMATE_PX = 40;

const SALE_GRID =
  "grid w-full grid-cols-[4rem_8rem_minmax(0,1fr)_10rem_4rem_5.5rem] items-center";

function formatOrderNumber(orderNumber: string) {
  return orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;
}

function paymentMethodLabel(method: string, t: ReturnType<typeof useTranslations>) {
  if (method === "CASH") return t("cashReport.paymentCash");
  if (method === "CARD") return t("cashReport.paymentCard");
  if (method === "CREDIT") return t("cashReport.paymentCredit");
  return t("cashReport.paymentOther");
}

function SaleGridHeader({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div
      className={cn(
        SALE_GRID,
        "border-b border-border bg-muted/50 px-1 text-xs font-ui-bold text-muted-foreground"
      )}
    >
      <div className="px-2 py-2.5">{t("cashReport.orderNo")}</div>
      <div className="px-2 py-2.5">{t("cashReport.date")}</div>
      <div className="min-w-0 px-2 py-2.5">{t("cashReport.cashier")}</div>
      <div className="px-2 py-2.5">{t("cashReport.type")}</div>
      <div className="px-2 py-2.5 text-right">{t("cashReport.discount")}</div>
      <div className="px-2 py-2.5 text-right">{t("cashReport.amount")}</div>
    </div>
  );
}

function SaleGridRow({
  sale,
  locale,
  canViewAmounts,
  t,
}: {
  sale: SaleData;
  locale: string;
  canViewAmounts: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      className={cn(
        SALE_GRID,
        "border-b border-border/40 px-1 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      <div className="px-2 py-2 font-ui-semibold text-foreground whitespace-nowrap">
        {formatOrderNumber(sale.order_number)}
      </div>
      <div className="px-2 py-2 whitespace-nowrap tabular-nums">
        {new Date(sale.paid_at).toLocaleString(locale === "tr" ? "tr-TR" : "en-US", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <div className="min-w-0 px-2 py-2 truncate" title={sale.created_by}>
        {sale.created_by}
      </div>
      <div className="px-2 py-2">
        <span
          className={cn(
            "inline-block rounded px-1.5 py-0.5 text-3xs font-ui-semibold whitespace-nowrap",
            sale.payment_method === "CASH" &&
              "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
            sale.payment_method === "CARD" &&
              "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
            sale.payment_method === "OTHER" &&
              "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
          )}
        >
          {paymentMethodLabel(sale.payment_method, t)}
        </span>
      </div>
      <div className="px-2 py-2 text-right font-mono text-rose-600 whitespace-nowrap tabular-nums">
        {sale.discount_amount > 0
          ? formatAmount(sale.discount_amount, canViewAmounts)
          : "—"}
      </div>
      <div className="px-2 py-2 text-right font-ui-bold font-mono text-foreground whitespace-nowrap tabular-nums">
        {formatAmount(sale.total_amount, canViewAmounts)}
      </div>
    </div>
  );
}

function TerminalSummaryBlock({
  terminal,
  terminalIndex,
  canViewAmounts,
  t,
}: {
  terminal: TerminalData;
  terminalIndex: number;
  canViewAmounts: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      className={cn(
        "shrink-0",
        terminalIndex > 0 && "border-t border-border"
      )}
    >
      <div className="border-b border-border bg-muted/40 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
              <Laptop size={16} />
            </div>
            <span className="text-sm font-ui-bold text-foreground">{terminal.terminal_name}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-ui-semibold text-foreground">{terminal.sales_count}</span>{" "}
            {t("cashReport.sales")} | {t("cashReport.total")}:{" "}
            <span className="font-ui-bold font-mono text-primary">
              {formatAmount(terminal.total_amount, canViewAmounts)}
            </span>
          </p>
        </div>
      </div>

      <div className="border-b border-border bg-muted/20 px-3 py-2">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2 text-xs sm:grid-cols-4">
          <div className="text-center">
            <p className="font-ui-semibold uppercase text-muted-foreground">
              {t("cashReport.paymentCash")}
            </p>
            <p className="mt-0.5 font-ui-bold font-mono">
              {formatAmount(terminal.payments.CASH, canViewAmounts)}
            </p>
          </div>
          <div className="border-x border-border text-center">
            <p className="font-ui-semibold uppercase text-muted-foreground">
              {t("cashReport.paymentCard")}
            </p>
            <p className="mt-0.5 font-ui-bold font-mono">
              {formatAmount(terminal.payments.CARD, canViewAmounts)}
            </p>
          </div>
          <div className="border-r border-border text-center">
            <p className="font-ui-semibold uppercase text-muted-foreground">
              {t("cashReport.paymentOther")}
            </p>
            <p className="mt-0.5 font-ui-bold font-mono">
              {formatAmount(terminal.payments.OTHER, canViewAmounts)}
            </p>
          </div>
          <div className="text-center">
            <p className="font-ui-semibold uppercase text-muted-foreground">
              {t("cashReport.paymentCredit")}
            </p>
            <p className="mt-0.5 font-ui-bold font-mono">
              {formatAmount(terminal.payments.CREDIT ?? 0, canViewAmounts)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CashReportTerminalVirtualTableProps {
  terminals: TerminalData[];
  canViewAmounts: boolean;
}

export function CashReportTerminalVirtualTable({
  terminals,
  canViewAmounts,
}: CashReportTerminalVirtualTableProps) {
  const t = useTranslations("shifts");
  const locale = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleSaleCount, setVisibleSaleCount] = useState(BATCH_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const allSales = useMemo(
    () => terminals.flatMap((terminal) => terminal.sales_list),
    [terminals]
  );
  const visibleSales = useMemo(
    () => allSales.slice(0, visibleSaleCount),
    [allSales, visibleSaleCount]
  );
  const hasMoreRows = visibleSaleCount < allSales.length;

  useEffect(() => {
    setVisibleSaleCount(BATCH_SIZE);
    setIsLoadingMore(false);
  }, [terminals]);

  const rowVirtualizer = useVirtualizer({
    count: visibleSales.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => SALE_ROW_ESTIMATE_PX,
    overscan: 12,
    measureElement:
      typeof window !== "undefined"
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  const loadMore = useCallback(() => {
    if (!hasMoreRows || isLoadingMore) return;
    setIsLoadingMore(true);
    setVisibleSaleCount((prev) => Math.min(prev + BATCH_SIZE, allSales.length));
  }, [allSales.length, hasMoreRows, isLoadingMore]);

  useEffect(() => {
    setIsLoadingMore(false);
  }, [visibleSales.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (!hasMoreRows) return;
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceToBottom <= LOAD_MORE_THRESHOLD_PX) {
        loadMore();
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMoreRows, loadMore]);

  if (terminals.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-border bg-background p-8 text-center text-xs text-muted-foreground">
        {t("cashReport.noSales")}
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize() + (hasMoreRows ? 44 : 0);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-border bg-background">
      {/* Cihaz özeti + ödeme dağılımı — kaydırma dışında */}
      <div className="max-h-[42%] shrink-0 overflow-y-auto overscroll-contain scrollbar-thin">
        {terminals.map((terminal, terminalIndex) => (
          <TerminalSummaryBlock
            key={`${terminal.terminal_name}-${terminalIndex}`}
            terminal={terminal}
            terminalIndex={terminalIndex}
            canViewAmounts={canViewAmounts}
            t={t}
          />
        ))}
      </div>

      {/* Sütun başlıkları — SalesTab / ItemsTable gibi kaydırma dışında sabit */}
      <div className="shrink-0">
        <SaleGridHeader t={t} />
      </div>

      {/* Yalnızca satış satırları kayar */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
      >
        {visibleSales.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-xs text-muted-foreground">
            {t("cashReport.noSales")}
          </div>
        ) : (
          <div
            style={{
              height: `${totalHeight}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualRow) => {
              const sale = visibleSales[virtualRow.index];
              if (!sale) return null;

              return (
                <div
                  key={sale.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <SaleGridRow
                    sale={sale}
                    locale={locale}
                    canViewAmounts={canViewAmounts}
                    t={t}
                  />
                </div>
              );
            })}

            {hasMoreRows && (
              <div
                className="absolute left-0 flex w-full items-center justify-center gap-2 py-3 text-xs text-muted-foreground"
                style={{ transform: `translateY(${rowVirtualizer.getTotalSize()}px)` }}
              >
                <Loader2 size={14} className="animate-spin text-primary" />
                {t("cashReport.loadingMore")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
