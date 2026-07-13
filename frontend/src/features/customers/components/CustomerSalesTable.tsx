"use client";

import React, { memo, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useLocalizedFormatters } from "@/lib/formatters";
import type { CustomerSale } from "../types";

interface CustomerSalesTableProps {
  sales: CustomerSale[];
  infiniteControls?: {
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
  };
  onSaleClick: (orderId: string) => void;
}

const CustomerSaleRow = memo(function CustomerSaleRow({
  sale,
  index,
  measureElement,
  onSaleClick,
  formatCurrency,
  formatDate,
}: {
  sale: CustomerSale;
  index: number;
  measureElement: (el: HTMLElement | null) => void;
  onSaleClick: (orderId: string) => void;
  formatCurrency: (value: number | string) => string;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
}) {
  const orderId = sale.order || sale.order_id || sale.id;

  return (
    <tr
      data-index={index}
      ref={measureElement}
      className="border-b border-border/40 transition-colors hover:bg-muted/40"
    >
      <td className="px-4 py-2.5 font-mono text-xs text-foreground">
        <button
          type="button"
          onClick={() => onSaleClick(orderId)}
          className="text-left font-mono text-primary hover:underline"
        >
          {sale.id.slice(0, 8)}
        </button>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">
        {sale.paid_at || sale.created_at ? formatDate(sale.paid_at || sale.created_at!) : "—"}
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">
        {sale.branch_name || (sale.branch && sale.branch.name) || "—"}
      </td>
      <td className="px-4 py-2.5">
        <Badge variant="outline">{sale.payment_method_display || "—"}</Badge>
      </td>
      <td className="px-4 py-2.5 text-right font-semibold text-foreground">
        {formatCurrency(sale.total_amount)}
      </td>
    </tr>
  );
});

export const CustomerSalesTable = memo(function CustomerSalesTable({
  sales,
  infiniteControls,
  onSaleClick,
}: CustomerSalesTableProps) {
  const t = useTranslations("customers");
  const { formatCurrency, formatDate } = useLocalizedFormatters();
  const containerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: sales.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 44,
    overscan: 10,
    getItemKey: (index) => sales[index]?.id ?? index,
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
      lastItem.index >= sales.length - 1 &&
      infiniteControls.hasNextPage &&
      !infiniteControls.isFetchingNextPage
    ) {
      infiniteControls.fetchNextPage();
    }
  }, [virtualItems, sales.length, infiniteControls]);

  useEffect(() => {
    if (!infiniteControls?.hasNextPage || infiniteControls.isFetchingNextPage) return;
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 80) {
      infiniteControls.fetchNextPage();
    }
  }, [sales.length, infiniteControls]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-background">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-muted-foreground">
              {t("sales.colSaleNo")}
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-muted-foreground">
              {t("sales.colDate")}
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-muted-foreground">
              {t("sales.colBranch")}
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-muted-foreground">
              {t("sales.colPayment")}
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-muted-foreground">
              {t("sales.colAmount")}
            </th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={5} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const sale = sales[virtualRow.index];
            if (!sale) return null;
            return (
              <CustomerSaleRow
                key={sale.id}
                sale={sale}
                index={virtualRow.index}
                measureElement={rowVirtualizer.measureElement}
                onSaleClick={onSaleClick}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={5} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      {infiniteControls?.isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 border-t border-border py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("sales.loadingMore")}
        </div>
      )}
    </div>
  );
});
