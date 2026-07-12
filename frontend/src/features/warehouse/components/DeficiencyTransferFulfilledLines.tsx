"use client";

import { memo, useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQuantityWithUnit } from "@/lib/formatters";
import { type DeficiencyReport } from "@/features/warehouse/types";
import { useTranslations } from "next-intl";

type Transfers = NonNullable<DeficiencyReport["transfers"]>;

const variants = {
  warehouse: {
    root: "rounded-2xl border border-border overflow-hidden flex flex-col bg-background",
    title:
      "border-b border-border bg-background px-4 py-2.5 text-xs font-ui-bold uppercase tracking-widest text-muted-foreground",
    searchBox: "border-b border-border bg-background p-2",
    transferBar:
      "flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border bg-background px-4 py-2 text-sub last:border-b-0",
    transferNo: "font-mono font-ui-bold text-amber-600 dark:text-amber-400",
    transferStatus: "text-muted-foreground",
    row: "flex items-baseline justify-between gap-2 bg-background px-4 py-2.5 text-sm hover:bg-muted/20",
    name: "min-w-0 flex-1 font-ui-bold text-foreground",
    qty: "shrink-0 tabular-nums text-muted-foreground",
    divider: "divide-y divide-border",
    blockOuter: "border-b border-border last:border-b-0",
    scrollArea: "overflow-y-auto max-h-[300px] custom-scrollbar",
  },
  kds: {
    root: "flex min-h-0 flex-1 flex-col border-t border-border",
    title:
      "shrink-0 border-b border-border bg-muted px-3 py-2 text-xs font-ui-bold uppercase tracking-wider text-muted-foreground",
    searchBox: "p-2 shrink-0 border-b border-border bg-background",
    transferBar: "flex flex-wrap items-center gap-x-2 gap-y-0.5 bg-muted/40 px-3 py-2 text-sub border-b border-border",
    transferNo: "font-mono font-ui-bold text-amber-600 dark:text-amber-400",
    transferStatus: "text-muted-foreground font-ui-medium uppercase tracking-widest text-2xs",
    row: "flex items-baseline justify-between gap-2 px-3 py-2 text-sm leading-snug hover:bg-muted transition-colors",
    name: "min-w-0 flex-1 truncate font-ui-bold text-foreground",
    qty: "shrink-0 tabular-nums font-ui-bold text-foreground",
    divider: "divide-y divide-border",
    blockOuter: "border-b border-border last:border-b-0",
    scrollArea: "flex-1 overflow-y-auto custom-scrollbar",
  },
} as const;

/** Rapor kalemleri boşaldığında bağlı transfer satırlarından ürün özeti (depo eksik listesi + KDS). */
export const DeficiencyTransferFulfilledLines = memo(function DeficiencyTransferFulfilledLines({
  transfers,
  variant = "warehouse",
}: {
  transfers: Transfers;
  variant?: keyof typeof variants;
}) {
  const t = useTranslations("warehouse")
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredBlocks = useMemo(() => {
    return transfers
      .map((t) => {
        const filteredItems = (t.items ?? []).filter((item) => {
          const name = (item.stock_item_name ?? item.stock_item).toLowerCase();
          return name.includes(searchTerm.toLowerCase());
        });
        return { ...t, filteredItems };
      })
      .filter((t) => t.filteredItems.length > 0);
  }, [transfers, searchTerm]);

  if (transfers.length === 0) return null;
  const v = variants[variant];

  return (
    <div className={v.root}>
      <p className={v.title}>{t("transferFulfilledLines.title")}</p>
      
      <div className={v.searchBox}>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("transferFulfilledLines.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-8 text-xs text-foreground transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className={v.scrollArea}>
        {filteredBlocks.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground italic">
            {t("transferFulfilledLines.noMatch")}
          </div>
        ) : (
          filteredBlocks.map((block) => (
            <div key={block.id} className={v.blockOuter}>
              <div className={v.transferBar}>
                <span className={cn(v.transferNo, "text-xs")}>{block.transfer_number}</span>
                <span className={cn(v.transferStatus, "text-xs")}>
                  {(t as unknown as (k: string) => string)(`status.transfer.${block.status}`)}
                </span>
              </div>
              <ul className={v.divider}>
                {block.filteredItems.map((line) => {
                  const name = line.stock_item_name ?? line.stock_item;
                  const qty = formatQuantityWithUnit(line.quantity, line.unit);
                  return (
                    <li key={line.id} className={v.row}>
                      <span className={v.name} title={name}>
                        {name}
                      </span>
                      <span className={v.qty}>
                        {qty}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
