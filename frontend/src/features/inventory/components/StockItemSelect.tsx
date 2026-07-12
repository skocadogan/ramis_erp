"use client"

import React, { useEffect, useMemo, useRef, useState, useDeferredValue } from "react"
import { Search, Loader2, Check } from "lucide-react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { StockItem } from "@/features/inventory/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useDebounce } from "@/hooks/useDebounce"

interface StockItemSelectProps {
  value: string
  onSelect: (item: StockItem) => void
  disabled?: boolean
  /** When set, list is scoped to this warehouse (depo stok seviyeleri). */
  warehouseId?: string
  /** Taslak satırından gelen özet — bu id için tek tek getStockItem çağrısı yapılmaz */
  prefetchedLabel?: { id: string; name: string; sku: string } | null
}

export default function StockItemSelect({
  value,
  onSelect,
  disabled,
  warehouseId,
  prefetchedLabel,
}: StockItemSelectProps) {
  const t = useTranslations("inventory.stockSelect")
  const mountRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  /** Sanal tablo + transform ile kayınca Popover tetikleyiciden kopup yanlış yerde görünmesin */
  useEffect(() => {
    const scrollRoot = mountRef.current?.closest<HTMLElement>("[data-scroll-close-popover]")
    if (!scrollRoot) return
    const onScroll = () => setOpen(false)
    scrollRoot.addEventListener("scroll", onScroll, { passive: true })
    return () => scrollRoot.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
    setSearch("")
  }, [warehouseId])
  const debouncedSearch = useDebounce(search, 300)
  const deferredSearch = useDeferredValue(debouncedSearch)

  const skipDetailFetch = Boolean(
    value && prefetchedLabel && prefetchedLabel.id === value,
  )

  // Seçili ürünü getir (Cache'den veya API'dan); taslak etiketi varsa ayrı GET yok
  const { data: selectedItem } = useQuery({
    queryKey: ["stock-items", value],
    queryFn: () => inventoryApi.getStockItem(value),
    enabled: !!value && !skipDetailFetch,
    staleTime: 1000 * 60 * 5, // 5 dakika cache
  })

  const displayItem = useMemo((): StockItem | null => {
    if (skipDetailFetch && prefetchedLabel && prefetchedLabel.id === value) {
      return {
        id: prefetchedLabel.id,
        name: prefetchedLabel.name,
        sku: prefetchedLabel.sku,
        barcode: "",
        unit: "",
        current_quantity: 0,
        minimum_quantity: 0,
        last_purchase_price: 0,
        is_low_stock: false,
        category: "",
        category_name: "",
        category_code: "",
      }
    }
    return selectedItem ?? null
  }, [skipDetailFetch, prefetchedLabel, value, selectedItem])

  // Arama sonuçlarını getir
  const { data: searchResults, isFetching: searchLoading } = useQuery({
    queryKey: ["stock-items", "search", warehouseId ?? null, deferredSearch],
    queryFn: () =>
      inventoryApi.getStockItems({
        search: deferredSearch,
        page_size: 20,
        warehouse_id: warehouseId || undefined,
      }),
    enabled: open && (!warehouseId || Boolean(warehouseId)),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always",
  })

  const items = searchResults?.results || []

  return (
    <div ref={mountRef} className="w-full min-w-0">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="mt-1 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
      >
        {displayItem ? (
          <div className="flex justify-between w-full pr-2">
            <span className="truncate font-ui-medium text-foreground">{displayItem.name}</span>
            <span className="text-2xs text-muted-foreground font-mono ml-2 shrink-0">{displayItem.sku}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">{t("placeholder")}</span>
        )}
        <Search size={14} className="text-muted-foreground shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        className="flex max-h-[300px] w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden border border-border bg-background p-0 shadow-md"
        align="start"
      >
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Search size={14} className="text-muted-foreground" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm focus:outline-none text-foreground"
            placeholder={t("searchPh")}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {searchLoading && <Loader2 size={14} className="animate-spin text-blue-500" />}
        </div>
        <div className="overflow-auto min-h-[50px]">
          {items.length === 0 && !searchLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">{t("notFound")}</div>
          ) : (
            items.map(item => (
              <button
                key={item.id}
                type="button"
                  onClick={() => {
                  onSelect(item)
                  setOpen(false)
                  setSearch("")
                }}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-ui-medium text-foreground">{item.name}</span>
                  <span className="text-2xs text-muted-foreground">
                    {warehouseId && item.current_quantity != null
                      ? t("availableQty", {
                          qty: item.current_quantity,
                          unit: item.unit || "",
                        })
                      : item.category_name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono text-muted-foreground">{item.sku}</span>
                  {(displayItem?.id === item.id || value === item.id) && (
                    <Check size={14} className="text-blue-500" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
    </div>
  )
}
