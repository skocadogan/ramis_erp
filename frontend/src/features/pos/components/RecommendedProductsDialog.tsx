"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatCurrency, AMOUNT_DISPLAY_MASK } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Product } from "@/types/pos";
import { usePosStore } from "@/store/usePosStore";
import { usePosProducts } from "@/features/pos/hooks/usePosProducts";
import {
  POS_STANDARD_UNIT,
  buildDisplayRecommendedModalPayload,
  cartQtyForRecommendation,
  posUnitDisplayPrice,
  recommendationDefaultUnitId,
  unitIdToPosUnit,
} from "@/features/pos/utils/displayRecommendedModal";

interface Props {
  sourceProduct: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout?: "pos" | "waiter";
}

export function RecommendedProductsDialog({
  sourceProduct,
  open,
  onOpenChange,
  layout = "pos",
}: Props) {
  const t = useTranslations("pos.recommended");
  const tUnit = useTranslations("pos.unit");
  const canViewAmounts = useCanViewAmounts();
  const bid = usePosStore((s) => s.activeBranchId);
  const { data: products = [] } = usePosProducts({ branchId: bid });
  const cart = usePosStore((s) => s.cart);
  const addToCart = usePosStore((s) => s.addToCart);
  const updateQuantity = usePosStore((s) => s.updateQuantity);
  const setDisplayRecommendedModal = usePosStore((s) => s.setDisplayRecommendedModal);

  const recommendations = useMemo(() => sourceProduct.recommendations ?? [], [sourceProduct.recommendations]);

  const [unitSelections, setUnitSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    for (const rec of recommendations) {
      initial[rec.product_id] = recommendationDefaultUnitId(rec);
    }
    setUnitSelections(initial);
  }, [open, recommendations]);

  const syncDisplay = useCallback(
    (selections: Record<string, string>) => {
      if (layout !== "pos") return;
      setDisplayRecommendedModal(
        buildDisplayRecommendedModalPayload(sourceProduct, cart, selections, products),
      );
    },
    [layout, sourceProduct, cart, products, setDisplayRecommendedModal],
  );

  useEffect(() => {
    if (open) syncDisplay(unitSelections);
  }, [open, unitSelections, cart, syncDisplay]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (layout === "pos") {
        setDisplayRecommendedModal(
          next
            ? buildDisplayRecommendedModalPayload(sourceProduct, cart, unitSelections, products)
            : null,
        );
      }
    },
    [onOpenChange, layout, setDisplayRecommendedModal, sourceProduct, cart, unitSelections, products],
  );

  const rows = useMemo(() => {
    return recommendations.map((rec) => {
      const catalogProduct = products.find((p) => p.id === rec.product_id);
      const unitId = unitSelections[rec.product_id] ?? recommendationDefaultUnitId(rec);
      const price = catalogProduct
        ? posUnitDisplayPrice(catalogProduct, unitId)
        : rec.discounted_price ?? rec.base_price;
      const qty = cartQtyForRecommendation(cart, rec.product_id, unitId);
      return { rec, catalogProduct, unitId, price, qty };
    });
  }, [recommendations, products, unitSelections, cart]);

  const handleAdd = (product: Product, unitId: string) => {
    const unit = unitIdToPosUnit(product, unitId);
    addToCart(product, unit ?? undefined, []);
  };

  const handleRemove = (productId: string, unitId: string) => {
    const match = cart.find((item) => {
      if (item.product.id !== productId) return false;
      const itemUnitKey = item.selectedUnit?.id ?? "base";
      const targetKey = unitId === POS_STANDARD_UNIT ? "base" : unitId;
      return itemUnitKey === targetKey && (item.selectedModifiers?.length ?? 0) === 0;
    });
    if (match) updateQuantity(match.cartId, -1);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,640px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="text-violet-500" size={18} />
            {t("dialogTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{sourceProduct.name}</p>
        </DialogHeader>

        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-2">{t("columns.product")}</th>
                <th className="pb-2 pr-2">{t("columns.unit")}</th>
                <th className="pb-2 pr-2 text-right">{t("columns.price")}</th>
                <th className="pb-2 text-right">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ rec, catalogProduct, unitId, price, qty }) => {
                const hasUnits = (catalogProduct?.units?.length ?? rec.units?.length ?? 0) > 0;
                const units = catalogProduct?.units ?? rec.units ?? [];
                return (
                  <tr key={rec.id} className="border-b border-border/60">
                    <td className="py-3 pr-2 font-medium">{rec.name}</td>
                    <td className="py-3 pr-2">
                      {hasUnits ? (
                        <select
                          value={unitId}
                          onChange={(e) => {
                            const next = { ...unitSelections, [rec.product_id]: e.target.value };
                            setUnitSelections(next);
                          }}
                          className="h-8 w-full min-w-[7rem] rounded-md border border-input bg-transparent px-2 text-xs"
                        >
                          <option value={POS_STANDARD_UNIT}>{tUnit("standard")}</option>
                          {units.map((u) => (
                            <option key={u.id ?? u.name} value={u.id ?? u.name}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-2 text-right font-mono tabular-nums">
                      {canViewAmounts ? formatCurrency(price) : AMOUNT_DISPLAY_MASK}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={!catalogProduct || qty <= 0}
                          onClick={() => handleRemove(rec.product_id, unitId)}
                          aria-label={t("decrease")}
                        >
                          <Minus size={14} />
                        </Button>
                        <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums">
                          {qty}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={!catalogProduct}
                          onClick={() => catalogProduct && handleAdd(catalogProduct, unitId)}
                          aria-label={t("increase")}
                        >
                          <Plus size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
