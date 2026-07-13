"use client"

import React, { useState, useMemo } from "react"
import { Search, Check } from "lucide-react"
import { useTranslations } from "next-intl"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { Product } from "@/features/menu/types"

interface ProductSelectProps {
  value: string
  allProducts: Product[]
  onSelect: (productId: string) => void
  disabled?: boolean
  placeholder?: string
  /** Tetikleyici butonuna ek sınıflar (ör. daha kompakt yükseklik/padding). */
  triggerClassName?: string
}

export default function ProductSelect({ 
  value, 
  allProducts, 
  onSelect, 
  disabled,
  placeholder,
  triggerClassName,
}: ProductSelectProps) {
  const t = useTranslations("menu_management")
  const displayPlaceholder = placeholder ?? t("productSelect.defaultPlaceholder")
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const selectedProduct = useMemo(() => 
    allProducts.find(p => p.id === value),
    [allProducts, value]
  )

  const filteredProducts = useMemo(() => {
    const s = search.toLowerCase().trim()
    if (!s) return allProducts.slice(0, 50)
    
    return allProducts.filter(p => 
      p.name.toLowerCase().includes(s) || 
      p.category_name.toLowerCase().includes(s)
    ).slice(0, 50)
  }, [allProducts, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-left text-xs shadow-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
          !selectedProduct && "text-muted-foreground",
          triggerClassName
        )}
      >
        {selectedProduct ? (
          <div className="flex w-full items-center justify-between pr-1">
            <span className="truncate font-medium">{selectedProduct.name}</span>
            <span className="ml-2 shrink-0 text-2xs text-muted-foreground">{selectedProduct.category_name}</span>
          </div>
        ) : (
          <span>{displayPlaceholder}</span>
        )}
        <Search size={12} className="ml-2 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent 
        className="z-[100] flex max-h-[300px] w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden border border-border bg-popover p-0 shadow-md" 
        align="start"
        sideOffset={4}
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-popover p-2">
          <Search size={14} className="text-muted-foreground" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
            placeholder={t("productSelect.searchPlaceholder")}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="scrollbar-thin min-h-[50px] overflow-y-auto">
          {filteredProducts.length === 0 ? (
            <div className="p-4 text-center text-xs italic text-muted-foreground">{t("productSelect.empty")}</div>
          ) : (
            filteredProducts.map(product => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  onSelect(product.id);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "group flex w-full items-center justify-between px-3 py-2.5 text-left text-xs transition-all hover:bg-muted",
                  value === product.id && "bg-primary/10"
                )}
              >
                <div className="flex min-w-0 flex-col pr-2">
                  <span className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                    {product.name}
                  </span>
                  <span className="text-2xs italic text-muted-foreground">
                    {product.category_name}
                  </span>
                </div>
                {value === product.id && <Check size={14} className="shrink-0 text-primary" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
