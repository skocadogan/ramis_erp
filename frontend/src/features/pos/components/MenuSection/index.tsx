"use client";

import { memo, useState, useMemo, useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTranslations } from "next-intl";
import { usePosStore } from "@/store/usePosStore";
import type { CartAddResult } from "@/store/posCartLogic";
import { ChevronLeft } from "lucide-react";
import { ProductOptionsModal, type ProductOptionsSelectionState } from "../ProductOptionsModal";
import { buildDisplayOptionsModalPayload } from "@/features/pos/utils/displayOptionsModal";
import type { Product, Category } from "@/types/pos";
import { usePosCategories } from "@/features/pos/hooks/usePosCategories";
import { usePosProducts } from "@/features/pos/hooks/usePosProducts";
import { usePosTables, usePosZones } from "@/features/pos/hooks/usePosTables";
import { useWaiterTableOrderedQtys } from "@/features/pos/hooks/useWaiterTableOrderedQtys";
import { useMatchMedia } from "@/hooks/useMatchMedia";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CategorySidebar } from "./CategorySidebar";
import { ProductGrid } from "./ProductGrid";
import {
  isValidPosCategorySelection,
  resolveDefaultPosCategory,
} from "@/features/pos/lib/resolveDefaultPosCategory";

/** Verilen kategori ve onun tüm alt kategorilerinin ID'lerini içeren Set döndürür. */
function getAllDescendantIds(catId: string, categories: Category[]): Set<string> {
  const ids = new Set<string>([catId])
  for (const c of categories) {
    if (c.parent === catId) {
      const childIds = getAllDescendantIds(c.id, categories)
      childIds.forEach((id) => ids.add(id))
    }
  }
  return ids
}

function tableHeadingTitle(name: string, tFunc: (key: string, values?: Record<string, string | number>) => string): string {
  const t = name.trim();
  if (/^masa\b/i.test(t)) return t;
  return tFunc("tablePrefix", { name: t });
}

interface MenuSectionProps {
  layout?: "pos" | "waiter";
}

const MenuSection = memo(function MenuSection({ layout = "pos" }: MenuSectionProps) {
  const tMenu = useTranslations("pos.menu");
  const tTableLabels = useTranslations("pos.table");
  const bid = usePosStore((s) => s.activeBranchId);
  const stockTrackingMode = usePosStore((s) => s.stockTrackingMode);
  const selectedTableStore = usePosStore((s) => s.selectedTable);
  const selectedTableId = selectedTableStore?.id;

  const { data: categories = [] } = usePosCategories({ branchId: bid });
  const { data: products = [] } = usePosProducts({ branchId: bid });
  // Yalnızca seçili masa — diğer masa WS güncellemeleri menü grid'ini yeniden çizmez
  const { data: cachedActiveTable } = usePosTables(bid ?? undefined, layout, {
    select: (tables) =>
      selectedTableId ? (tables.find((t) => t.id === selectedTableId) ?? null) : null,
  });
  const { data: zones = [] } = usePosZones({ branchId: bid ?? undefined });

  const activeTable = cachedActiveTable ?? selectedTableStore ?? null;

  const {
    setSelectedTable,
    selectedCategory,
    setSelectedCategory,
    addToCart,
    setDisplayOptionsModal,
    setDisplayAllergenModal,
    setDisplayRecommendedModal,
  } = usePosStore(
    useShallow((state) => ({
      setSelectedTable: state.setSelectedTable,
      selectedCategory: state.selectedCategory,
      setSelectedCategory: state.setSelectedCategory,
      addToCart: state.addToCart,
      setDisplayOptionsModal: state.setDisplayOptionsModal,
      setDisplayAllergenModal: state.setDisplayAllergenModal,
      setDisplayRecommendedModal: state.setDisplayRecommendedModal,
    })),
  );

  // Varsayılan: öne çıkanlar; yoksa sıra 0 ana kategori (ürünlü üst kategoriler arasında)
  useEffect(() => {
    if (!categories.length || !products.length) return;
    if (selectedCategory && isValidPosCategorySelection(selectedCategory, categories, products)) {
      return;
    }

    const defaultId = resolveDefaultPosCategory(categories, products);
    if (defaultId) setSelectedCategory(defaultId);
  }, [categories, products, selectedCategory, setSelectedCategory]);

  const featuredProducts = useMemo(
    () => products.filter((p) => p.is_featured && p.show_on_pos !== false),
    [products],
  );

  const hasFeatured = featuredProducts.length > 0;

  // Sadece üst (parent) kategoriler — parent=NULL olanlar
  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parent),
    [categories],
  );

  // Parent kategorilerden ürün barındıranları bul (alt kategoriler dahil)
  const activeParentCategories = useMemo(() => {
    return parentCategories.filter((parent) => {
      const descendantIds = getAllDescendantIds(parent.id, categories);
      return products.some(
        (p) => descendantIds.has(p.category) && p.show_on_pos !== false,
      );
    });
  }, [parentCategories, categories, products]);

  // Seçili kategorinin kök parent'ı (subcategory bar için)
  const selectedRootParent = useMemo<Category | null>(() => {
    if (!selectedCategory || selectedCategory === "FEATURED") return null;
    let catId: string | null = selectedCategory;
    let cat: Category | undefined;
    // Kök parent'a ulaşana kadar yukarı çık
    while (catId) {
      cat = categories.find((c) => c.id === catId);
      if (!cat) return null;
      catId = cat.parent ?? null;
    }
    return cat ?? null;
  }, [selectedCategory, categories]);

  // Seçili parent'ın birinci seviye alt kategorileri (subcategory bar)
  const subCategories = useMemo(() => {
    if (!selectedRootParent) return [];
    return categories.filter((c) => c.parent === selectedRootParent.id);
  }, [selectedRootParent, categories]);

  // Filtrelenmiş ürünler — seçili kategori + tüm alt kategorilerindeki ürünler
  const filteredProducts = useMemo(() => {
    if (selectedCategory === "FEATURED") return featuredProducts;
    if (!selectedCategory) return [];
    const descendantIds = getAllDescendantIds(selectedCategory, categories);
    return products.filter(
      (p) => descendantIds.has(p.category) && p.show_on_pos !== false,
    );
  }, [products, selectedCategory, categories, featuredProducts]);

  const activeCategoryColor = useMemo(() => {
    if (selectedCategory === "FEATURED") return "#f59e0b";
    return categories.find((c) => c.id === selectedCategory)?.color;
  }, [selectedCategory, categories]);

  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [cartLimitDialog, setCartLimitDialog] = useState<{
    max: number;
    added: number;
  } | null>(null);

  // "Ürün kısıtına göre" modunda (remaining_portions) sepete ekleme sınırına
  // takıldığında kullanıcıyı bilgilendir.
  const maybeShowCartLimitDialog = useCallback(
    (result: CartAddResult) => {
      if (!result.capped) return;
      if (result.maxAddable == null) return; // LIMITED olmayan ürünler
      // remaining_portions = added + maxAddable
      const max = result.added + (result.maxAddable ?? 0);
      setCartLimitDialog({ max, added: result.added });
    },
    [],
  );

  const productNeedsOptions = useCallback((product: Product) => {
    const hasUnits = (product.units?.length ?? 0) > 0;
    const hasModifiers = (product.modifier_groups?.length ?? 0) > 0;
    return hasUnits || hasModifiers;
  }, []);

  const activeOrderFingerprint = useMemo(() => {
    if (layout !== "waiter" || !activeTable) return null;
    const list =
      activeTable.active_orders && activeTable.active_orders.length > 0
        ? activeTable.active_orders
        : activeTable.active_order
          ? [activeTable.active_order]
          : [];
    if (list.length === 0) return null;
    return list
      .map((o: { id: string | number; total_amount: number }) => `${o.id}:${o.total_amount}`)
      .sort()
      .join("|");
  }, [layout, activeTable]);

  const { qtyByProductId } = useWaiterTableOrderedQtys(
    layout === "waiter",
    activeTable?.id,
    activeOrderFingerprint,
  );

  const handleBackToTables = () => {
    setSelectedTable(null);
  };

  const handleProductClick = useCallback(
    (product: Product) => {
      // SOLD_OUT ürünler sepete eklenemez.
      if (product.availability_mode === "SOLD_OUT") return;
      if (product.is_combined) {
        maybeShowCartLimitDialog(addToCart(product));
        return;
      }
      if (productNeedsOptions(product)) {
        const hasUnits = (product.units?.length ?? 0) > 0;
        setOptionsProduct(product);
        if (layout === "pos") {
          setDisplayOptionsModal(
            buildDisplayOptionsModalPayload(product, hasUnits ? "unit" : "modifiers")
          );
        }
      } else {
        maybeShowCartLimitDialog(addToCart(product));
      }
    },
    [addToCart, productNeedsOptions, setDisplayOptionsModal, maybeShowCartLimitDialog, layout],
  );

  const closeOptionsModal = useCallback(() => {
    setOptionsProduct(null);
    if (layout === "pos") {
      setDisplayOptionsModal(null);
      setDisplayAllergenModal(null);
      setDisplayRecommendedModal(null);
    }
  }, [layout, setDisplayOptionsModal, setDisplayAllergenModal, setDisplayRecommendedModal]);

  const handleOptionsSelectionChange = useCallback(
    (state: ProductOptionsSelectionState) => {
      if (!optionsProduct || layout !== "pos") return;
      setDisplayOptionsModal(
        buildDisplayOptionsModalPayload(optionsProduct, state.step, {
          selectedUnit: state.selectedUnit,
          pickedModifiers: state.pickedModifiers,
        })
      );
    },
    [layout, optionsProduct, setDisplayOptionsModal],
  );

  const isXl = useMatchMedia("(min-width: 1280px)", false);
  const isLg = useMatchMedia("(min-width: 1024px)", false);
  const gridCols = isXl ? 4 : isLg ? 3 : 2;

  if (!activeTable) return null;

  const menuHeaderTitle =
    activeTable.virtual_kind === "new_slot"
      ? tTableLabels("newTakeawaySlot")
      : tableHeadingTitle(activeTable.name, tMenu);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border shadow-sm border-border bg-card">
      <div className="flex shrink-0 items-center justify-between border-b /50 p-4 border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToTables}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border shadow-sm transition-colors hover: hover:text-blue-600 active:scale-95 border-border bg-muted text-muted-foreground dark:hover: dark:hover:text-blue-400"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0 flex flex-col">
            <h2 className="truncate text-lg font-bold leading-tight text-foreground">
              {menuHeaderTitle}
            </h2>
            <span
              className="text-xs font-bold tracking-wide"
              style={{ color: zones.find((z) => z.id === activeTable.zone)?.color || "#10b981" }}
            >
              {activeTable.zone_name}
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <CategorySidebar
          activeCategories={activeParentCategories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          hasFeatured={hasFeatured}
          tMenu={tMenu}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Subcategory bar — seçili parent'ın alt kategorileri */}
          {subCategories.length > 0 && selectedRootParent && (
            <div className="no-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto border-b /50 px-3 py-2 border-border bg-muted/20">
              {/* "Tümü" sekmesi */}
              <button
                type="button"
                onClick={() => setSelectedCategory(selectedRootParent.id)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  selectedCategory === selectedRootParent.id
                    ? " shadow-sm bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-white/60 hover: dark:hover:/50 dark:hover:",
                )}
              >
                {tMenu("all")}
              </button>
              {subCategories.map((sub) => {
                const isActive = selectedCategory === sub.id;
                const accent = sub.color || selectedRootParent.color || "#3b82f6";
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSelectedCategory(sub.id)}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "text-white shadow-sm"
                        : "text-muted-foreground hover:bg-white/60 hover: dark:hover:/50 dark:hover:",
                    )}
                    style={
                      isActive
                        ? { backgroundColor: accent, borderColor: accent }
                        : undefined
                    }
                  >
                    {sub.name}
                  </button>
                );
              })}
            </div>
          )}

          <ProductGrid
            filteredProducts={filteredProducts}
            selectedCategory={selectedCategory}
            gridCols={gridCols}
            stockTrackingMode={stockTrackingMode}
            handleProductClick={handleProductClick}
            qtyByProductId={qtyByProductId}
            layout={layout}
            activeCategoryColor={activeCategoryColor}
          />
        </div>
      </div>

      {optionsProduct && (
        <ProductOptionsModal
          product={optionsProduct}
          syncCustomerDisplay={layout === "pos"}
          onSelectionChange={handleOptionsSelectionChange}
          onConfirm={(unit, modifiers) => {
            maybeShowCartLimitDialog(
              addToCart(optionsProduct, unit ?? undefined, modifiers),
            );
            closeOptionsModal();
          }}
          onClose={closeOptionsModal}
        />
      )}

      <AlertDialog
        open={cartLimitDialog !== null}
        onOpenChange={(open) => !open && setCartLimitDialog(null)}
      >
        <AlertDialogContent className="flex w-[min(96vw,42rem)] max-w-[min(96vw,42rem)] flex-col gap-4 overflow-hidden sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{tMenu("cartLimitTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {cartLimitDialog && cartLimitDialog.added > 0
                ? tMenu("cartLimitDescPartial", {
                    max: cartLimitDialog.max,
                    added: cartLimitDialog.added,
                  })
                : cartLimitDialog
                  ? tMenu("cartLimitDesc", { max: cartLimitDialog.max })
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setCartLimitDialog(null)}>
              {tMenu("cartLimitOk")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export { MenuSection };
