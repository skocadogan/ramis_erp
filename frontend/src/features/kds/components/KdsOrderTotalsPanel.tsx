"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { GroupedOrder } from "../types";
import { aggregateOrderedProductTotals, type KdsProductTotalRow } from "../utils/kdsOrderTotals";
import { formatNumber } from "@/lib/formatters";
import { useKdsClock } from "../hooks/useKdsClock";

interface Props {
  groupedOrders: GroupedOrder[];
}

export function KdsOrderTotalsPanel({ groupedOrders }: Props) {
  const tt = useTranslations("kds.orderTotals");
  const nowMs = useKdsClock();

  const rows = useMemo(
    () => aggregateOrderedProductTotals(groupedOrders, nowMs),
    [groupedOrders, nowMs]
  );

  // Group by category for rendering
  const categories = useMemo(() => {
    const map = new Map<string, KdsProductTotalRow[]>();
    for (const row of rows) {
      const cat = row.categoryName || "DİĞER";
      const list = map.get(cat) ?? [];
      list.push(row);
      map.set(cat, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <aside className="flex min-h-0 w-64 shrink-0 flex-col border-r border-border bg-card text-foreground z-10 transition-colors duration-300">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sub font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {tt("colProduct")}
          </span>
          <span className="text-sub font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {tt("colQty")}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="scrollbar-thin scrollbar-thumb-border flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="text-xs font-medium italic text-muted-foreground">
              {tt("empty")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {categories.map(([category, items]) => (
              <div key={category} className="flex flex-col">
                {/* Category Divider */}
                <div className="bg-muted px-4 py-2 mt-4 first:mt-0">
                  <h3 className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                    {category}
                  </h3>
                </div>
                
                {/* Items */}
                <ul className="flex flex-col">
                  {items.map((row) => (
                    <li
                      key={row.productName}
                      className="group flex flex-col border-b border-border px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 min-w-0 flex-1 text-ui-sm font-semibold leading-tight text-foreground/90 group-hover:text-foreground">
                          {row.productName}
                        </p>
                        <p className="shrink-0 tabular-nums text-sm font-bold text-foreground">
                          x{row.totalQuantity}
                        </p>
                      </div>

                      {/* Unit Breakdowns */}
                      {row.units.length > 0 && (
                        <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
                          {row.units.map((u, idx) => {
                            const unitLabel = u.unitName || tt("standardUnit") || "Adet";
                            const modifierSuffix =
                              u.modifierNames.length > 0
                                ? ` (${u.modifierNames.join(", ")})`
                                : "";
                            return (
                            <li
                              key={`${row.productName}-${u.unitName}-${u.modifierNames.join("|")}-${idx}`}
                              className="flex items-center gap-2 text-sub font-medium text-muted-foreground"
                            >
                              <span className="shrink-0 font-bold text-muted-foreground/60">
                                {u.quantity}x
                              </span>
                              <span className="truncate uppercase tracking-tight">
                                {unitLabel}
                                {modifierSuffix ? (
                                  <span className="normal-case">{modifierSuffix}</span>
                                ) : null}
                              </span>
                            </li>
                            );
                          })}
                        </ul>
                      )}

                      {row.combinedParts && row.combinedParts.length > 0 ? (
                        <div className="mt-2 border-l-2 border-purple-500/45 pl-2.5">
                          <p className="text-3xs font-black tracking-widertext-purple-700 dark:text-purple-300">
                            {tt("combinedSubtitle")}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {row.combinedParts.map((p, idx) => (
                              <li
                                key={`${row.productName}-c-${p.product_name}-${idx}`}
                                className="flex items-start justify-between gap-2 text-sub font-semibold text-muted-foreground"
                              >
                                <span className="min-w-0 flex-1 leading-tight">{p.product_name}</span>
                                <span className="shrink-0 tabular-nums text-xs font-bold text-foreground">
                                  ×
                                  {formatNumber(p.quantity_total, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 4,
                                  })}
                                  {p.unit_name ? (
                                    <span className="ml-1 text-2xs font-semibold uppercase opacity-75">
                                      {p.unit_name}
                                    </span>
                                  ) : null}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {rows.length > 0 && (
        <div className="shrink-0 border-t border-border bg-muted/30 dark:bg-muted/30 px-4 py-3 text-center text-2xs font-bold uppercase tracking-widest text-muted-foreground">
          {tt("productKindCount", { count: rows.length })}
        </div>
      )}
    </aside>
  );
}
