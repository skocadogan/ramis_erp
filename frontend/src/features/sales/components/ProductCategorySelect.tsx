"use client";

import React, { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Search, Check, ChevronDown, LayoutGrid } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useMenuData } from "@/features/menu/hooks/useMenuData";

interface ProductCategorySelectProps {
  value: string | null;
  onSelect: (productId: string | null) => void;
  triggerClassName?: string;
}

export function ProductCategorySelect({
  value,
  onSelect,
  triggerClassName,
}: ProductCategorySelectProps) {
    const t = useTranslations("sales");
    const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { categories, products, isLoading } = useMenuData();

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === value),
    [products, value]
  );

  const groupedProducts = useMemo(() => {
    const s = search.toLowerCase().trim();
    
    // Create a map of category_id -> products
    const map: Record<string, typeof products> = {};
    
    products.forEach(p => {
        if (s && !p.name.toLowerCase().includes(s)) return;
        
        const catId = p.category ? String(p.category) : "other";
        if (!map[catId]) map[catId] = [];
        map[catId].push(p);
    });
    
    // Sort categories by order and return grouped list
    return categories
        .map(cat => ({
            ...cat,
            items: map[cat.id] || []
        }))
        .filter(cat => cat.items.length > 0)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [categories, products, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm shadow-sm transition-all hover: focus:outline-none focus:ring-2 focus:ring-blue-500/20 border-border bg-card dark:hover:",
          !selectedProduct && "text-muted-foreground",
          triggerClassName
        )}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <LayoutGrid size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selectedProduct ? selectedProduct.name : t("productSelect.allProducts")}
          </span>
        </div>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 shadow-md bg-card border-border" align="start">
        <div className="flex items-center border-b p-2 border-border">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground"
            placeholder={t("productSelect.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[350px] overflow-y-auto p-1 scrollbar-thin">
          <button
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover: dark:hover:",
              !value && "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-semibold"
            )}
          >
            {t("productSelect.allProducts")}
            {!value && <Check size={14} />}
          </button>
          
          {groupedProducts.map((cat) => (
            <div key={cat.id} className="mt-2">
              <div className="px-2 py-1 text-2xs font-bold tracking-widertext-muted-foreground dark:text-muted-foreground">
                {cat.name}
              </div>
              {cat.items.map((product) => (
                <button
                  key={product.id}
                  onClick={() => {
                    onSelect(product.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md pl-6 pr-3 py-2 text-sm transition-colors hover: dark:hover:",
                    value === product.id && "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-semibold"
                  )}
                >
                  {product.name}
                  {value === product.id && <Check size={14} />}
                </button>
              ))}
            </div>
          ))}
          
          {groupedProducts.length === 0 && !isLoading && (
            <div className="p-4 text-center text-xs text-muted-foreground">{t("productSelect.empty")}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
