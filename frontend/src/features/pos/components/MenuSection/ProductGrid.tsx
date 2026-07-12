"use client";

import { memo, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/pos";
import type { PosStockTrackingMode } from "../ui/ProductCard";
import { ProductCard } from "./ProductCard";

const MENU_PRODUCT_ROW_ESTIMATE_PX = 356;

interface ProductGridProps {
  filteredProducts: Product[];
  selectedCategory: string | null;
  gridCols: number;
  stockTrackingMode: PosStockTrackingMode;
  handleProductClick: (product: Product) => void;
  qtyByProductId: Record<string, number>;
  layout: "pos" | "waiter";
  activeCategoryColor?: string;
}

const ProductGrid = memo(function ProductGrid({
  filteredProducts,
  selectedCategory,
  gridCols,
  stockTrackingMode,
  handleProductClick,
  qtyByProductId,
  layout,
  activeCategoryColor,
}: ProductGridProps) {
  const tMenu = useTranslations("pos.menu");
  const productsScrollRef = useRef<HTMLDivElement>(null);

  const rowCount =
    filteredProducts.length > 0 ? Math.ceil(filteredProducts.length / gridCols) : 0;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => productsScrollRef.current,
    estimateSize: () => MENU_PRODUCT_ROW_ESTIMATE_PX,
    overscan: 3,
  });

  useEffect(() => {
    productsScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedCategory]);

  return (
    <div
      ref={productsScrollRef}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 transition-colors duration-300 sm:p-5",
        layout === "waiter" && "pb-24 max-lg:pb-28 lg:pb-5"
      )}
      style={{
        backgroundColor: activeCategoryColor ? `${activeCategoryColor}08` : "transparent",
      }}
    >
      {filteredProducts.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground dark:text-muted-foreground">
          {tMenu("noProducts")}
        </div>
      ) : (
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * gridCols;
            const slice = filteredProducts.slice(start, start + gridCols);
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full pb-4"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className={`grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4`}
                  style={{
                    gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                  }}
                >
                  {slice.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      stockTrackingMode={stockTrackingMode}
                      onAddToCart={handleProductClick}
                      orderedQty={layout === "waiter" ? qtyByProductId[p.id] : undefined}
                      layout={layout}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export { ProductGrid };
