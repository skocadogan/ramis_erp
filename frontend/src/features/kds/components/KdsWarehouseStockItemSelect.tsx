"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type KdsLinkedStockLevel,
  useKdsLinkedStock,
} from "@/features/kds/hooks/useKdsLinkedStock";

interface Props {
  stationId: string;
  value: string;
  onSelect: (level: KdsLinkedStockLevel) => void;
  disabled?: boolean;
}

export function KdsWarehouseStockItemSelect({
  stationId,
  value,
  onSelect,
  disabled,
}: Props) {
  const t = useTranslations("kds");
  const tStock = useTranslations("inventory.stockSelect");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data, isLoading, isFetching } = useKdsLinkedStock(stationId);

  const levels = useMemo(() => data?.levels ?? [], [data?.levels]);

  const filteredLevels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return levels;
    return levels.filter(
      (level) =>
        level.stock_item_name.toLowerCase().includes(q) ||
        level.stock_item_sku.toLowerCase().includes(q),
    );
  }, [levels, search]);

  const selectedLevel = levels.find((level) => level.stock_item === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled || isLoading}
        className="w-full mt-1 flex items-center justify-between px-3 py-2 border border-border rounded-md text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-muted border-input text-foreground disabled:opacity-50"
      >
        {selectedLevel ? (
          <div className="flex justify-between w-full pr-2">
            <span className="truncate font-medium text-foreground">
              {selectedLevel.stock_item_name}
            </span>
            {selectedLevel.stock_item_sku ? (
              <span className="text-2xs text-muted-foreground font-mono ml-2 shrink-0">
                {selectedLevel.stock_item_sku}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">{tStock("placeholder")}</span>
        )}
        <Search size={14} className="text-muted-foreground shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] max-h-[300px] overflow-hidden flex flex-col border border-border bg-card border-border shadow-md"
        align="start"
      >
        <div className="p-2 border-b border-slate-100 border-border flex items-center gap-2">
          <Search size={14} className="text-muted-foreground" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm focus:outline-none text-foreground"
            placeholder={tStock("searchPh")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(isLoading || isFetching) && (
            <Loader2 size={14} className="animate-spin text-blue-500" />
          )}
        </div>
        <div className="overflow-auto min-h-[50px]">
          {filteredLevels.length === 0 && !isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {levels.length === 0 ? t("waste.noWarehouseItems") : tStock("notFound")}
            </div>
          ) : (
            filteredLevels.map((level) => (
              <button
                key={level.id}
                type="button"
                onClick={() => {
                  onSelect(level);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover: transition-all text-left dark:hover:"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium text-foreground">{level.stock_item_name}</span>
                  <span className="text-2xs text-muted-foreground">
                    {t("waste.availableQty", {
                      qty: level.quantity,
                      unit: level.stock_item_unit,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {level.stock_item_sku ? (
                    <span className="text-xs font-mono text-muted-foreground">
                      {level.stock_item_sku}
                    </span>
                  ) : null}
                  {value === level.stock_item ? (
                    <Check size={14} className="text-blue-500" />
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
