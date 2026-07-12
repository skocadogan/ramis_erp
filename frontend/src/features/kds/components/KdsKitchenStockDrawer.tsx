"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Filter, ListPlus, Loader2, Package, Plus, Search, X } from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  type KdsLinkedStockLevel,
  useKdsLinkedStock,
} from "@/features/kds/hooks/useKdsLinkedStock";
import { formatQuantityWithUnit } from "@/lib/formatters";
import { formatMinimumQuantityDisplay, MINIMUM_UNLIMITED_SENTINEL } from "@/lib/stockMinimum";

const ROW_ESTIMATE_PX = 132;

function parseQty(s: string): number {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Kritik seviyeye göre eksik listesi için önerilen talep miktarı */
function suggestedDeficiencyQuantity(level: KdsLinkedStockLevel): number {
  const q = parseQty(level.quantity);
  const min = parseQty(level.minimum_quantity);
  if (min === MINIMUM_UNLIMITED_SENTINEL) return 1;
  if (min > 0 && q < min) {
    const gap = min - q;
    return Math.max(0.001, Math.round(gap * 1000) / 1000);
  }
  return 1;
}

interface Props {
  stationId: string;
  /** Kritik stok satırı için eksik listesi modalını açar */
  onAddToDeficiency?: (items: { stock_item_id: string; quantity: number; unit: string }[]) => void;
  collapsed?: boolean;
}

function StockRow({
  row,
  onAddToDeficiency,
  onCloseDrawer,
}: {
  row: KdsLinkedStockLevel;
  onAddToDeficiency?: Props["onAddToDeficiency"];
  onCloseDrawer: () => void;
}) {
  const t = useTranslations("kds");
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-colors",
        row.is_low_stock ? "border-amber-600/50 bg-amber-500/10" : "border-border bg-muted/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-ui-semibold leading-tight text-foreground">{row.stock_item_name}</p>
          {row.stock_item_sku ? (
            <p className="mt-0.5 font-mono text-xs text-foreground">{row.stock_item_sku}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
            <span className="text-ui text-foreground">{t('inventory.remaining')} :</span>
            <span
              className={cn(
                "tabular-nums text-ui font-ui-bold",
                row.is_low_stock ? "text-amber-600 dark:text-amber-400" : "text-primary"
              )}
            >
              {formatQuantityWithUnit(row.quantity, row.stock_item_unit)}
            </span>
            <span className="text-ui text-foreground">
              {t('inventory.min')}: {formatMinimumQuantityDisplay(row.minimum_quantity, row.stock_item_unit)}
            </span>
          </div>
        </div>
        {row.is_low_stock && onAddToDeficiency ? (
          <button
            type="button"
            onClick={() => {
              onCloseDrawer();
              onAddToDeficiency([
                {
                  stock_item_id: row.stock_item,
                  quantity: suggestedDeficiencyQuantity(row),
                  unit: row.stock_item_unit || "",
                },
              ]);
            }}
            className="flex max-w-[9rem] shrink-0 flex-col items-center gap-0.5 rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-100 dark:bg-amber-600/20 px-2 py-1.5 text-center text-[11px] font-ui-semibold leading-tight text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-600/35 sm:max-w-none sm:flex-row sm:gap-1 shadow-sm transition-colors"
          >
            <Plus size={14} className="shrink-0" />
            <span>{t('inventory.addToDeficiency')}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function KdsKitchenStockDrawer({ stationId, onAddToDeficiency, collapsed = false }: Props) {
  const t = useTranslations("kds");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "critical">("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isFetching, refetch } = useKdsLinkedStock(stationId);

  useEffect(() => {
    if (open) void refetch();
  }, [open, stationId, refetch]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setStockFilter("all");
    }
  }, [open]);

  const levels = data?.levels ?? [];
  const sorted = [...levels].sort((a, b) => {
    const an = a.stock_item_name?.toLocaleLowerCase("tr") ?? "";
    const bn = b.stock_item_name?.toLocaleLowerCase("tr") ?? "";
    return an.localeCompare(bn, "tr");
  });
  let list = stockFilter === "critical" ? sorted.filter((l) => l.is_low_stock) : sorted;
  const q = query.trim().toLocaleLowerCase("tr");
  if (q) {
    list = list.filter((l) => {
      const name = (l.stock_item_name || "").toLocaleLowerCase("tr");
      const sku = (l.stock_item_sku || "").toLocaleLowerCase("tr");
      return name.includes(q) || sku.includes(q);
    });
  }
  const filtered = list;
  const criticalLevels = sorted.filter((l) => l.is_low_stock);
  const lowCount = criticalLevels.length;

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 6,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [query, stockFilter]);

  const buttonContent = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "flex shrink-0 items-center rounded-xl transition-colors duration-200 text-primary hover:bg-primary/10",
        collapsed ? "size-11 justify-center p-0" : "h-11 gap-2 px-3"
      )}
      title={t('inventory.tooltip')}
    >
      <Package size={28} className="shrink-0" />
      {!collapsed && (
        <span className="max-w-[10rem] truncate text-xs font-ui-semibold sm:text-sm">{t('inventory.sidebarLabel')}</span>
      )}
    </button>
  );

  return (
    <>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={buttonContent} />
          <TooltipContent side="top" sideOffset={8} className="bg-popover text-popover-foreground border-border font-ui-semibold text-xs">
            {t('inventory.sidebarLabel')}
          </TooltipContent>
        </Tooltip>
      ) : (
        buttonContent
      )}
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label={t('inventory.close')}
            onClick={() => setOpen(false)}
          />
          <aside
            className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-lg"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted px-4 py-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-ui-bold text-foreground">
                  <Package size={18} className="shrink-0 text-primary" />
                  <span className="truncate">{t('inventory.title')}</span>
                </h2>
                {data?.warehouse_name ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{data.warehouse_name}</p>
                ) : (
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400 font-ui-medium italic">{t('inventory.noWarehouse')}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(isFetching || isLoading) && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t('inventory.close')}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {lowCount > 0 && (
              <div className="shrink-0 border-b border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-ui-semibold text-amber-700 dark:text-amber-300">
                    <AlertTriangle size={14} className="shrink-0" aria-hidden />
                    {t('inventory.criticalCount', { count: lowCount })}
                  </span>
                  {onAddToDeficiency ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!criticalLevels.length) return;
                        setOpen(false);
                        onAddToDeficiency(
                          criticalLevels.map((row) => ({
                            stock_item_id: row.stock_item,
                            quantity: suggestedDeficiencyQuantity(row),
                            unit: row.stock_item_unit || "",
                          }))
                        );
                      }}
                      className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-500/50 bg-amber-200 dark:bg-amber-600/25 px-3 py-2 text-xs font-ui-bold text-amber-900 dark:text-amber-50 transition-colors hover:bg-amber-300/80 dark:hover:bg-amber-600/40 sm:w-auto shadow-sm"
                      title={t('inventory.addAllCriticalTooltip')}
                    >
                      <ListPlus size={15} className="shrink-0" aria-hidden />
                      {t('inventory.addAllCritical')}
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {!data?.warehouse_id ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                  <Package size={40} className="mb-3 opacity-40" />
                  <p className="text-sm font-ui-medium">{t('inventory.noWarehouseDesc')}</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">{t('inventory.systemConfigNote')}</p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex min-h-0 flex-1 items-center justify-center p-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                  <p className="text-sm">{t('inventory.emptyWarehouse')}</p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="shrink-0 space-y-2 border-b border-border bg-muted/80 px-3 py-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('inventory.searchPlaceholder')}
                      className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-ui-bold text-muted-foreground">
                      <Filter size={12} />
                      {t('inventory.stock')}
                    </span>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                      <button
                        type="button"
                        onClick={() => setStockFilter("all")}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-ui-semibold transition-colors",
                          stockFilter === "all"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t('inventory.filterAll')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStockFilter("critical")}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-ui-semibold transition-colors",
                          stockFilter === "critical"
                            ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t('inventory.filterCritical')}
                      </button>
                    </div>
                    <span className="ml-auto text-sub tabular-nums text-muted-foreground">
                      {filtered.length} / {sorted.length}
                    </span>
                  </div>
                </div>

                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      <p className="text-sm font-ui-medium">{t('inventory.noMatch')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t('inventory.noMatchDesc')}</p>
                    </div>
                  ) : (
                    <div
                      className="relative w-full"
                      style={{ height: virtualizer.getTotalSize() }}
                      role="list"
                    >
                      {virtualizer.getVirtualItems().map((vi) => {
                        const row = filtered[vi.index];
                        return (
                          <div
                            key={vi.key}
                            data-index={vi.index}
                            ref={virtualizer.measureElement}
                            role="listitem"
                            className="absolute left-0 top-0 w-full pb-2"
                            style={{ transform: `translateY(${vi.start}px)` }}
                          >
                            <StockRow
                              row={row}
                              onAddToDeficiency={onAddToDeficiency}
                              onCloseDrawer={() => setOpen(false)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="shrink-0 border-t border-border bg-muted/80 px-4 py-2 text-2xs text-muted-foreground">
              {t('inventory.autoRefreshNote')}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
