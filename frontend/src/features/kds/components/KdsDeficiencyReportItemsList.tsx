"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { formatQuantityWithUnit } from "@/lib/formatters";
import type { DeficiencyReportItem } from "@/features/warehouse/types";

const ROW_ESTIMATE = 56;

/** Çok satırlı kalem listesinde yalnızca görünen satırları render eder (KDS detay modal). */
export function KdsDeficiencyReportItemsList({
  items,
  emptyDetailHint,
}: {
  items: DeficiencyReportItem[];
  /** Boş liste yerine gösterilecek açıklama (ör. tamamlanmış raporda satırların silinmesi) */
  emptyDetailHint?: string;
}) {
  const t = useTranslations("kds");
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 10,
  });

  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        {emptyDetailHint ?? t('itemsList.noItems')}
      </p>
    );
  }

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto_6rem]">
        <span>{t('itemsList.product')}</span>
        <span className="whitespace-nowrap text-right">{t('itemsList.quantity')}</span>
        <span className="hidden max-w-[6rem] truncate sm:block">{t('itemsList.sku')}</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
          role="presentation"
        >
          {virtualRows.map((vi) => {
            const item = items[vi.index];
            const name = item.stock_item_name ?? item.stock_item;
            const note = item.notes?.trim();
            const qtyDisplay = formatQuantityWithUnit(item.quantity, item.unit);
            const qtyTitle = qtyDisplay;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full border-b border-border/60 px-3 py-2 text-sm leading-snug hover:bg-muted/40"
                style={{
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_6rem] sm:items-start sm:gap-x-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-foreground" title={name}>
                      {name}
                    </div>
                    {note ? (
                      <div
                        className="truncate text-xs italic leading-snug text-muted-foreground"
                        title={note}
                      >
                        {note}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className="shrink-0 whitespace-nowrap text-right tabular-nums font-bold text-foreground sm:pt-0"
                    title={qtyTitle}
                  >
                    {qtyDisplay}
                  </div>
                  <div className="hidden min-w-0 max-w-[6rem] truncate text-muted-foreground sm:block">
                    {item.stock_item_sku ?? "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="shrink-0 border-t border-border bg-muted/20 px-3 py-2 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t('itemsList.footerNote', { count: items.length })}
      </p>
    </div>
  );
}
