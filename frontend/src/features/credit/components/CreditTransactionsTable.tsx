"use client";

import React, { memo, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate, formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import type { CreditTransaction } from "../types";

interface CreditTransactionsTableProps {
  transactions: CreditTransaction[];
  infiniteControls?: {
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
  };
  onRowClick?: (tx: CreditTransaction) => void;
}

const CreditTransactionRow = memo(function CreditTransactionRow({
  tx,
  index,
  canViewAmounts,
  measureElement,
  onRowClick,
}: {
  tx: CreditTransaction;
  index: number;
  canViewAmounts: boolean;
  measureElement: (el: HTMLElement | null) => void;
  onRowClick?: (tx: CreditTransaction) => void;
}) {
  const clickable = !!onRowClick && !!tx.sale_id;
  return (
    <tr
      data-index={index}
      ref={measureElement}
      onClick={clickable ? () => onRowClick?.(tx) : undefined}
      className={`border-t border-border border-border ${clickable ? "cursor-pointer hover: dark:hover:/60" : ""}`}
    >
      <td className="px-3 py-2 whitespace-nowrap">{formatDate(tx.created_at)}</td>
      <td className="px-3 py-2">{tx.transaction_type_display}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatAmount(tx.amount, canViewAmounts)}
      </td>
      <td className="px-3 py-2">{tx.order_number ?? "—"}</td>
    </tr>
  );
});

export const CreditTransactionsTable = memo(function CreditTransactionsTable({
  transactions,
  infiniteControls,
  onRowClick,
}: CreditTransactionsTableProps) {
  const t = useTranslations("credit");
  const canViewAmounts = useCanViewAmounts();
  const containerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 36,
    overscan: 10,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem || !infiniteControls) return;
    if (
      lastItem.index >= transactions.length - 1 &&
      infiniteControls.hasNextPage &&
      !infiniteControls.isFetchingNextPage
    ) {
      infiniteControls.fetchNextPage();
    }
  }, [virtualItems, transactions.length, infiniteControls]);

  return (
    <div
      ref={containerRef}
      className="max-h-64 overflow-y-auto rounded-lg border border-border border-border"
    >
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="px-3 py-2 text-left">{t("detail.txDate")}</th>
            <th className="px-3 py-2 text-left">{t("detail.txType")}</th>
            <th className="px-3 py-2 text-right">{t("detail.txAmount")}</th>
            <th className="px-3 py-2 text-left">{t("detail.txOrder")}</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={4} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const tx = transactions[virtualRow.index];
            if (!tx) return null;
            return (
              <CreditTransactionRow
                key={tx.id}
                tx={tx}
                index={virtualRow.index}
                canViewAmounts={canViewAmounts}
                measureElement={rowVirtualizer.measureElement}
                onRowClick={onRowClick}
              />
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={4} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      {infiniteControls?.isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 border-t border-border py-2 text-xs text-muted-foreground border-border">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("page.loadingMore")}
        </div>
      )}
    </div>
  );
});
